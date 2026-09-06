import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, withRenewHeader } from '@/lib/server/auth';
import { batchGenerateCardCodes } from '@/lib/server/card-utils';
import { batchInsertCards, writeUsageLog } from '@/lib/server/card-service';
import { getClientIP } from '@/lib/server/card-utils';
import { db } from '@/lib/server/db';

export async function POST(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const ip = getClientIP(request.headers);

  let body: { count?: number; validDays?: number; dailyLimit?: number; remark?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const parsedCount = parseInt(String(body.count ?? '10'), 10);
  const count = Number.isFinite(parsedCount) ? Math.min(Math.max(parsedCount, 1), 500) : 10;
  const parsedValidDays = parseInt(String(body.validDays ?? '30'), 10);
  const validDays = Number.isFinite(parsedValidDays) ? Math.max(parsedValidDays, 1) : 30;
  const parsedDailyLimit = parseInt(String(body.dailyLimit ?? '20'), 10);
  const dailyLimit = Number.isFinite(parsedDailyLimit) ? Math.max(parsedDailyLimit, 1) : 20;
  const remarkRaw = body.remark as string | undefined;
  const remark = remarkRaw ? remarkRaw.slice(0, 200) : undefined;

  const codes = batchGenerateCardCodes(count);
  const inserted = batchInsertCards(codes, { validDays, dailyLimit, remark });
  const actualCodes = db
    .prepare(`SELECT code, created_at FROM cards WHERE code IN (${codes.map(() => '?').join(',')})`)
    .all(...codes) as Array<{ code: string; created_at: string }>;

  writeUsageLog({
    cardCode: 'SYSTEM',
    action: 'admin_generate_cards',
    success: true,
    ip,
    detail: { by: auth.username, requested: count, inserted, validDays, dailyLimit, remark },
  });

  return withRenewHeader(
    NextResponse.json({
      success: true,
      requested: count,
      inserted,
      cards: actualCodes,
    }),
    auth,
  );
}
