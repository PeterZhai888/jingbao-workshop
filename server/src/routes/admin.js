import { Router } from 'express'
import crypto from 'node:crypto'
import db, { generateCardCode, log, verifyPassword, getSetting, setSettingValue } from '../db.js'
import { getProviderConfig, PROVIDERS } from '../ai/providers.js'

const router = Router()

/* ================= 登录鉴权（验证码 + IP 锁定） ================= */

const CAPTCHA_TTL_MS = 5 * 60 * 1000
const LOCK_MS = 30 * 60 * 1000

const captchas = new Map() // captchaId -> { text, expires }
const loginFails = new Map() // ip -> { count, lockedUntil }

const ADMIN_TTL_MS = 24 * 3600 * 1000

function adminSecret() {
  // 复用数据库持久化的 token_secret（auth.js 已确保写入）
  return getSetting('token_secret')
}

function signAdminToken(username) {
  const payload = { admin: username, exp: Date.now() + ADMIN_TTL_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', adminSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function requireAdmin(req, res, next) {
  const [body, sig] = String(req.headers['x-admin-token'] || '').split('.')
  if (!body || !sig) return res.status(401).json({ message: '请先登录管理后台' })
  const expected = crypto.createHmac('sha256', adminSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: '管理会话无效，请重新登录' })
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (Date.now() > payload.exp) return res.status(401).json({ message: '管理会话已过期，请重新登录' })
    req.admin = payload.admin
    next()
  } catch {
    return res.status(401).json({ message: '管理会话无效，请重新登录' })
  }
}

