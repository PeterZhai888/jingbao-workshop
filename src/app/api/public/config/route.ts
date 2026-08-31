import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';

/**
 * GET 公开只读接口：返回需要全站展示的轻量配置（如顶部公告）
 * 无鉴权，全站所有页面可直接 fetch 使用
 */
export function GET() {
  const rows = db.prepare(
    "SELECT key, value FROM system_config WHERE key IN ('notice_enabled', 'notice_content', 'notice_link', 'notice_type', 'exhausted_tip')",
  ).all() as Array<{ key: string; value: string }>;

  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return NextResponse.json({
    notice: {
      enabled: map.notice_enabled === '1' && !!map.notice_content,
      content: map.notice_content || '',
      link: map.notice_link || '',
      type: (map.notice_type || 'info') as 'info' | 'warning' | 'danger',
    },
    exhaustedTip: map.exhausted_tip || '',
  });
}
