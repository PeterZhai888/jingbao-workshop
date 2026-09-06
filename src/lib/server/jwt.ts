import jwt from 'jsonwebtoken';
import { CONFIG } from '@/lib/server/config';

/** token 剩余有效期低于此阈值时触发续期（单位毫秒）。当前设为有效期的一半：3.5 天 */
const RENEW_THRESHOLD_MS = (CONFIG.JWT_EXPIRES_HOURS * 3600_000) / 2;

export interface TokenPayload {
  sub: 'card';
  cardId: number;
  cardCode: string;
  ip: string;
  fingerprint: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, 'sub'>): string {
  const full: TokenPayload = { sub: 'card', ...payload };
  return jwt.sign(full, CONFIG.JWT_SECRET, {
    expiresIn: `${CONFIG.JWT_EXPIRES_HOURS}h`,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, CONFIG.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/** 检测卡密 token 是否需要续期，需要则返回新 token 和过期时间 */
export function maybeRenewCardToken(payload: TokenPayload): { token?: string; expiresAt?: string } {
  if (!payload.exp) return {};
  const msLeft = payload.exp * 1000 - Date.now();
  if (msLeft > RENEW_THRESHOLD_MS) return {};
  const newToken = signToken({
    cardId: payload.cardId,
    cardCode: payload.cardCode,
    ip: payload.ip,
    fingerprint: payload.fingerprint,
  });
  const expiresAt = new Date(Date.now() + CONFIG.JWT_EXPIRES_HOURS * 3600_000).toISOString();
  return { token: newToken, expiresAt };
}

export interface AdminTokenPayload {
  sub: 'admin';
  adminId: number;
  username: string;
  iat?: number;
  exp?: number;
}

export function signAdminToken(payload: Omit<AdminTokenPayload, 'sub'>): string {
  const full: AdminTokenPayload = { sub: 'admin', ...payload };
  return jwt.sign(full, CONFIG.JWT_SECRET, { expiresIn: `${CONFIG.JWT_EXPIRES_HOURS}h` });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, CONFIG.JWT_SECRET) as AdminTokenPayload;
  } catch {
    return null;
  }
}

/** 检测管理员 token 是否需要续期 */
export function maybeRenewAdminToken(payload: AdminTokenPayload): { token?: string; expiresAt?: string } {
  if (!payload.exp) return {};
  const msLeft = payload.exp * 1000 - Date.now();
  if (msLeft > RENEW_THRESHOLD_MS) return {};
  const newToken = signAdminToken({ adminId: payload.adminId, username: payload.username });
  const expiresAt = new Date(Date.now() + CONFIG.JWT_EXPIRES_HOURS * 3600_000).toISOString();
  return { token: newToken, expiresAt };
}
