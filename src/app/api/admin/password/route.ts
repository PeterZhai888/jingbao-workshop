import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { authenticateAdmin, withRenewHeader } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { writeUsageLog } from '@/lib/server/card-service';
import { getClientIP } from '@/lib/server/card-utils';

/** 新密码强度：≥8位且同时含字母和数字 */
function isStrongPassword(pwd: string): boolean {
  return pwd.length >= 8 && /[a-zA-Z]/.test(pwd) && /\d/.test(pwd);
}

/**
 * POST 修改管理员密码
 * body: { oldPassword, newPassword }
 * 成功后写审计日志；前端负责登出重新登录
 */
export async function POST(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const ip = getClientIP(request.headers);

  let body: { oldPassword?: string; newPassword?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const { oldPassword, newPassword } = body;
  if (!oldPassword || !newPassword) {
    return NextResponse.json({ success: false, error: '请填写旧密码和新密码' }, { status: 400 });
  }
  if (!isStrongPassword(newPassword)) {
    return NextResponse.json(
      { success: false, error: '新密码需至少8位，且同时包含字母和数字' },
      { status: 400 },
    );
  }

  const row = db
    .prepare('SELECT id, username, password_hash FROM admin_users WHERE id = ?')
    .get(auth.adminId) as { id: number; username: string; password_hash: string } | undefined;
  if (!row) {
    return NextResponse.json({ success: false, error: '账号不存在' }, { status: 404 });
  }
  if (!bcrypt.compareSync(oldPassword, row.password_hash)) {
    writeUsageLog({
      cardCode: row.username,
      action: 'admin_change_password',
      success: false,
      ip,
      detail: { by: auth.username, reason: '旧密码错误' },
    });
    return NextResponse.json({ success: false, error: '旧密码错误' }, { status: 400 });
  }
  if (oldPassword === newPassword) {
    return NextResponse.json({ success: false, error: '新密码不能与旧密码相同' }, { status: 400 });
  }

  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 10),
    row.id,
  );

  writeUsageLog({
    cardCode: row.username,
    action: 'admin_change_password',
    success: true,
    ip,
    detail: { by: auth.username },
  });
  return withRenewHeader(NextResponse.json({ success: true }), auth);
}
