import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { CONFIG } from '@/lib/server/config';

type ConfKey = 'default_provider' | 'daily_limit' | 'qps_limit';

export function GET(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  const rows = db.prepare('SELECT key, value FROM system_config').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return NextResponse.json({
    success: true,
    config: {
      defaultProvider: map.default_provider || 'qwen',
      dailyLimit: parseInt(map.daily_limit || String(CONFIG.DAILY_LIMIT), 10),
      qpsLimit: parseInt(map.qps_limit || '10', 10),
    },
    // 有哪些 key 配置了（敏感的不回传）
    aiProvidersConfigured: {
      qwen: !!process.env.DASHSCOPE_API_KEY,
      zhipu: !!process.env.ZHIPU_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      hunyuan: !!process.env.HUNYUAN_API_KEY,
      doubao: !!process.env.DOUBAO_API_KEY,
      siliconflow: !!process.env.SILICONFLOW_API_KEY,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  let body: Partial<Record<ConfKey, unknown>> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const write = db.prepare(
    `INSERT INTO system_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  );
  const validKeys: Array<{ k: ConfKey; v: unknown; validate: (v: unknown) => string | null }> = [
    { k: 'default_provider', v: body.default_provider, validate: (v) => typeof v === 'string' && ['qwen', 'zhipu', 'deepseek', 'hunyuan', 'doubao', 'siliconflow'].includes(v) ? v : null },
    { k: 'daily_limit', v: body.daily_limit, validate: (v) => { const n = parseInt(String(v), 10); return Number.isFinite(n) && n >= 1 && n <= 1000 ? String(n) : null; } },
    { k: 'qps_limit', v: body.qps_limit, validate: (v) => { const n = parseInt(String(v), 10); return Number.isFinite(n) && n >= 1 && n <= 500 ? String(n) : null; } },
  ];

  for (const item of validKeys) {
    if (item.v !== undefined) {
      const validated = item.validate(item.v);
      if (validated == null) {
        return NextResponse.json({ success: false, error: `参数非法: ${item.k}` }, { status: 400 });
      }
      write.run(item.k, validated);
    }
  }

  return NextResponse.json({ success: true });
}
