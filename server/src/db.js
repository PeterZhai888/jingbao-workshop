// 使用 Node 内置 SQLite（node:sqlite），零原生依赖，彻底避免 Docker 部署时原生模块编译/ABI 兼容问题
import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'))
db.exec('PRAGMA journal_mode = WAL')

/* ---------------- 建表 ---------------- */

db.exec(`
CREATE TABLE IF NOT EXISTS cards (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL CHECK (type IN ('subscription', 'trial')),
  duration_months INTEGER,              -- 订阅卡：1/3/6/12 个月
  trial_quota   INTEGER,                -- 试用卡：5/10/20 次
  status        TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'active', 'frozen', 'revoked', 'exhausted', 'expired')),
  activated_at  TEXT,                   -- 首次验证通过时间
  expires_at    TEXT,                   -- 订阅卡到期时间（从首次验证起算）
  used_today    INTEGER NOT NULL DEFAULT 0,
  total_used    INTEGER NOT NULL DEFAULT 0,
  last_used_date TEXT,                  -- 最近使用日（UTC YYYY-MM-DD，用于每日重置）
  last_used_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER,
  card_code  TEXT,
  action     TEXT NOT NULL,             -- verify / generate / rate_limit_block / ...
  detail     TEXT,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)

/* ---------------- 默认配置 ---------------- */

const DEFAULT_SETTINGS = {
  daily_limit: '50', // 付费卡每日 AI 生成次数上限（UTC 0 点重置）
}

const setSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
)
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setSetting.run(k, v)

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
}

export function setSettingValue(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value))
}

/* ---------------- 默认管理员（用户名 admin，首次启动生成随机密码并打印） ---------------- */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const check = crypto.scryptSync(password, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'))
}

const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n
if (adminCount === 0) {
  const password = 'admin' + crypto.randomBytes(4).toString('hex')
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(
    'admin',
    hashPassword(password),
  )
  console.log(`[init] 已创建默认管理员账号：admin / ${password}（请尽快在后台修改密码）`)
}

/* ---------------- 日志 ---------------- */

export function log(card, action, detail, req) {
  db.prepare(
    'INSERT INTO usage_logs (card_id, card_code, action, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    card?.id ?? null,
    card?.code ?? null,
    action,
    detail ?? null,
    req?.ip ?? null,
    req?.headers?.['user-agent']?.slice(0, 200) ?? null,
  )
}

/* ---------------- 卡密工具 ---------------- */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去除易混淆字符 I O 0 1

/** 生成 SP- + 12 位随机码（加密随机，杜绝连续序列） */
export function generateCardCode() {
  const bytes = crypto.randomBytes(12)
  let suffix = ''
  for (let i = 0; i < 12; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return `SP-${suffix}`
}

/** 服务器当前 UTC 日期（YYYY-MM-DD），每日次数重置依据 */
export function utcToday() {
  return new Date().toISOString().slice(0, 10)
}

/** 每日次数跨天重置：返回重置后的卡片行 */
export function resetDailyIfNeeded(card) {
  const today = utcToday()
  if (card.last_used_date !== today && card.used_today !== 0) {
    db.prepare('UPDATE cards SET used_today = 0, last_used_date = ? WHERE id = ?').run(today, card.id)
    card.used_today = 0
  }
  return card
}

export default db
