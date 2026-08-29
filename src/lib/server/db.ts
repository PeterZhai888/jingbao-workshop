import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '@/lib/server/config';
import bcrypt from 'bcryptjs';

// ⚠️ 注意：这里**不能**在模块顶层执行 new Database() / fs.mkdir / db.exec / setTimeout 等副作用！
// Next.js Turbopack 构建阶段会 import 所有 API route（进而 import 到本文件），
// 若顶层有 I/O/副作用，会：1) 在构建器用户权限下打开真实 DB 并写入失败；2) 建默认管理员触发约束冲突。
// 因此把所有副作用都放到 initializeDatabase() 里，由 startup.js 在运行期显式调用。

/** lazy 数据库实例：在 initializeDatabase() 执行前访问会抛错（故意），保证构建期 import 不碰 DB */
let _db: Database.Database | null = null;
const getDb = (): Database.Database => {
  if (!_db) {
    throw new Error('[DB] 数据库尚未初始化，请先调用 initializeDatabase()');
  }
  return _db;
};

/** 对外导出 getter：调用方（API route / card-service）读的时候会拿实际 DB 实例 */
export const db = new Proxy<Database.Database>({} as Database.Database, {
  get(_target: unknown, prop: keyof Database.Database | symbol) {
    const instance = getDb();
    if (typeof prop === 'symbol') {
      return (instance as unknown as Record<symbol, unknown>)[prop];
    }
    const value = (instance as unknown as Record<string | number, unknown>)[prop as string];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
  ownKeys() {
    return Object.keys(getDb() as unknown as object);
  },
  getOwnPropertyDescriptor(_t, prop) {
    const inst = getDb() as unknown as Record<string | number, unknown>;
    const d = Object.getOwnPropertyDescriptor(inst, prop as string | number);
    if (d) return d;
    return { configurable: true, enumerable: true, writable: true };
  },
});

const BACKUP_KEEP_COUNT = 30;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let _backupInterval: ReturnType<typeof setInterval> | null = null;
let _initialized = false;

/**
 * 运行期调用：在启动 HTTP server 之前执行。
 *   顺序：validateRuntimeConfig (JWT) → initializeDatabase (建库建表建管理员) → 启动 server
 * @param options.quiet 构建期（比如 warmup）调用时，避免 console 输出
 */
export function initializeDatabase(options?: { quiet?: boolean }): void {
  if (_initialized) return;
  _initialized = true;

  // 动态 import（Node 20 原生支持 ESM import()，但 better-sqlite3 更稳用 require）
  // 用 require 避免在顶层 import 时就触发 C++ 原生模块加载
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DatabaseCtor: typeof Database = require('better-sqlite3');

  const resolvedDbPath = path.resolve(process.cwd(), CONFIG.DB_PATH);
  const dbDir = path.dirname(resolvedDbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  _db = new DatabaseCtor(resolvedDbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // ========= 建表 =========
  _db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'unused',
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
      action TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      ip TEXT,
      user_agent TEXT,
      fingerprint TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_logs_card_id ON usage_logs(card_id);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_card_action ON usage_logs(card_id, action, success, created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_action_time ON usage_logs(action, success, created_at);

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
      id TEXT PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      card_code TEXT NOT NULL,
      type TEXT NOT NULL,
      input_text TEXT NOT NULL,
      output_json TEXT NOT NULL,
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
  const exist = _db.prepare('SELECT id FROM admin_users WHERE username = ?').get(CONFIG.DEFAULT_ADMIN_USERNAME);
  if (!exist) {
    const hash = bcrypt.hashSync(CONFIG.DEFAULT_ADMIN_PASSWORD, 10);
    _db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(
      CONFIG.DEFAULT_ADMIN_USERNAME,
      hash,
      'superadmin',
    );
    if (!options?.quiet) {
      console.log(`[DB] 默认管理员已创建: ${CONFIG.DEFAULT_ADMIN_USERNAME} / ${CONFIG.DEFAULT_ADMIN_PASSWORD}`);
    }
  }

  // ========= 备份调度 =========
  const backupDatabase = (): void => {
    try {
      const backupDir = path.join(path.dirname(resolvedDbPath), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(backupDir, `ai-video-tool_${stamp}.db`);
      const promise = _db!.backup(backupPath);
      void promise.then(() => {
        try {
          const files = fs
            .readdirSync(backupDir)
            .filter((f) => /^ai-video-tool_.*\.db$/.test(f))
            .sort();
          while (files.length > BACKUP_KEEP_COUNT) {
            fs.unlinkSync(path.join(backupDir, files.shift()!));
          }
        } catch {
          /* ignore */
        }
      }).catch((e: unknown) => {
        console.error('[DB] 自动备份失败:', e instanceof Error ? e.message : e);
      });
    } catch (e) {
      console.error('[DB] 自动备份异常:', e instanceof Error ? e.message : e);
    }
  };

  // 30 秒后首次备份，之后每 24h 一次
  setTimeout(backupDatabase, 30_000).unref?.();
  _backupInterval = setInterval(backupDatabase, BACKUP_INTERVAL_MS);
  _backupInterval.unref?.();
}

// ========= 类型导出 =========
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
