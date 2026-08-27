import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { CONFIG } from '@/lib/server/config';
import { listProviders, PROVIDER_KEYS } from '@/lib/server/ai-provider';

type ConfKey = 'default_provider' | 'daily_limit' | 'qps_limit' | `ai_key_${string}`;

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
    // 每家提供商的配置状态明细（不含密钥明文）
    providers: listProviders(),
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

  for (const [key, raw] of Object.entries(body)) {
    if (key === 'default_provider') {
      if (typeof raw !== 'string' || !PROVIDER_KEYS.includes(raw as never)) {
        return NextResponse.json({ success: false, error: '参数非法: default_provider' }, { status: 400 });
      }
      write.run(key, raw);
    } else if (key === 'daily_limit') {
      const n = parseInt(String(raw), 10);
      if (!Number.isFinite(n) || n < 1 || n > 1000) {
        return NextResponse.json({ success: false, error: '参数非法: daily_limit' }, { status: 400 });
      }
      write.run(key, String(n));
    } else if (key === 'qps_limit') {
      const n = parseInt(String(raw), 10);
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        return NextResponse.json({ success: false, error: '参数非法: qps_limit' }, { status: 400 });
      }
      write.run(key, String(n));
    } else if (key.startsWith('ai_key_')) {
      // 在线填写某家提供商的 API Key（如 ai_key_deepseek）
      const provider = key.slice('ai_key_'.length);
      if (!PROVIDER_KEYS.includes(provider as never)) {
        return NextResponse.json({ success: false, error: `未知提供商: ${provider}` }, { status: 400 });
      }
      const v = String(raw ?? '').trim();
      if (!v || v.length < 8 || v.length > 200) {
        return NextResponse.json({ success: false, error: 'API Key 格式不正确' }, { status: 400 });
      }
      write.run(key, v);
    } else if (key.startsWith('ai_model_')) {
      // 可选：在线覆盖某家提供商的模型名
      const provider = key.slice('ai_model_'.length);
      if (!PROVIDER_KEYS.includes(provider as never)) {
        return NextResponse.json({ success: false, error: `未知提供商: ${provider}` }, { status: 400 });
      }
      const v = String(raw ?? '').trim();
      if (!v || v.length > 100) {
        return NextResponse.json({ success: false, error: '模型名不合法' }, { status: 400 });
      }
      write.run(key, v);
    } else {
      return NextResponse.json({ success: false, error: `不支持的配置项: ${key}` }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
