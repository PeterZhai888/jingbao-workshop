import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard } from '@/lib/server/auth';
import { getDailyUsed, getExhaustedTip } from '@/lib/server/card-service';

export function GET(request: NextRequest) {
  const auth = authenticateCard(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error },
      { status: auth.status || 401 },
    );
  }
  // 实时查询最新次数
  const dailyUsed = getDailyUsed(auth.cardId!);
  return NextResponse.json({
    success: true,
    dailyUsed,
    dailyLimit: auth.dailyLimit,
    // 次数用尽引导文案（后台可配置，空 = 不提示）
    exhaustedTip: getExhaustedTip(),
  });
}
