import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
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

  return NextResponse.json({
    success: true,
    total: totalRow.c,
    page,
    pageSize,
    items: rows,
  });
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
  return NextResponse.json({ success: true });
}
