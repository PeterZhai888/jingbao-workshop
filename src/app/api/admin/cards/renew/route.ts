import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
import { renewCardExpiry, writeUsageLog, getCardById } from '@/lib/server/card-service';
import { getClientIP } from '@/lib/server/card-utils';

/** POST 管理员为卡密续期 body: { cardId: number, addDays: number(1-365) } */
export async function POST(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const ip = getClientIP(request.headers);

  let body: { cardId?: number; addDays?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const cardId = Number(body.cardId);
  const addDays = Number(body.addDays);
  if (!Number.isInteger(cardId) || cardId <= 0 || !Number.isInteger(addDays) || addDays < 1 || addDays > 365) {
    return NextResponse.json({ success: false, error: '参数错误（天数需 1-365 的整数）' }, { status: 400 });
  }

  const result = renewCardExpiry(cardId, addDays);
  if (!result.ok) {
    writeUsageLog({
      cardId,
      cardCode: 'admin_renew',
      action: 'admin_renew_card',
      success: false,
      ip,
      detail: { by: auth.username, addDays, error: result.message },
    });
    return NextResponse.json({ success: false, error: result.message }, { status: 400 });
  }

  const updated = getCardById(cardId);
  writeUsageLog({
    cardId,
    cardCode: updated?.code || '',
    action: 'admin_renew_card',
    success: true,
    ip,
    detail: { by: auth.username, addDays, newExpiry: updated?.expires_at },
  });
  return NextResponse.json({ success: true, expiresAt: updated?.expires_at || null });
}
