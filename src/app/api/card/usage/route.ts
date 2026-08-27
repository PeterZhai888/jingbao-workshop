import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, code: 'SESSION_INVALID', error: '未登录' }, { status: 401 });
  }
  // 占位：直接返回 0/20，Prompt 2 阶段接真实逻辑
  return NextResponse.json({
    success: true,
    dailyUsed: 0,
    dailyLimit: 20,
  });
}
