import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '@/lib/server/config';
import bcrypt from 'bcryptjs';

// 确保数据库目录存在
const dbDir = path.dirname(path.resolve(process.cwd(), CONFIG.DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.resolve(process.cwd(), CONFIG.DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========= 建表 =========
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',  -- unused/active/frozen/revoked/expired
    valid_days INTEGER NOT NULL DEFAULT 30,
    daily_limit INTEGER NOT NULL DEFAULT 20,
    activated_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    last_ip TEXT,
    last_fingerprint TEXT,
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
    card_code TEXT NOT NULL,
    action TEXT NOT NULL,           -- verify/storyboard/titles/admin_xxx
    success INTEGER NOT NULL DEFAULT 1,
    ip TEXT,
    user_agent TEXT,
    fingerprint TEXT,
    detail TEXT,                    -- JSON 或说明
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_usage_logs_card_id ON usage_logs(card_id);
  CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    last_login_at TEXT,
    last_login_ip TEXT,
    login_fail_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS generated_history (
    id TEXT PRIMARY KEY,          -- 前端用的 id
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    card_code TEXT NOT NULL,
    type TEXT NOT NULL,             -- storyboard / titles
    input_text TEXT NOT NULL,
    output_json TEXT NOT NULL,      -- 存储结果 JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_history_card_id ON generated_history(card_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ========= 初始化默认管理员（如不存在） =========
{
  const exist = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(CONFIG.DEFAULT_ADMIN_USERNAME);
  if (!exist) {
    const hash = bcrypt.hashSync(CONFIG.DEFAULT_ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(
      CONFIG.DEFAULT_ADMIN_USERNAME,
      hash,
      'superadmin',
    );
    console.log(`[DB] 默认管理员已创建: ${CONFIG.DEFAULT_ADMIN_USERNAME} / ${CONFIG.DEFAULT_ADMIN_PASSWORD}`);
  }
}

export type CardStatus = 'unused' | 'active' | 'frozen' | 'revoked' | 'expired';

export interface CardRow {
  id: number;
  code: string;
  status: CardStatus;
  valid_days: number;
  daily_limit: number;
  activated_at: string | null;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  last_ip: string | null;
  last_fingerprint: string | null;
  remark: string | null;
}

export interface UsageLogRow {
  id: number;
  card_id: number | null;
  card_code: string;
  action: string;
  success: number;
  ip: string | null;
  user_agent: string | null;
  fingerprint: string | null;
  detail: string | null;
  created_at: string;
}

export { db };
