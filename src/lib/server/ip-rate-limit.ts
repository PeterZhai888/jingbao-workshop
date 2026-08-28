// 通用内存级 IP 限流（单进程内，Next.js Route Handler 共享模块实例）
// 用途：verify 等无鉴权公开接口的防刷（防日志洪泛 / 慢速 DoS）

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// 兜底：极端情况下防止 Map 无限增长（正常情况过期条目在检查时惰性清理）
const MAX_BUCKETS = 10_000;

/**
 * 检查某 IP 在窗口内是否超限（不计数，仅查询）
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) return false;
  if (now >= b.resetAt) return false;
  return b.count >= limit;
}

/**
 * 记一次调用（计数 + 到期重置；惰性清理过期桶）
 * 返回记录后的窗口内计数
 */
export function recordRateHit(key: string, windowMs: number): number {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    // Map 过大时先清理一轮过期条目再兜底清空
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets.entries()) {
        if (now >= v.resetAt) buckets.delete(k);
      }
      if (buckets.size > MAX_BUCKETS) buckets.clear();
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count;
}

/** 窗口剩余毫秒数（用于 Retry-After 头） */
export function rateLimitRetryAfterMs(key: string): number {
  const b = buckets.get(key);
  if (!b) return 0;
  return Math.max(0, b.resetAt - Date.now());
}
