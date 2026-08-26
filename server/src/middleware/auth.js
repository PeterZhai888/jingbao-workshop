import db, { getSetting, resetDailyIfNeeded, utcToday, log } from '../db.js'
import { fingerprint, verifyToken } from '../auth.js'

/* ---------------- 防刷限流（单进程内存实现） ---------------- */

const WINDOW_MS = 60 * 1000
const MAX_REQ_PER_MIN = 5
const BLOCK_MS = 10 * 60 * 1000

const rateBuckets = new Map() // cardCode -> { times: number[], blockedUntil }

/** 命中限流返回 true（并记录告警日志） */
export function hitRateLimit(card, req) {
  const now = Date.now()
  let bucket = rateBuckets.get(card.code)
  if (!bucket) {
    bucket = { times: [], blockedUntil: 0 }
    rateBuckets.set(card.code, bucket)
  }
  if (bucket.blockedUntil > now) return true

  bucket.times = bucket.times.filter((t) => now - t < WINDOW_MS)
  bucket.times.push(now)
  if (bucket.times.length > MAX_REQ_PER_MIN) {
    bucket.blockedUntil = now + BLOCK_MS
    log(card, 'rate_limit_block', `1 分钟内请求 ${bucket.times.length} 次，临时限制 ${BLOCK_MS / 60000} 分钟`, req)
    return true
  }
  return false
}

/* ---------------- 卡密状态校验（每次请求实时查库） ---------------- */

/**
 * 统一校验卡密可用性。
 * 返回 { ok, card, error } — error 为可直接返回给用户的中文提示。
 */
export function checkCard(card, req) {
  if (!card) return { ok: false, error: '卡密不存在，请检查后重输' }
  if (card.status === 'revoked') return { ok: false, error: '卡密已作废，请联系管理员' }
  if (card.status === 'frozen') return { ok: false, error: '卡密已被冻结，请联系管理员' }

  card = resetDailyIfNeeded(card)

  if (card.type === 'trial') {
    if (card.total_used >= card.trial_quota) {
      return { ok: false, error: '试用次数已用完，卡密已失效' }
    }
  } else {
    if (card.activated_at && card.expires_at && Date.now() > new Date(card.expires_at + 'Z').getTime()) {
      db.prepare("UPDATE cards SET status = 'expired' WHERE id = ?").run(card.id)
      return { ok: false, error: '卡密已过期，如需继续使用请续费' }
    }
    const dailyLimit = Number(getSetting('daily_limit', 50))
    if (card.used_today >= dailyLimit) {
      return { ok: false, error: `今日生成次数已用完（每日 UTC 0 点重置，当前上限 ${dailyLimit} 次）` }
    }
  }
  return { ok: true, card }
}

/* ---------------- Token 鉴权中间件 ---------------- */

export function requireToken(req, res, next) {
  const token = req.headers['x-auth-token']
  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ message: '会话已过期，请重新验证卡密' })
  }

  // 指纹校验：IP / UA 异常变更时要求重新验证
  if (payload.fp !== fingerprint(req)) {
    return res.status(401).json({ message: '检测到网络环境变化，请重新验证卡密' })
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(payload.cid)
  const check = checkCard(card, req)
  if (!check.ok) {
    return res.status(403).json({ message: check.error })
  }
  if (hitRateLimit(check.card, req)) {
    return res.status(429).json({ message: '请求过于频繁，请稍后再试' })
  }

  req.card = check.card
  next()
}

/* ---------------- 次数扣减 ---------------- */

export function deductUsage(card, req) {
  const today = utcToday()
  db.prepare(
    `UPDATE cards
     SET used_today = used_today + 1,
         total_used = total_used + 1,
         last_used_date = ?,
         last_used_at = datetime('now')
     WHERE id = ?`,
  ).run(today, card.id)

  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id)
  if (updated.type === 'trial' && updated.total_used >= updated.trial_quota) {
    db.prepare("UPDATE cards SET status = 'exhausted' WHERE id = ?").run(updated.id)
  }
  log(updated, 'generate', `剩余今日 ${updated.used_today}/${getSetting('daily_limit')} 次`, req)
  return {
    usedToday: updated.used_today,
    remainingTrials:
      updated.type === 'trial' ? Math.max(0, updated.trial_quota - updated.total_used) : null,
  }
}

/** 组装返回给前端的卡密信息 */
export function cardInfo(card) {
  return {
    code: card.code,
    type: card.type,
    dailyLimit: card.type === 'subscription' ? Number(getSetting('daily_limit', 50)) : null,
    usedToday: card.used_today,
    remainingTrials:
      card.type === 'trial' ? Math.max(0, card.trial_quota - card.total_used) : null,
    expiresAt: card.expires_at,
  }
}
