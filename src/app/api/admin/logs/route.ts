import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, withRenewHeader } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

// 操作类型白名单（过滤参数只接受这些值，防止任意 SQL 值注入查询语义）
const VALID_ACTIONS = new Set([
  'verify',
  'titles',
  'storyboard',
  'rate_limited',
  'admin_login',
  'admin_generate_cards',
  'admin_set_status',
  'admin_change_password',
]);

/**
 * GET 使用日志列表（分页 + 可选过滤）
 * ?page=1&pageSize=20[&cardCode=SP-XXX][&action=titles]
 */
export async function GET(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '20', 10) || 20));
  const cardCode = (sp.get('cardCode') || '').trim().toUpperCase();
  const action = (sp.get('action') || '').trim();

  const conds: string[] = [];
  const params: unknown[] = [];
  if (cardCode) {
    // 卡码含 %/_ 时按字面匹配（转义 LIKE 通配符）
    conds.push(`card_code LIKE ? ESCAPE '\\'`);
    params.push(`%${cardCode.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  if (action && VALID_ACTIONS.has(action)) {
    conds.push('action = ?');
    params.push(action);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM usage_logs ${where}`).get(...params) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT id, card_code, action, success, ip, detail, created_at
       FROM usage_logs ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  return withRenewHeader(NextResponse.json({ success: true, items, total, page, pageSize }), auth);
}

/**
 * DELETE 清理日志
 * - ?keepDays=N：删除 N 天前的日志（保留最近 N 天）
 * - 不带参数：清空全部
 */
export async function DELETE(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  const keepDays = parseInt(request.nextUrl.searchParams.get('keepDays') || '0', 10);
  let changes: number;
  if (Number.isFinite(keepDays) && keepDays > 0 && keepDays <= 3650) {
    changes = db
      .prepare(`DELETE FROM usage_logs WHERE created_at < datetime('now', '-' || ? || ' days')`)
      .run(keepDays).changes;
  } else {
    changes = db.prepare('DELETE FROM usage_logs').run().changes;
  }
  return withRenewHeader(NextResponse.json({ success: true, deleted: changes }), auth);
}
