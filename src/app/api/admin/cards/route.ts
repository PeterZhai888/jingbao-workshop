import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, withRenewHeader } from '@/lib/server/auth';
import { db, CardStatus } from '@/lib/server/db';
import { setCardStatus, writeUsageLog } from '@/lib/server/card-service';
import { getClientIP } from '@/lib/server/card-utils';

const ALLOWED_STATUS: CardStatus[] = ['unused', 'active', 'frozen', 'revoked', 'expired'];
const ALLOWED_SET: CardStatus[] = ['frozen', 'revoked', 'active']; // 允许管理员变更的几种

// GET 查询卡密列表/单条
export async function GET(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim().toUpperCase();
  const status = url.searchParams.get('status') as CardStatus | null;
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '20', 10), 1), 100);

  const where: string[] = [];
  const args: unknown[] = [];
  if (code) {
    where.push('code LIKE ?');
    args.push(`%${code}%`);
  }
  if (status && ALLOWED_STATUS.includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM cards ${whereSql}`).get(...args) as { c: number };
  const rows = db
    .prepare(
      `SELECT * FROM cards ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize, (page - 1) * pageSize);

  return withRenewHeader(
    NextResponse.json({
      success: true,
      total: totalRow.c,
      page,
      pageSize,
      items: rows,
    }),
    auth,
  );
}

// POST 修改卡密状态（冻结/作废/解冻）
export async function POST(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const ip = getClientIP(request.headers);

  let body: { code?: string; status?: CardStatus } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const code = (body.code || '').trim().toUpperCase();
  const status = body.status;
  if (!code || !status || !ALLOWED_SET.includes(status)) {
    return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
  }
  const ok = setCardStatus(code, status);
  if (!ok) {
    return NextResponse.json({ success: false, error: '卡密不存在' }, { status: 404 });
  }
  writeUsageLog({
    cardCode: code,
    action: 'admin_set_status',
    success: true,
    ip,
    detail: { by: auth.username, to: status },
  });
  return withRenewHeader(NextResponse.json({ success: true }), auth);
}

/**
 * DELETE 删除卡密（仅允许 unused 未激活卡密；已激活/冻结/作废卡有关联使用记录，走状态机不物理删除）
 * body: { codes: string[] }（单删传一个元素即可）
 */
export async function DELETE(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const ip = getClientIP(request.headers);

  let body: { codes?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const codes = Array.isArray(body.codes)
    ? body.codes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean).slice(0, 500)
    : [];
  if (codes.length === 0) {
    return NextResponse.json({ success: false, error: '请指定要删除的卡密' }, { status: 400 });
  }

  const del = db.prepare(`DELETE FROM cards WHERE code = ? AND status = 'unused'`);
  const skipped: string[] = [];
  let deleted = 0;
  const tx = db.transaction((list: string[]) => {
    for (const code of list) {
      const r = del.run(code);
      if (r.changes) {
        deleted++;
      } else {
        skipped.push(code); // 不存在或状态非 unused（有业务数据关联，不允许物理删除）
      }
    }
  });
  tx(codes);

  writeUsageLog({
    cardCode: codes[0] || '-',
    action: 'admin_delete_cards',
    success: true,
    ip,
    detail: { by: auth.username, deleted, skipped: skipped.length, codes: codes.slice(0, 20) },
  });

  return withRenewHeader(
    NextResponse.json({
      success: true,
      deleted,
      skipped,
      message: skipped.length
        ? `已删除 ${deleted} 张；${skipped.length} 张非未激活状态未删除（已激活卡密请使用冻结/作废）`
        : `已删除 ${deleted} 张卡密`,
    }),
    auth,
  );
}
