import { Router } from 'express'
import { requireToken, deductUsage } from '../middleware/auth.js'
import { checkInput, checkOutput } from '../middleware/sensitive.js'
import { callAI } from '../ai/providers.js'
import { storyboardMessages, titleMessages, extractJSON } from '../ai/prompts.js'

const router = Router()

/**
 * AI 生成接口：
 * - 已配置密钥 → 调用真实 AI（超时重试 / QPS 限流 / 敏感词双向过滤）
 * - 未配置密钥 → 返回模拟数据（保证部署后即可体验完整流程）
 */

const MOVES = ['固定镜头', '推镜头', '拉镜头', '摇镜头', '跟随镜头', '特写', '航拍俯瞰']

function mockStoryboard(text, count) {
  const lines = String(text)
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const base = lines.length ? lines : ['（补充画面描述）']
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    visual: `画面：${base[i % base.length].slice(0, 40)}（配示意素材）`,
    narration: base[i % base.length],
    duration: `${2 + (i % 4)} 秒`,
    camera: MOVES[i % MOVES.length],
  }))
}

function mockTitles(topic) {
  const t = String(topic).slice(0, 12)
  return [
    `${t}的3个隐藏技巧，第2个99%的人都不知道`,
    `看完这条视频，你会重新认识${t}`,
    `别再瞎忙了！${t}的正确打开方式`,
    `我用了30天才搞懂${t}，你3分钟就能学会`,
    `${t}避坑指南：新手最容易踩的5个雷`,
    `为什么你的${t}没效果？问题出在这里`,
    `一条视频讲透${t}，建议收藏反复看`,
    `${t}天花板玩法，最后一个太绝了`,
    `月薪3千和3万的人做${t}，差距在哪？`,
    `不看后悔系列：${t}保姆级教程`,
  ]
}

/** POST /api/ai/storyboard — 文案分镜拆解 */
router.post('/storyboard', requireToken, async (req, res) => {
  const text = String(req.body?.text || '').trim()
  const count = Math.min(Math.max(Number(req.body?.count) || 6, 3), 15)
  if (text.length < 10) {
    return res.status(400).json({ message: '文案内容太短啦，至少输入 10 个字' })
  }
  if (text.length > 5000) {
    return res.status(400).json({ message: '文案内容过长，请控制在 5000 字以内' })
  }

  const inputCheck = checkInput(text, req)
  if (!inputCheck.ok) return res.status(400).json({ message: inputCheck.message })

  const result = await callAI(storyboardMessages(text, count))
  if (!result.ok) {
    if (result.noKey) {
      // 未配置 AI 密钥：返回模拟数据，保证产品可用
      const usage = deductUsage(req.card, req)
      return res.json({ shots: mockStoryboard(text, count), usage, mock: true })
    }
    return res.status(503).json({ message: result.content })
  }

  const outputCheck = checkOutput(result.content, req)
  if (!outputCheck.ok) return res.status(400).json({ message: outputCheck.message })

  let shots = extractJSON(result.content)
  if (!Array.isArray(shots)) {
    return res.status(503).json({ message: 'AI 服务繁忙，请稍后再试' })
  }
  shots = shots
    .filter((s) => s && typeof s === 'object')
    .slice(0, count)
    .map((s, i) => ({
      index: Number(s.index) || i + 1,
      visual: String(s.visual || '').slice(0, 200),
      narration: String(s.narration || '').slice(0, 500),
      duration: String(s.duration || '3秒').slice(0, 20),
      camera: String(s.camera || '固定镜头').slice(0, 50),
    }))
  if (!shots.length) {
    return res.status(503).json({ message: 'AI 服务繁忙，请稍后再试' })
  }

  const usage = deductUsage(req.card, req)
  res.json({ shots, usage })
})

/** POST /api/ai/titles — 爆款标题生成 */
router.post('/titles', requireToken, async (req, res) => {
  const topic = String(req.body?.topic || '').trim()
  if (topic.length < 2) {
    return res.status(400).json({ message: '请输入视频主题，至少 2 个字' })
  }
  if (topic.length > 200) {
    return res.status(400).json({ message: '主题内容过长，请精简后重试' })
  }

  const inputCheck = checkInput(topic, req)
  if (!inputCheck.ok) return res.status(400).json({ message: inputCheck.message })

  const result = await callAI(titleMessages(topic))
  if (!result.ok) {
    if (result.noKey) {
      const usage = deductUsage(req.card, req)
      return res.json({ titles: mockTitles(topic), usage, mock: true })
    }
    return res.status(503).json({ message: result.content })
  }

  const outputCheck = checkOutput(result.content, req)
  if (!outputCheck.ok) return res.status(400).json({ message: outputCheck.message })

  let titles = extractJSON(result.content)
  if (!Array.isArray(titles)) {
    return res.status(503).json({ message: 'AI 服务繁忙，请稍后再试' })
  }
  titles = titles
    .filter((t) => typeof t === 'string' && t.trim())
    .slice(0, 10)
    .map((t) => t.trim().slice(0, 60))
  if (!titles.length) {
    return res.status(503).json({ message: 'AI 服务繁忙，请稍后再试' })
  }

  const usage = deductUsage(req.card, req)
  res.json({ titles, usage })
})

export default router
