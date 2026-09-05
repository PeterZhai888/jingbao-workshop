import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { writeUsageLog } from '@/lib/server/card-service';
import { getClientIP } from '@/lib/server/card-utils';

const ALLOWED_STATUS = ['pending', 'replied', 'closed'] as const;
type FeedbackStatus = (typeof ALLOWED_STATUS)[number];

interface FeedbackRow {
  id: number;
  card_code: string;
  type: string;
  content: string;
  contact: string | null;
  context: string | null;
  status: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

/** GET 反馈列表（分页 + 状态筛选 + 各状态计数） */
export async function GET(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  const params = request.nextUrl.searchParams;
  const statusParam = params.get('status') || 'all';
  const status = ALLOWED_STATUS.includes(statusParam as FeedbackStatus) ? (statusParam as FeedbackStatus) : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(params.get('pageSize')) || 10));

  const where = status === 'all' ? '' : 'WHERE status = ?';
  const args = status === 'all' ? [] : [status];

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM feedback ${where}`).get(...args) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM feedback ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize) as FeedbackRow[];

  const countRows = db
    .prepare(`SELECT status, COUNT(*) AS c FROM feedback GROUP BY status`)
    .all() as Array<{ status: string; c: number }>;
  const counts: Record<string, number> = { pending: 0, replied: 0, closed: 0 };
  for (const r of countRows) counts[r.status] = r.c;
  counts.all = Object.values(counts).reduce((s, n) => s + n, 0);

  return NextResponse.json({ success: true, rows, total, page, pageSize, counts });
}

/** PATCH 管理员处理反馈：回复内容 / 更新状态 body: { id, adminReply?, status? } */
export async function PATCH(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const ip = getClientIP(request.headers);

  let body: { id?: number; adminReply?: string; status?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
  }

  const row = db.prepare(`SELECT id, card_code, status FROM feedback WHERE id = ?`).get(id) as
    | { id: number; card_code: string; status: string }
    | undefined;
  if (!row) {
    return NextResponse.json({ success: false, error: '反馈不存在' }, { status: 404 });
  }

  const adminReply = String(body.adminReply ?? '').trim();
  const status = body.status;

  if (status !== undefined && !ALLOWED_STATUS.includes(status as FeedbackStatus)) {
    return NextResponse.json({ success: false, error: '状态值错误' }, { status: 400 });
  }
  if (adminReply.length > 500) {
    return NextResponse.json({ success: false, error: '回复内容不能超过500字' }, { status: 400 });
  }

  // 回复时自动将 pending 标记为 replied；显式传入 status 时以传入值为准
  const nextStatus = status || (adminReply ? (row.status === 'pending' ? 'replied' : row.status) : row.status);

  db.prepare(
    `UPDATE feedback SET admin_reply = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(adminReply || null, nextStatus, id);

  writeUsageLog({
    cardId: 0,
    cardCode: row.card_code,
    action: 'admin_reply_feedback',
    success: true,
    ip,
    detail: { by: auth.username, feedbackId: id, status: nextStatus },
  });

  return NextResponse.json({ success: true });
}
