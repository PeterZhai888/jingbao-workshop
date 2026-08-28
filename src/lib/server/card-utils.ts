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
 * SQLite 时区偏移修饰符（如 '+8 hours' / '-5 hours'），
 * 用于把 UTC 存储的 created_at 换算到本地时区后再取日期做"当日"分组
 */
export function tzModifier(): string {
  const tz = CONFIG.TZ_OFFSET_HOURS;
  return `${tz >= 0 ? '+' : ''}${tz} hours`;
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

/**
 * 从请求头解析客户端真实 IP（防 XFF 伪造）
 *
 * X-Forwarded-For 格式：`client, proxy1, proxy2, ...`（每经过一层代理追加一次）
 * 最右侧由最近的可信代理写入，越靠左越容易被客户端伪造。
 *
 * TRUST_PROXY 环境变量控制信任的代理层数：
 * - '0'：完全不信任代理头（裸机直连部署时用，此时 XFF 全部是客户端自填的伪造值）
 * - '1'（默认）：信任一层反代（Railway/Render/Nginx 单层代理），取 XFF 最后一段
 * - 'n'：信任 n 层代理链，取倒数第 n 段
 */
export function getClientIP(headers: Headers): string {
  const trust = Math.max(0, parseInt(process.env.TRUST_PROXY || '1', 10) || 0);
  if (trust > 0) {
    const fwd = headers.get('x-forwarded-for');
    if (fwd) {
      const parts = fwd.split(',').map((s) => s.trim()).filter(Boolean);
      // 链路长度 ≥ 信任层数时，倒数第 trust 段是真实客户端 IP
      if (parts.length >= trust) return parts[parts.length - trust];
      // 链路比预期短（如开发环境无真实代理）：取第一段并容忍
      if (parts.length > 0) return parts[0];
    }
    // 仅由可信反代写入的头（部分平台使用）
    const real = headers.get('x-real-ip');
    if (real) return real.trim();
  }
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
