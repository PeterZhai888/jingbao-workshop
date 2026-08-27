import crypto from 'node:crypto';
import { CONFIG } from '@/lib/server/config';

/**
 * 生成卡密：SP- + 12位 大写字母+数字（禁止连续序列）
 * 规则：不允许 >=4 位连续升/降序或相同字符（如 AAAA、1234、4321）
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混字符 I/O/0/1

function hasForbiddenSequence(s: string): boolean {
  for (let i = 0; i <= s.length - 4; i++) {
    const a = s.charCodeAt(i);
    const b = s.charCodeAt(i + 1);
    const c = s.charCodeAt(i + 2);
    const d = s.charCodeAt(i + 3);
    // 全部相同
    if (a === b && b === c && c === d) return true;
    // 升序1
    if (b - a === 1 && c - b === 1 && d - c === 1) return true;
    // 降序1
    if (a - b === 1 && b - c === 1 && c - d === 1) return true;
  }
  return false;
}

function random12(): string {
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return s;
}

export function generateCardCode(): string {
  // 最多尝试 50 次，保证不出现禁忌序列
  for (let i = 0; i < 50; i++) {
    const s = random12();
    if (!hasForbiddenSequence(s)) return 'SP-' + s;
  }
  return 'SP-' + random12(); // 兜底
}

export function batchGenerateCardCodes(count: number): string[] {
  const set = new Set<string>();
  let safety = 0;
  while (set.size < count && safety++ < count * 20) {
    set.add(generateCardCode());
  }
  return Array.from(set);
}

/**
 * 基于服务器时间计算今日 00:00（按 TZ_OFFSET 时区）的 ISO 字符串，用于 daily count 分组
 */
export function todayStartKey(now = new Date()): string {
  const d = new Date(now.getTime() + CONFIG.TZ_OFFSET_HOURS * 3600 * 1000);
  // 取整到当天 00:00 UTC（相当于本地时区当天 00:00）
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 从请求头取客户端真实 IP（兼容反代） */
export function getClientIP(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real;
  return '0.0.0.0';
}

/** 简单 UA 指纹哈希（用于异常变更检测） */
export function uaFingerprint(headers: Headers): string {
  const ua = headers.get('user-agent') || '';
  const accept = headers.get('accept') || '';
  const lang = headers.get('accept-language') || '';
  const raw = `${ua}|${accept}|${lang}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
