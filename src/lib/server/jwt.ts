import jwt from 'jsonwebtoken';
import { CONFIG } from '@/lib/server/config';

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

export interface AdminTokenPayload {
  sub: 'admin';
  adminId: number;
  username: string;
  iat?: number;
  exp?: number;
}

export function signAdminToken(payload: Omit<AdminTokenPayload, 'sub'>): string {
  const full: AdminTokenPayload = { sub: 'admin', ...payload };
  return jwt.sign(full, CONFIG.JWT_SECRET, { expiresIn: '12h' });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, CONFIG.JWT_SECRET) as AdminTokenPayload;
  } catch {
    return null;
  }
}