/** 生成图形验证码（纯 SVG，无额外依赖） */
function makeCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let text = ''
  for (let i = 0; i < 4; i++) text += chars[crypto.randomInt(chars.length)]
  const id = crypto.randomUUID()

  const colors = ['#2563EB', '#7C3AED', '#DB2777', '#059669', '#D97706']
  const glyphs = [...text]
    .map((ch, i) => {
      const color = colors[crypto.randomInt(colors.length)]
      const rotate = crypto.randomInt(-18, 19)
      const x = 22 + i * 28 + crypto.randomInt(-4, 5)
      const y = 34 + crypto.randomInt(-3, 4)
      return `<text x="${x}" y="${y}" fill="${color}" font-size="28" font-family="monospace" font-weight="bold" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`
    })
    .join('')
  const noise = Array.from({ length: 4 }, () => {
    const c = colors[crypto.randomInt(colors.length)]
    return `<line x1="${crypto.randomInt(0, 120)}" y1="${crypto.randomInt(0, 50)}" x2="${crypto.randomInt(0, 120)}" y2="${crypto.randomInt(0, 50)}" stroke="${c}" stroke-width="1" opacity="0.4"/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="50" viewBox="0 0 130 50"><rect width="130" height="50" rx="6" fill="#F3F4F6"/>${noise}${glyphs}</svg>`
  captchas.set(id, { text, expires: Date.now() + CAPTCHA_TTL_MS })
  return { captchaId: id, svg }
}

// 定期清理过期验证码
setInterval(() => {
  const now = Date.now()
  for (const [id, c] of captchas) if (c.expires < now) captchas.delete(id)
}, 60_000).unref()

/**
 * GET /api/admin/captcha — 获取图形验证码
 */
router.get('/captcha', (req, res) => {
  res.json(makeCaptcha())
})

/**
 * POST /api/admin/login — 管理员登录
 */
router.post('/login', (req, res) => {
  const ip = req.ip
  const fails = loginFails.get(ip)
  if (fails?.lockedUntil > Date.now()) {
    const mins = Math.ceil((fails.lockedUntil - Date.now()) / 60000)
    return res.status(429).json({ message: `错误次数过多，IP 已锁定，请 ${mins} 分钟后再试` })
  }

  const { username, password, captchaId, captchaText } = req.body || {}
  const captcha = captchas.get(captchaId)
  captchas.delete(captchaId) // 一次性使用
  if (!captcha || captcha.expires < Date.now() || String(captchaText).toUpperCase() !== captcha.text) {
    return res.status(400).json({ message: '验证码错误或已过期' })
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(String(username || ''))
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    const f = loginFails.get(ip) || { count: 0, lockedUntil: 0 }
    f.count += 1
    if (f.count >= 5) {
      f.lockedUntil = Date.now() + LOCK_MS
      f.count = 0
      log(null, 'admin_login_locked', '连续错误 5 次，锁定 IP 30 分钟', req)
    }
    loginFails.set(ip, f)
    return res.status(401).json({ message: '用户名或密码错误' })
  }

  loginFails.delete(ip)
  log(null, 'admin_login', '登录成功', req)
  res.json({ adminToken: signAdminToken(user.username), username: user.username })
})

/**
 * POST /api/admin/logout — 退出登录（前端丢弃 Token 即可，此处记日志）
 */
router.post('/logout', requireAdmin, (req, res) => {
  log(null, 'admin_logout', null, req)
  res.json({ ok: true })
})

/* ================= 卡密管理 ================= */

/**
 * POST /api/admin/cards/generate — 批量生成卡密
 */
router.post('/cards/generate', requireAdmin, (req, res) => {
  const { type } = req.body || {}
  const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 500)
  let durationMonths = null
  let trialQuota = null

  if (type === 'subscription') {
    durationMonths = Number(req.body?.durationMonths)
    if (![1, 3, 6, 12].includes(durationMonths)) {
      return res.status(400).json({ message: '订阅时长仅支持 1/3/6/12 个月' })
    }
  } else if (type === 'trial') {
    trialQuota = Number(req.body?.trialQuota)
    if (![5, 10, 20].includes(trialQuota)) {
      return res.status(400).json({ message: '试用次数仅支持 5/10/20 次' })
    }
  } else {
    return res.status(400).json({ message: 'type 必须为 subscription 或 trial' })
  }

  const insert = db.prepare(
    'INSERT INTO cards (code, type, duration_months, trial_quota) VALUES (?, ?, ?, ?)',
  )
  const codes = []
  db.exec('BEGIN')
  try {
    for (let i = 0; i < count; i++) {
      let code
      do {
        code = generateCardCode()
      } while (db.prepare('SELECT 1 FROM cards WHERE code = ?').get(code))
      insert.run(code, type, durationMonths, trialQuota)
      codes.push(code)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(null, 'admin_generate', `生成 ${count} 张 ${type} 卡密`, req)
  res.json({ codes })
})

/**
 * GET /api/admin/cards — 卡密列表（状态筛选 / 关键词 / 分页）
 */
router.get('/cards', requireAdmin, (req, res) => {
  const { status, keyword, page = 1, pageSize = 20 } = req.query
  const where = []
  const params = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (keyword) {
    where.push('code LIKE ?')
    params.push(`%${String(keyword).toUpperCase()}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cards ${whereSql}`).get(...params).n
  const rows = db
    .prepare(`SELECT * FROM cards ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
  res.json({ total, page: Number(page), pageSize: Number(pageSize), cards: rows })
})

/**
 * GET /api/admin/cards/export — 导出全部卡密 CSV
 */
router.get('/cards/export', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cards ORDER BY id DESC').all()
  const header = '卡密,类型,时长(月)/次数,状态,激活时间,到期时间,今日已用,累计已用,创建时间'
  const typeText = (c) => (c.type === 'subscription' ? `订阅${c.duration_months}个月` : `试用${c.trial_quota}次`)
  const lines = rows.map((c) =>
    [c.code, typeText(c), c.type === 'subscription' ? c.duration_months : c.trial_quota, c.status, c.activated_at || '', c.expires_at || '', c.used_today, c.total_used, c.created_at]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  )
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="cards-${Date.now()}.csv"`)
  // BOM 保证 Excel 正确识别 UTF-8 中文
  res.send('\uFEFF' + header + '\n' + lines.join('\n'))
})

/**
 * POST /api/admin/cards/:code/status — 作废 / 冻结 / 解冻
 */
router.post('/cards/:code/status', requireAdmin, (req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  const card = db.prepare('SELECT * FROM cards WHERE code = ?').get(code)
  if (!card) return res.status(404).json({ message: '卡密不存在' })

  const action = req.body?.action
  const statusMap = { revoke: 'revoked', freeze: 'frozen', unfreeze: 'active' }
  if (!statusMap[action]) {
    return res.status(400).json({ message: 'action 仅支持 revoke / freeze / unfreeze' })
  }
  const newStatus = action === 'unfreeze' && !card.activated_at ? 'unused' : statusMap[action]
  db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(newStatus, card.id)
  log(card, 'admin_' + action, `状态变更为 ${newStatus}`, req)
  res.json({ code, status: newStatus })
})

/**
 * GET /api/admin/logs — 使用记录查询
 */
router.get('/logs', requireAdmin, (req, res) => {
  const { page = 1, pageSize = 50, action, keyword } = req.query
  const where = []
  const params = []
  if (action) {
    where.push('action = ?')
    params.push(action)
  }
  if (keyword) {
    where.push('card_code LIKE ?')
    params.push(`%${String(keyword).toUpperCase()}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM usage_logs ${whereSql}`).get(...params).n
  const rows = db
    .prepare(`SELECT * FROM usage_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
  res.json({ total, page: Number(page), pageSize: Number(pageSize), logs: rows })
})

/* ================= 系统配置 ================= */

/**
 * GET /api/admin/settings — 读取配置（AI 密钥脱敏返回）
 */
router.get('/settings', requireAdmin, (req, res) => {
  const { active, providers } = getProviderConfig()
  res.json({
    aiProvider: active,
    aiQps: Number(getSetting('ai_qps', 5)),
    dailyLimit: Number(getSetting('daily_limit', 50)),
    sensitiveWords: getSetting('sensitive_words', ''),
    providers: Object.fromEntries(
      Object.entries(providers).map(([id, p]) => [
        id,
        { name: p.name, baseUrl: p.baseUrl, model: p.model, hasKey: Boolean(p.apiKey) },
      ]),
    ),
  })
})

/**
 * POST /api/admin/settings — 保存配置
 * body: { aiProvider?, aiQps?, dailyLimit?, sensitiveWords?, providerKeys?: {id: {apiKey?, model?}} }
 */
router.post('/settings', requireAdmin, (req, res) => {
  const { aiProvider, aiQps, dailyLimit, sensitiveWords, providerKeys } = req.body || {}

  if (aiProvider !== undefined) {
    if (!PROVIDERS[aiProvider]) return res.status(400).json({ message: '不支持的 AI 厂商' })
    setSettingValue('ai_provider', aiProvider)
  }
  if (aiQps !== undefined) {
    const q = Number(aiQps)
    if (!(q >= 1 && q <= 50)) return res.status(400).json({ message: 'QPS 限流范围 1-50' })
    setSettingValue('ai_qps', q)
  }
  if (dailyLimit !== undefined) {
    const d = Number(dailyLimit)
    if (!(d >= 1 && d <= 10000)) return res.status(400).json({ message: '每日次数范围 1-10000' })
    setSettingValue('daily_limit', d)
  }
  if (sensitiveWords !== undefined) {
    setSettingValue('sensitive_words', String(sensitiveWords).slice(0, 5000))
  }
  if (providerKeys && typeof providerKeys === 'object') {
    const current = JSON.parse(getSetting('ai_config') || '{}')
    for (const [id, kv] of Object.entries(providerKeys)) {
      if (!PROVIDERS[id]) continue
      current[id] = current[id] || {}
      if (kv.apiKey !== undefined) current[id].apiKey = String(kv.apiKey).trim().slice(0, 200)
      if (kv.model !== undefined) current[id].model = String(kv.model).trim().slice(0, 100)
    }
    setSettingValue('ai_config', JSON.stringify(current))
  }

  log(null, 'admin_settings', '更新系统配置', req)
  res.json({ ok: true })
})

/**
 * POST /api/admin/password — 修改管理员密码
 */
router.post('/password', requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(req.admin)
  if (!user || !verifyPassword(String(oldPassword || ''), user.password_hash)) {
    return res.status(400).json({ message: '原密码错误' })
  }
  if (String(newPassword || '').length < 8) {
    return res.status(400).json({ message: '新密码至少 8 位' })
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(newPassword), salt, 32).toString('hex')
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(`${salt}:${hash}`, user.id)
  log(null, 'admin_password', '修改密码', req)
  res.json({ ok: true })
})

/**
 * GET /api/admin/stats — 后台首页统计
 */
router.get('/stats', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  res.json({
    totalCards: db.prepare('SELECT COUNT(*) n FROM cards').get().n,
    activeCards: db.prepare("SELECT COUNT(*) n FROM cards WHERE status IN ('active','unused')").get().n,
    todayGenerations: db
      .prepare("SELECT COUNT(*) n FROM usage_logs WHERE action = 'generate' AND created_at >= ?")
      .get(today + ' 00:00:00').n,
    todayVerifyFails: db
      .prepare("SELECT COUNT(*) n FROM usage_logs WHERE action = 'verify_failed' AND created_at >= ?")
      .get(today + ' 00:00:00').n,
  })
})

export default router
