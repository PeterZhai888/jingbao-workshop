import { NextResponse } from 'next/server';

// ========= Prompt 1 占位 API（仅用于 UI 预览，Prompt 2 阶段会接入真实数据库） =========

function generateToken(): string {
  return 'tk_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code: string = (body.code || '').trim().toUpperCase();
    const fingerprint: string = body.fingerprint || '';

    // 格式校验
    if (!/^SP-[A-Z0-9]{12}$/.test(code)) {
      return NextResponse.json({ success: false, error: '卡密格式错误，格式应为 SP-XXXXXXXXXXXX' }, { status: 400 });
    }

    // ====== 演示模式：任何合法格式的卡密都能通过（有效期30天，每日20次） ======
    // 在 Prompt 2 阶段会替换为真实数据库校验

    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时

    return NextResponse.json({
      success: true,
      session: {
        token: generateToken(),
        cardCode: code,
        expiresAt: tokenExpiresAt.toISOString(),
        issuedAt: activatedAt.toISOString(),
        dailyUsed: 0,
        dailyLimit: 20,
        cardExpiresAt: expiresAt.toISOString(),
        fingerprint,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
