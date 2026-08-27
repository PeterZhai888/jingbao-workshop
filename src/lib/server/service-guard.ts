// 全局调用护栏：紧急暂停开关 + 全局每日调用上限（止损用，防止 Key 泄露/恶意刷接口时账单爆炸）
// 配置存 system_config：service_paused / global_daily_limit
import { db } from './db';
import { CONFIG } from './config';

function getConfig(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** 当天日期字符串（按配置时区），用于统计当日调用量 */
function today(): string {
  const now = new Date(Date.now() + CONFIG.TZ_OFFSET_HOURS * 3600_000);
  return now.toISOString().slice(0, 10);
}

export interface GuardResult {
  ok: boolean;
  code?: 'SERVICE_PAUSED' | 'GLOBAL_DAILY_LIMIT';
  error?: string;
  /** 当前全局已用量/上限（超限时回传给前端展示） */
  used?: number;
  limit?: number;
}

/**
 * 检查全局护栏：服务是否暂停、全局当日调用量是否超限。
 * 在每张卡自身限流之后、调用 LLM 之前执行；不通过时调用方直接返回 503。
 */
export function checkGlobalGuard(): GuardResult {
  // 紧急暂停开关（管理员在后台一键止损）
  if (getConfig('service_paused') === '1') {
    return { ok: false, code: 'SERVICE_PAUSED', error: '系统维护中，生成服务暂停，请稍后再来' };
  }

  // 全局每日上限（0 或未配置 = 不限制）
  const limit = parseInt(getConfig('global_daily_limit') || '0', 10);
  if (limit > 0) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM usage_logs
         WHERE action IN ('titles', 'storyboard') AND success = 1
           AND created_at >= ? || ' 00:00:00' AND created_at <= ? || ' 23:59:59'`,
      )
      .get(today(), today()) as { c: number };
    if (row.c >= limit) {
      return {
        ok: false,
        code: 'GLOBAL_DAILY_LIMIT',
        error: '今日生成服务已达上限，请明天再来',
        used: row.c,
        limit,
      };
    }
  }
  return { ok: true };
}
