import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/server/db';
import { signAdminToken } from '@/lib/server/jwt';
import { isIpLocked, recordLoginFail, verifyCaptcha, clearLoginFail } from '@/lib/server/admin-captcha';
import { getClientIP } from '@/lib/server/card-utils';
import { CONFIG } from '@/lib/server/config';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const locked = isIpLocked(ip);
  if (locked.locked) {
    return NextResponse.json(
      { success: false, error: `登录失败次数过多，请 ${locked.minutesLeft} 分钟后再试` },
      { status: 429 },
    );
  }

  let body: { username?: string; password?: string; captchaId?: string; captchaAnswer?: number; answer?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const { username, password, captchaId } = body;
  const captchaAnswer = body.captchaAnswer ?? body.answer; // 兼容两种命名

  if (!username || !password || !captchaId || captchaAnswer == null) {
    return NextResponse.json({ success: false, error: '请填写账号密码及验证码' }, { status: 400 });
  }

  // 先校验验证码（避免穷举）
  if (!verifyCaptcha(captchaId, Number(captchaAnswer))) {
    recordLoginFail(ip);
    return NextResponse.json({ success: false, error: '验证码错误' }, { status: 400 });
  }

  const row = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string; role: string }
    | undefined;

  const passOk = row && bcrypt.compareSync(password, row.password_hash);
  if (!passOk) {
    recordLoginFail(ip);
    return NextResponse.json({ success: false, error: '账号或密码错误' }, { status: 401 });
  }

  clearLoginFail(ip);
  db.prepare(
    `UPDATE admin_users SET last_login_at = datetime('now'), last_login_ip = ?, login_fail_count = 0 WHERE id = ?`,
  ).run(ip, row!.id);

  // 登录成功后检测：当前密码是否仍为出厂默认密码（提醒管理员尽快修改）
  const usingDefaultPassword = bcrypt.compareSync(CONFIG.DEFAULT_ADMIN_PASSWORD, row!.password_hash);

  const token = signAdminToken({ adminId: row!.id, username: row!.username });
  // 前端需要知道 token 过期时间，用于本地定时退出
  const expiresAt = new Date(Date.now() + CONFIG.JWT_EXPIRES_HOURS * 3600_000).toISOString();
  return NextResponse.json({
    success: true,
    token,
    expiresAt,
    admin: { id: row!.id, username: row!.username, role: row!.role },
    usingDefaultPassword,
  });
}
