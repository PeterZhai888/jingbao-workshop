import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard } from '@/lib/server/auth';
import { listUserModels } from '@/lib/server/ai-provider';

/** 用户端可选模型列表（卡密鉴权；只返回已配置 Key 的服务商与开放档位内的模型） */
export function GET(request: NextRequest) {
  const auth = authenticateCard(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error },
      { status: auth.status || 401 },
    );
  }
  return NextResponse.json({ success: true, ...listUserModels() });
}
