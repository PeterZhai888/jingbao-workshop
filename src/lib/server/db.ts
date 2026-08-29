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
  const log = (msg: string) => !options?.quiet && console.error(`[db] ${msg}`);

  if (_initialized) return;
  _initialized = true;

  log('▶️ initializeDatabase() 开始...');
  log('  cwd = ' + process.cwd());
  log('  node = ' + process.version + ' arch=' + process.arch + ' platform=' + process.platform);

  // === 先做文件系统诊断 ===
  const nmDir = path.resolve(process.cwd(), 'node_modules');
  log('  node_modules/ 存在: ' + fs.existsSync(nmDir));

  const bsDirCandidates = [
    path.resolve(nmDir, 'better-sqlite3'),
    path.resolve(nmDir, '.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3'),
  ];
  for (const d of bsDirCandidates) {
    log('  检查 ' + d + ' → ' + fs.existsSync(d));
    if (fs.existsSync(d)) {
      // 列 prebuilds 目录
      const prebuildsDir = path.resolve(d, 'prebuilds');
      if (fs.existsSync(prebuildsDir)) {
        log('  prebuilds/ 内容: ' + fs.readdirSync(prebuildsDir).join(', '));
      } else {
        log('  prebuilds/ 不存在 ❌');
      }
      // 列 build/Release
      const buildDir = path.resolve(d, 'build/Release');
      if (fs.existsSync(buildDir)) {
        log('  build/Release 内容: ' + fs.readdirSync(buildDir).join(', '));
      }
    }
  }

  // === require better-sqlite3 ===
  log('🔌 正在 require("better-sqlite3")...');
  let DatabaseCtor: typeof Database;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseCtor = require('better-sqlite3');
    log('✅ require better-sqlite3 成功！');
  } catch (err) {
    log('❌ require better-sqlite3 失败: ' + (err as Error).message);
    log('   stack: ' + (err as Error).stack);
    throw err;
  }

  // === 打开 DB ===
  const resolvedDbPath = path.resolve(process.cwd(), CONFIG.DB_PATH);
  const dbDir = path.dirname(resolvedDbPath);
  log('📂 DB 路径: ' + resolvedDbPath + ' (目录: ' + dbDir + ')');

  try {
    if (!fs.existsSync(dbDir)) {
      log('  创建 DB 目录...');
      fs.mkdirSync(dbDir, { recursive: true });
    }
    log('🗄️ new Database() ...');
    _db = new DatabaseCtor(resolvedDbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    log('✅ 数据库打开成功！');
  } catch (err) {
    log('❌ 打开数据库失败: ' + (err as Error).message);
    log('   stack: ' + (err as Error).stack);
    throw err;
  }

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
/**
 * 管理后台用：关闭当前数据库连接并重置初始化标记。
 * 用于 DB 恢复（restore）时安全替换底层 .db 文件后重新初始化。
 * ⚠️ 只允许超级管理员通过 /api/admin/db/restore 调用，且此调用必须独占（无并发写入）。
 */
export function closeAndResetDatabase(): void {
  try {
    if (_backupInterval) {
      clearInterval(_backupInterval);
      _backupInterval = null;
    }
    if (_db) {
      try {
        // 先 checkpoint 刷 WAL 回主文件，确保导出/替换前文件是完整一致的
        _db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        /* 忽略 checkpoint 错误 */
      }
      _db.close();
      _db = null;
    }
  } finally {
    _initialized = false;
  }
}

/** 管理后台用：返回当前 SQLite 数据库文件的绝对路径，供备份下载/恢复替换用。PostgreSQL 模式下为 null。 */
export function getDatabaseFilePath(): string | null {
  // 仅 SQLite 才有本地文件路径；扩展 Postgres 时返回 null
  const type = (process.env.DB_TYPE || 'sqlite').toLowerCase();
  if (type !== 'sqlite') return null;
  // eslint-disable-next-line no-process-env
  return require('node:path').resolve(process.cwd(), CONFIG.DB_PATH);
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
