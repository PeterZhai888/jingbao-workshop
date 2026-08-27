import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, code: 'SESSION_INVALID', error: '未登录' }, { status: 401 });
  }
  // 占位：返回空记录，前端会自动降级到 localStorage 展示
  return NextResponse.json({
    success: true,
    items: [],
  });
}
