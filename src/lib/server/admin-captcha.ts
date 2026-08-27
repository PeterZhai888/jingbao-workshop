// 简易算术验证码 + 内存级 rate limit（Next.js 单进程内）
// Prompt 3 阶段管理后台页面前端消费

import crypto from 'node:crypto';

interface Challenge {
  a: number;
  b: number;
  expiresAt: number;
  id: string;
}

const store = new Map<string, Challenge>();

// 验证码超时时间 10 分钟
function cleanup() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
  if (store.size > 2000) store.clear(); // 兜底
}

export function generateCaptcha() {
  cleanup();
  const a = crypto.randomInt(2, 9);
  const b = crypto.randomInt(2, 9);
  const id = crypto.randomBytes(8).toString('hex');
  store.set(id, { a, b, expiresAt: Date.now() + 10 * 60 * 1000, id });
  // 题目文本：例如 "2 + 5 = ?"
  return { captchaId: id, question: `${a} + ${b} = ?`, expiresInMs: 600_000 };
}

export function verifyCaptcha(captchaId: string, answer: number): boolean {
  const c = store.get(captchaId);
  if (!c) return false;
  if (Date.now() > c.expiresAt) {
    store.delete(captchaId);
    return false;
  }
  // 无论对错，都一次性消费
  store.delete(captchaId);
  return Number.isFinite(answer) && c.a + c.b === answer;
}

// ============ IP 登录失败限制 ============
interface LoginFailRecord {
  count: number;
  lockedUntil: number;
}
const failStore = new Map<string, LoginFailRecord>();
const MAX_FAIL = 5;
const LOCK_MS = 30 * 60 * 1000; // 30分钟

export function isIpLocked(ip: string): { locked: boolean; minutesLeft?: number } {
  const r = failStore.get(ip);
  if (!r) return { locked: false };
  if (Date.now() < r.lockedUntil) {
    const left = Math.ceil((r.lockedUntil - Date.now()) / 60_000);
    return { locked: true, minutesLeft: left };
  }
  failStore.delete(ip);
  return { locked: false };
}

export function recordLoginFail(ip: string) {
  const prev = failStore.get(ip) || { count: 0, lockedUntil: 0 };
  const nextCount = prev.count + 1;
  let lockedUntil = 0;
  if (nextCount >= MAX_FAIL) {
    lockedUntil = Date.now() + LOCK_MS;
  }
  failStore.set(ip, { count: nextCount, lockedUntil });
}

export function clearLoginFail(ip: string) {
  failStore.delete(ip);
}
