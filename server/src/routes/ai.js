import { Router } from 'express'
import { requireToken, deductUsage } from '../middleware/auth.js'

const router = Router()

/**
 * 阶段 2：AI 生成接口（先用确定性模拟数据打通「鉴权 → 扣次数 → 返回结构化结果」全链路）
 * 阶段 3 将替换为多 AI 接口真实调用（通义/智谱/Deepseek/混元/豆包/硅基流动）。
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
router.post('/storyboard', requireToken, (req, res) => {
  const text = String(req.body?.text || '').trim()
  const count = Math.min(Math.max(Number(req.body?.count) || 6, 3), 15)
  if (text.length < 10) {
    return res.status(400).json({ message: '文案内容太短啦，至少输入 10 个字' })
  }
  if (text.length > 5000) {
    return res.status(400).json({ message: '文案内容过长，请控制在 5000 字以内' })
  }
  const usage = deductUsage(req.card, req)
  res.json({ shots: mockStoryboard(text, count), usage })
})

/** POST /api/ai/titles — 爆款标题生成 */
router.post('/titles', requireToken, (req, res) => {
  const topic = String(req.body?.topic || '').trim()
  if (topic.length < 2) {
    return res.status(400).json({ message: '请输入视频主题，至少 2 个字' })
  }
  if (topic.length > 200) {
    return res.status(400).json({ message: '主题内容过长，请精简后重试' })
  }
  const usage = deductUsage(req.card, req)
  res.json({ titles: mockTitles(topic), usage })
})

export default router
