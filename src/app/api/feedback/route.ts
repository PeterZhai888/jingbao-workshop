import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { writeUsageLog } from '@/lib/server/card-service';

const ALLOWED_TYPES = ['bug', 'feature', 'question', 'other'] as const;
type FeedbackType = (typeof ALLOWED_TYPES)[number];

/**
 * POST 用户提交反馈（需卡密登录）
 * body: { type, content, contact?, context? }
 * context 为错误入口自动附带的失败上下文（工具名/模型/错误信息等），可选
 */
export async function POST(request: NextRequest) {
  const auth = authenticateCard(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  let body: { type?: string; content?: string; contact?: string; context?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const type = body.type as FeedbackType;
  const content = String(body.content || '').trim();
  const contact = String(body.contact || '').trim();
  const context = body.context;

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ success: false, error: '反馈类型错误' }, { status: 400 });
  }
  if (content.length < 5 || content.length > 500) {
    return NextResponse.json({ success: false, error: '反馈内容需 5-500 字' }, { status: 400 });
  }
  if (contact.length > 100) {
    return NextResponse.json({ success: false, error: '联系方式不能超过100字符' }, { status: 400 });
  }

  // 防刷：同一卡密 5 分钟内只能提交 1 条
  const recent = db
    .prepare(`SELECT COUNT(*) AS c FROM feedback WHERE card_code = ? AND created_at >= datetime('now', '-5 minutes')`)
    .get(auth.cardCode!) as { c: number };
  if (recent.c >= 1) {
    return NextResponse.json({ success: false, error: '提交太频繁了，请稍后再试' }, { status: 429 });
  }

  // context 序列化为 JSON 存储（截断到 2000 字符，防止超长）
  let contextJson: string | null = null;
  if (context && typeof context === 'object') {
    try {
      contextJson = JSON.stringify(context).slice(0, 2000);
    } catch {
      contextJson = null;
    }
  }

  db.prepare(
    `INSERT INTO feedback (card_code, type, content, contact, context) VALUES (?, ?, ?, ?, ?)`,
  ).run(auth.cardCode!, type, content, contact || null, contextJson);

  writeUsageLog({
    cardId: auth.cardId,
    cardCode: auth.cardCode!,
    action: 'feedback_submit',
    success: true,
    ip: auth.ip,
    userAgent: auth.userAgent,
    fingerprint: auth.fingerprint,
    detail: { type },
  });

  return NextResponse.json({ success: true });
}
