import { NextRequest, NextResponse } from 'next/server';
import { generateCaptcha } from '@/lib/server/admin-captcha';

export function GET() {
  const c = generateCaptcha();
  return NextResponse.json({ success: true, captchaId: c.captchaId, question: c.question });
}
