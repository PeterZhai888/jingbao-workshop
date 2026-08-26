import db, { getSetting } from '../db.js'

/**
 * 六家 AI 厂商均提供 OpenAI 兼容接口，统一用 chat/completions 协议接入。
 * 密钥与模型在管理后台「系统配置」中填写，存于 settings 表。
 */

export const PROVIDERS = {
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
  },
  zhipu: {
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
  },
  deepseek: {
    name: 'Deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  hunyuan: {
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hunyuan-turbos-latest',
  },
  doubao: {
    name: '豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
  },
  siliconflow: {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
  },
}

/** 读取某厂商配置（apiKey / model 覆盖） */
export function getProviderConfig(id) {
  const raw = getSetting('ai_config')
  const config = raw ? JSON.parse(raw) : {}
  const merged = {}
  for (const [pid, pc] of Object.entries(PROVIDERS)) {
    const saved = config[pid] || {}
    merged[pid] = {
      ...pc,
      apiKey: saved.apiKey || '',
      model: saved.model || pc.defaultModel,
    }
  }
  return { active: getSetting('ai_provider', 'zhipu'), providers: merged }
}

/* ---------------- 全局 QPS 限流（令牌桶） ---------------- */

const qpsState = { tokens: 5, lastRefill: Date.now() }

function acquireQps() {
  const limit = Number(getSetting('ai_qps', 5))
  const now = Date.now()
  const refill = ((now - qpsState.lastRefill) / 1000) * limit
  qpsState.tokens = Math.min(limit, qpsState.tokens + refill)
  qpsState.lastRefill = now
  if (qpsState.tokens < 1) return false
  qpsState.tokens -= 1
  return true
}

/* ---------------- 统一调用（超时重试 + 友好降级） ---------------- */

const TIMEOUT_MS = 60_000
const MAX_RETRIES = 2

async function callOnce(cfg, messages) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.7,
      }),
    })
    if (res.status >= 500) throw new Error(`upstream_${res.status}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      // 密钥类错误不重试，直接抛出可读信息
      const err = new Error(body?.error?.message || `上游返回 ${res.status}`)
      err.noRetry = true
      throw err
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 调用当前生效厂商。
 * 返回 { ok, content } — 失败时 ok=false，content 为面向用户的提示（不暴露底层细节）
 */
export async function callAI(messages) {
  const { active, providers } = getProviderConfig()
  const cfg = providers[active] || providers.zhipu

  if (!cfg.apiKey) {
    return { ok: false, noKey: true }
  }
  if (!acquireQps()) {
    return { ok: false, content: '当前使用人数较多，请稍等几秒再试' }
  }

  let lastErr = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callOnce(cfg, messages)
      return { ok: true, content }
    } catch (err) {
      lastErr = err
      if (err.noRetry) break
      // 超时 / 5xx → 重试（最多 2 次）
    }
  }
  console.error('[ai] 调用失败:', lastErr?.message)
  return { ok: false, content: 'AI 服务繁忙，请稍后再试' }
}
