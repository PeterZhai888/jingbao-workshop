// 通用鉴权与安全中间件（用于 Next.js Route Handler 前）
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, verifyAdminToken, maybeRenewCardToken, maybeRenewAdminToken } from '@/lib/server/jwt';
import {
  getCardById,
  isCardUsable,
  getDailyUsed,
  getRecentMinuteCalls,
  writeUsageLog,
} from '@/lib/server/card-service';
import { getClientIP, uaFingerprint } from '@/lib/server/card-utils';
import { CONFIG } from '@/lib/server/config';

export interface CardAuthResult {
  ok: boolean;
  status?: number;
  code?: string; // SESSION_INVALID / RATE_LIMIT / DAILY_LIMIT / FROZEN ...
  error?: string;
  cardId?: number;
  cardCode?: string;
  dailyUsed?: number;
  dailyLimit?: number;
  ip?: string;
  fingerprint?: string;
  userAgent?: string;
  /** 续期产生的新 token（仅 ok=true 时可能存在） */
  renewedToken?: string;
  /** 新 token 对应的过期时间（ISO 字符串） */
  renewedExpiresAt?: string;
}

export interface AdminAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  adminId?: number;
  username?: string;
  renewedToken?: string;
  renewedExpiresAt?: string;
}

/**
 * 校验前端传入的 Bearer Token，并做：
 *  - JWT 有效期
 *  - 卡密状态（冻结/作废/过期）
 *  - 指纹一致性（UA/IP 异常变更提示）
 *  - 每分钟请求数限流
 *  NOT 扣减次数（留给业务成功后扣）
 */
export function authenticateCard(request: NextRequest): CardAuthResult {
  const auth = request.headers.get('authorization');
  const ip = getClientIP(request.headers);
  const userAgent = request.headers.get('user-agent') || '';
  const fp = uaFingerprint(request.headers);

  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'SESSION_INVALID', error: '未登录或登录已失效，请重新验证卡密', ip, fingerprint: fp, userAgent };
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.sub !== 'card') {
    return { ok: false, status: 401, code: 'SESSION_INVALID', error: '登录状态已失效，请重新验证卡密', ip, fingerprint: fp, userAgent };
  }

  const card = getCardById(payload.cardId);
  if (!card || card.code !== payload.cardCode) {
    return { ok: false, status: 401, code: 'SESSION_INVALID', error: '登录状态已失效，请重新验证卡密', ip, fingerprint: fp, userAgent };
  }

  // 状态检查
  const usable = isCardUsable(card);
  if (!usable.ok) {
    return { ok: false, status: 403, code: 'SESSION_INVALID', error: usable.reason || '卡密不可用', ip, fingerprint: fp, userAgent };
  }

  // 指纹一致性（仅提示强度，不强制登出；差异过大时打日志）
  let fingerprintMismatch = false;
  if (card.last_fingerprint && card.last_fingerprint !== fp) {
    fingerprintMismatch = true;
  }

  // 每分钟限流（>5次临时限制，即第6次才拦）
  const recent = getRecentMinuteCalls(card.id);
  if (recent > CONFIG.CARD_PER_MINUTE_LIMIT) {
    writeUsageLog({
      cardId: card.id,
      cardCode: card.code,
      action: 'rate_limited',
      success: false,
      ip,
      userAgent,
      fingerprint: fp,
      detail: { recentCalls: recent, limit: CONFIG.CARD_PER_MINUTE_LIMIT, fingerprintMismatch },
    });
    return { ok: false, status: 429, code: 'RATE_LIMIT', error: '请求过于频繁，请稍后再试', ip, fingerprint: fp, userAgent };
  }

  const dailyUsed = getDailyUsed(card.id);
  const renew = maybeRenewCardToken(payload);
  return {
    ok: true,
    cardId: card.id,
    cardCode: card.code,
    dailyUsed,
    dailyLimit: card.daily_limit,
    ip,
    fingerprint: fp,
    userAgent,
    renewedToken: renew.token,
    renewedExpiresAt: renew.expiresAt,
  };
}

// 管理员鉴权
export function authenticateAdmin(request: NextRequest): AdminAuthResult {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: '未登录' };
  }
  const token = auth.slice(7);
  const payload = verifyAdminToken(token);
  if (!payload || payload.sub !== 'admin') {
    return { ok: false, status: 401, error: '登录已失效' };
  }
  const renew = maybeRenewAdminToken(payload);
  return {
    ok: true,
    adminId: payload.adminId,
    username: payload.username,
    renewedToken: renew.token,
    renewedExpiresAt: renew.expiresAt,
  };
}

/**
 * 给响应注入续期头。调用方式：
 *   const auth = authenticateCard(req);
 *   if (!auth.ok) return NextResponse.json(...);
 *   return withRenewHeader(NextResponse.json({ success: true }), auth);
 */
export function withRenewHeader<T extends NextResponse>(
  response: T,
  auth: { renewedToken?: string; renewedExpiresAt?: string } | undefined,
): T {
  if (auth?.renewedToken) {
    response.headers.set('X-Renewed-Token', auth.renewedToken);
  }
  if (auth?.renewedExpiresAt) {
    response.headers.set('X-Renewed-Expires-At', auth.renewedExpiresAt);
  }
  return response;
}

// 简单敏感词过滤（黑名单可后续扩展到 system_config 表维护）
const DEFAULT_SENSITIVE = [
  '习近平', '法轮功', '六四', '翻墙', '色情', '赌博', '博彩',
  '毒品', '走私', '枪支', '办证', '代考', '诈骗',
];

export interface ContentCheckResult {
  ok: boolean;
  hit?: string;
}

export function checkSensitive(text: string): ContentCheckResult {
  if (!text) return { ok: true };
  for (const w of DEFAULT_SENSITIVE) {
    if (text.includes(w)) return { ok: false, hit: w };
  }
  return { ok: true };
}
