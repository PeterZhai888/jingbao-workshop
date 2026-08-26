import { Router } from 'express'
import crypto from 'node:crypto'
import db, { generateCardCode, log } from '../db.js'

const router = Router()

/**
 * 管理接口鉴权（阶段 2：静态 Token；阶段 3 将升级为后台登录会话）
 * Token 来源：环境变量 ADMIN_TOKEN，或首次启动自动生成并打印到控制台
 */
let ADMIN_TOKEN = process.env.ADMIN_TOKEN
if (!ADMIN_TOKEN) {
  ADMIN_TOKEN = crypto.randomBytes(16).toString('hex')
  console.log(`[init] 阶段2管理接口 Token（请求头 X-Admin-Token）：${ADMIN_TOKEN}`)
}

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ message: '管理员鉴权失败' })
  }
  next()
}

router.use(requireAdmin)

/**
 * POST /api/admin/cards/generate — 批量生成卡密
 * body: { type: 'subscription'|'trial', durationMonths?, trialQuota?, count? }
 */
router.post('/cards/generate', (req, res) => {
  const { type } = req.body || {}
  const count = Math.min(Number(req.body?.count) || 1, 500)
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
  const txn = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      let code
      do {
        code = generateCardCode()
      } while (db.prepare('SELECT 1 FROM cards WHERE code = ?').get(code))
      insert.run(code, type, durationMonths, trialQuota)
      codes.push(code)
    }
  })
  txn()
  log(null, 'admin_generate', `生成 ${count} 张 ${type} 卡密`, req)
  res.json({ codes })
})

/**
 * GET /api/admin/cards — 卡密列表（支持状态筛选与关键词搜索）
 */
router.get('/cards', (req, res) => {
  const { status, keyword, page = 1, pageSize = 20 } = req.query
  const where = []
  const params = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (keyword) {
    where.push('code LIKE ?')
    params.push(`%${keyword.toUpperCase()}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cards ${whereSql}`).get(...params).n
  const rows = db
    .prepare(
      `SELECT * FROM cards ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
  res.json({ total, page: Number(page), pageSize: Number(pageSize), cards: rows })
})

/**
 * POST /api/admin/cards/:code/status — 手动作废 / 冻结 / 恢复
 * body: { action: 'revoke' | 'freeze' | 'unfreeze' }
 */
router.post('/cards/:code/status', (req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  const card = db.prepare('SELECT * FROM cards WHERE code = ?').get(code)
  if (!card) return res.status(404).json({ message: '卡密不存在' })

  const action = req.body?.action
  const statusMap = { revoke: 'revoked', freeze: 'frozen', unfreeze: 'active' }
  if (!statusMap[action]) {
    return res.status(400).json({ message: 'action 仅支持 revoke / freeze / unfreeze' })
  }
  // 未激活卡直接冻结/恢复时保持 unused 语义
  const newStatus =
    action === 'unfreeze' && !card.activated_at ? 'unused' : statusMap[action]
  db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(newStatus, card.id)
  log(card, 'admin_' + action, `状态变更为 ${newStatus}`, req)
  res.json({ code, status: newStatus })
})

/**
 * GET /api/admin/logs — 使用记录查询
 */
router.get('/logs', (req, res) => {
  const { page = 1, pageSize = 50, action } = req.query
  const where = action ? 'WHERE action = ?' : ''
  const params = action ? [action] : []
  const total = db.prepare(`SELECT COUNT(*) AS n FROM usage_logs ${where}`).get(...params).n
  const rows = db
    .prepare(`SELECT * FROM usage_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
  res.json({ total, page: Number(page), pageSize: Number(pageSize), logs: rows })
})

export default router
