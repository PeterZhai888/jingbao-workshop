/**
 * API 客户端
 * - 优先请求真实后端（/api/*，开发环境经 Vite 代理到 localhost:3000）
 * - 后端未启动时自动降级为 Mock 模式，方便前端独立开发调试
 */
import { getHistory, saveHistory, clearHistory } from './history.js'

const TOKEN_HEADER = 'X-Auth-Token'
const MOCK_DELAY = 1200

function getToken() {
  try {
    const raw = localStorage.getItem('ai_video_session')
    return raw ? JSON.parse(raw).token : null
  } catch {
    return null
  }
}

/** 后端不可用（网络错误或代理 502/504），用于触发 Mock 降级 */
class BackendUnavailableError extends Error {
  constructor(msg = '后端服务不可用') {
    super(msg)
    this.name = 'BackendUnavailableError'
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken()
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { [TOKEN_HEADER]: token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new BackendUnavailableError()
  }
  // 502/504：开发代理无法连上后端
  if (res.status === 502 || res.status === 504) {
    throw new BackendUnavailableError()
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || `请求失败（${res.status}）`)
    err.status = res.status
    throw err
  }
  return data
}

function isBackendUnavailable(err) {
  return err instanceof BackendUnavailableError || err instanceof TypeError
}

/* ---------------- Mock 实现（阶段1：后端未就绪时使用） ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function mockStoryboard(text, count) {
  const lines = String(text)
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const moves = ['固定镜头', '推镜头', '拉镜头', '摇镜头', '跟随镜头', '特写', '航拍俯瞰']
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    visual: lines[i % Math.max(lines.length, 1)]
      ? `画面：${lines[i % lines.length].slice(0, 40)}…（配示意图/实拍素材）`
      : `画面：补充过渡镜头，展示主题相关场景`,
    narration: lines[i % Math.max(lines.length, 1)] || '补充旁白过渡语',
    duration: `${2 + (i % 4)} 秒`,
    camera: moves[i % moves.length],
  }))
}

function mockTitles(topic) {
  const t = String(topic).slice(0, 12)
  const templates = [
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
  return templates
}

/* ---------------- 对外 API ---------------- */

/** 验证卡密，成功返回 { token, card } */
export async function verifyCard(code) {
  try {
    return await request('/card/verify', { method: 'POST', body: { code } })
  } catch (err) {
    // 后端未启动 → Mock 降级
    if (isBackendUnavailable(err)) {
      await sleep(MOCK_DELAY)
      if (!/^SP-[A-Z0-9]{12}$/i.test(code.trim())) {
        throw new Error('卡密格式不正确，请检查后重输')
      }
      const now = Date.now()
      return {
        token: 'mock-token-' + now,
        tokenExpiresAt: now + 24 * 3600 * 1000,
        card: {
          code: code.trim().toUpperCase(),
          type: 'subscription',
          dailyLimit: 50,
          usedToday: 0,
          remainingTrials: null,
        },
      }
    }
    throw err
  }
}

/** 生成分镜脚本 */
export async function generateStoryboard(text, count) {
  let result
  try {
    result = await request('/ai/storyboard', {
      method: 'POST',
      body: { text, count },
    })
  } catch (err) {
    if (isBackendUnavailable(err)) {
      await sleep(MOCK_DELAY)
      result = { shots: mockStoryboard(text, count), usage: null }
    } else {
      throw err
    }
  }
  saveHistory({
    type: 'storyboard',
    input: String(text).slice(0, 100),
    output: result.shots,
    count,
  })
  return result
}

/** 生成爆款标题 */
export async function generateTitles(topic) {
  let result
  try {
    result = await request('/ai/titles', { method: 'POST', body: { topic } })
  } catch (err) {
    if (isBackendUnavailable(err)) {
      await sleep(MOCK_DELAY)
      result = { titles: mockTitles(topic), usage: null }
    } else {
      throw err
    }
  }
  saveHistory({
    type: 'titles',
    input: String(topic).slice(0, 100),
    output: result.titles,
  })
  return result
}

export { getHistory, clearHistory }
