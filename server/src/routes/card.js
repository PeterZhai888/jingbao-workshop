import { Router } from 'express'
import db, { log, resetDailyIfNeeded } from '../db.js'
import { fingerprint, issueToken } from '../auth.js'
import { requireToken, checkCard, cardInfo, hitRateLimit } from '../middleware/auth.js'

const router = Router()

/** 卡密格式：SP- + 12 位大写字母数字（去除易混淆字符 I O 0 1） */
const CODE_RE = /^SP-[A-HJ-NP-Z2-9]{12}$/

/**
 * POST /api/card/verify — 卡密验证（首次验证即激活，并起算订阅有效期）
 */
router.post('/verify', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ message: '卡密格式不正确，示例：SP-A3K9M2X7P5Q1' })
  }

  const card = db.prepare('SELECT * FROM cards WHERE code = ?').get(code)
  const check = checkCard(card, req)
  if (!check.ok) {
    log(card, 'verify_failed', check.error, req)
    return res.status(403).json({ message: check.error })
  }

  let c = check.card

  // 首次验证：激活并起算订阅有效期（按 duration_months 个月折算天数）
  if (!c.activated_at) {
    let expiresAt = null
    if (c.type === 'subscription') {
      expiresAt = new Date(Date.now() + c.duration_months * 30 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')
    }
    db.prepare(
      "UPDATE cards SET status = 'active', activated_at = datetime('now'), expires_at = ? WHERE id = ?",
    ).run(expiresAt, c.id)
    c = db.prepare('SELECT * FROM cards WHERE id = ?').get(c.id)
  }

  if (hitRateLimit(c, req)) {
    return res.status(429).json({ message: '请求过于频繁，请稍后再试' })
  }

  const { token, tokenExpiresAt } = issueToken(c.id, fingerprint(req))
  log(c, 'verify', '验证成功', req)
  res.json({ token, tokenExpiresAt, card: cardInfo(c) })
})

/**
 * GET /api/card/me — 查询当前卡密状态与用量
 */
router.get('/me', requireToken, (req, res) => {
  const c = resetDailyIfNeeded(req.card)
  res.json({ card: cardInfo(c) })
})

export default router
