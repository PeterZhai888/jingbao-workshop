import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  closeAndResetDatabase,
  db,
  getDatabaseFilePath,
  initializeDatabase,
} from '@/lib/server/db';
import type Database from 'better-sqlite3';

// SQLite 3 数据库文件头 16 字节 magic，严格校验防止用户上传错文件
const SQLITE3_MAGIC = Buffer.from('SQLite format 3\0');
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512MB，对单机 SQLite 已经超大

/**
 * 管理后台一键恢复 SQLite 数据库：
 *   1) 校验超级管理员登录
 *   2) multipart/form-data 接收上传的 .db 文件
 *   3) 校验文件头是 "SQLite format 3\0"
 *   4) 校验基本表结构（必须包含 cards/admin_users/system_config 三张表）
 *   5) 刷 WAL → 关闭 DB → 自动备份当前 DB 到同目录 backups/restore_before_*.db → 用上传文件覆盖
 *   6) 重新打开 DB 并初始化
 * 仅 SQLite 模式支持；PostgreSQL 返回 400。
 */
export async function POST(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  const dbPath = getDatabaseFilePath();
  if (!dbPath) {
    return NextResponse.json(
      { success: false, error: '当前使用外部数据库（PostgreSQL 等），请在数据库服务商控制台恢复。' },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误，需要 multipart/form-data' }, { status: 400 });
  }
  const file = form.get('db_file') as File | null;
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ success: false, error: '缺少字段 db_file（上传 .db 文件）' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: `数据库文件过大：${file.size} 字节，上限 ${MAX_UPLOAD_BYTES}` },
      { status: 413 },
    );
  }
  if (file.size < SQLITE3_MAGIC.length) {
    return NextResponse.json({ success: false, error: '文件过小，不是有效的 SQLite 数据库' }, { status: 400 });
  }

  let uploadBuf: Buffer;
  try {
    uploadBuf = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ success: false, error: '读取上传文件失败' }, { status: 400 });
  }

  // ① 校验 magic
  if (!uploadBuf.subarray(0, SQLITE3_MAGIC.length).equals(SQLITE3_MAGIC)) {
    return NextResponse.json(
      { success: false, error: '上传文件不是有效的 SQLite 3 数据库（文件头校验失败）' },
      { status: 400 },
    );
  }

  // ② 临时写到磁盘并用 better-sqlite3 打开校验表结构，确保是同项目的 DB
  const tmpDir = path.join(path.dirname(dbPath), 'tmp_restore');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.db`);
  try {
    fs.writeFileSync(tmpPath, uploadBuf);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DatabaseCtor: typeof Database = require('better-sqlite3');
    const probe = new DatabaseCtor(tmpPath, { readonly: true, fileMustExist: true });
    try {
      const tables = (
        probe
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cards','admin_users','system_config')",
          )
          .all() as Array<{ name: string }>
      ).map((t) => t.name);
      const missing = ['cards', 'admin_users', 'system_config'].filter((t) => !tables.includes(t));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `上传数据库缺少本项目核心表：${missing.join(', ')}，请确认是否是镜爆工坊系统导出的备份文件。`,
          },
          { status: 400 },
        );
      }
    } finally {
      probe.close();
    }
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: `上传文件无法作为 SQLite 数据库打开：${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 400 },
    );
  }

  // ③ 正式替换：先 checkpoint+关闭，再备份当前旧库，再覆盖，再打开
  closeAndResetDatabase();
  try {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // 把旧 DB 备份（如果存在）
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(backupDir, `restore_before_${stamp}.db`));
      try {
        // 顺带清理 .wal .shm 避免恢复后还在 WAL 模式残留
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
      } catch {
        /* ignore */
      }
    }
    // 正式用上传文件替换
    fs.copyFileSync(tmpPath, dbPath);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    // 无论成败，重新 initialize DB：失败时使用备份自动回滚 / 成功时用新库
    initializeDatabase({ quiet: true });
  }

  return NextResponse.json({
    success: true,
    message:
      '数据库已成功恢复并重新加载。旧数据库已备份到 /backups/restore_before_*.db，如发现异常可在服务器卷中手动回滚。',
  });
}

export const _touchDb = db;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
