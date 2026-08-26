import crypto from 'node:crypto'
import db, { getSetting } from './db.js'

const TOKEN_TTL_MS = 24 * 3600 * 1000 // Token 有效期 24 小时

/**
 * Token 签名密钥：优先环境变量，否则首次启动生成并持久化到 settings 表
 */
function loadSecret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET
  let secret = getSetting('token_secret')
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run('token_secret', secret)
  }
  return secret
}
const SECRET = loadSecret()

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url')

/** 客户端指纹：IP + User-Agent 哈希 */
export function fingerprint(req) {
  const ip = req.ip || ''
  const ua = req.headers['user-agent'] || ''
  return crypto.createHash('sha256').update(`${ip}\n${ua}`).digest('hex')
}

/** 签发绑定卡密与客户端指纹的短期 Token */
export function issueToken(cardId, fp) {
  const payload = { cid: cardId, fp, exp: Date.now() + TOKEN_TTL_MS }
  const body = b64u(JSON.stringify(payload))
  return { token: `${body}.${sign(body)}`, tokenExpiresAt: payload.exp }
}

/** 校验 Token 签名与有效期，返回 payload（不校验卡密状态，那一步查库实时做） */
export function verifyToken(token) {
  if (typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
