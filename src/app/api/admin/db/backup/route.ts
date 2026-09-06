import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, withRenewHeader } from '@/lib/server/auth';
import fs from 'node:fs';
import path from 'node:path';
import { closeAndResetDatabase, db, getDatabaseFilePath, initializeDatabase } from '@/lib/server/db';

/**
 * 管理后台一键下载完整 SQLite 数据库备份。
 * 流程：管理员登录校验 → checkpoint 刷 WAL → 关闭 DB 连接 → 读 .db 文件流响应 → 重新打开 DB。
 * 仅 SQLite 模式支持；PostgreSQL 模式返回 400。
 */
export async function GET(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  const dbPath = getDatabaseFilePath();
  if (!dbPath) {
    return NextResponse.json(
      { success: false, error: '当前使用外部数据库（PostgreSQL 等），请在数据库服务商控制台备份。' },
      { status: 400 },
    );
  }
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ success: false, error: `数据库文件不存在: ${dbPath}` }, { status: 500 });
  }

  // 1) 刷 WAL checkpoint + 关闭 DB 连接，确保 .db 文件是最新完整一致的快照
  closeAndResetDatabase();
  try {
    const buf = fs.readFileSync(dbPath);
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `jingbao-workshop_${stamp}.db`;

    // 2) 以附件形式下载（避免浏览器尝试打开显示）
    return withRenewHeader(
      new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.sqlite3',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buf.byteLength),
          'Cache-Control': 'private, no-store',
        },
      }),
      auth,
    );
  } finally {
    // 3) 无论下载成功/失败，都重新打开数据库，恢复 API 正常服务
    initializeDatabase({ quiet: true });
  }
}

// 使用 db 变量避免某些 tree-shaking / import graph 报错（本路由 import 了 db 但不用它，
// 这样在运行期 initializeDatabase 之后 proxy 指向同一实例，供下游逻辑复用）
export const _touchDb = db;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
