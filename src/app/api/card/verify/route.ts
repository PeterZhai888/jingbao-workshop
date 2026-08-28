import { NextRequest, NextResponse } from 'next/server';
import { getCardByCode, isCardUsable, activateCard, writeUsageLog, touchCardUsage, getDailyUsed, getExhaustedTip } from '@/lib/server/card-service';
import { getClientIP, uaFingerprint } from '@/lib/server/card-utils';
import { signToken } from '@/lib/server/jwt';
import { CONFIG } from '@/lib/server/config';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const userAgent = request.headers.get('user-agent') || '';

  let body: { code?: string; fingerprint?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const fingerprint = body.fingerprint || uaFingerprint(request.headers);
  const code = (body.code || '').trim().toUpperCase();

  if (!/^SP-[A-Z0-9]{12}$/.test(code)) {
    return NextResponse.json({ success: false, error: '卡密格式错误' }, { status: 400 });
  }

  const card = getCardByCode(code);
  if (!card) {
    writeUsageLog({
      cardCode: code,
      action: 'verify',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: '卡密不存在',
    });
    return NextResponse.json({ success: false, error: '卡密无效，请检查后重试' }, { status: 400 });
  }

  const usable = isCardUsable(card);
  if (!usable.ok) {
    writeUsageLog({
      cardId: card.id,
      cardCode: code,
      action: 'verify',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: usable.reason,
    });
    return NextResponse.json({ success: false, error: usable.reason || '卡密不可用' }, { status: 403 });
  }

  if (card.status === 'unused') {
    activateCard(card.id);
  }

  touchCardUsage(card.id, ip, fingerprint);

  const fresh = getCardByCode(code)!;
  const dailyUsed = getDailyUsed(fresh.id);
  const token = signToken({ cardId: fresh.id, cardCode: fresh.code, ip, fingerprint });
  const tokenExpiresAt = new Date(Date.now() + CONFIG.JWT_EXPIRES_HOURS * 3600 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  writeUsageLog({
    cardId: fresh.id,
    cardCode: code,
    action: 'verify',
    success: true,
    ip,
    userAgent,
    fingerprint,
  });

  return NextResponse.json({
    success: true,
    session: {
      token,
      cardCode: fresh.code,
      expiresAt: tokenExpiresAt,
      issuedAt: nowIso,
      dailyUsed,
      dailyLimit: fresh.daily_limit,
      cardExpiresAt: fresh.expires_at,
      fingerprint,
      // 次数用尽引导文案（后台可配置，空 = 不提示）
      exhaustedTip: getExhaustedTip(),
    },
  });
}
