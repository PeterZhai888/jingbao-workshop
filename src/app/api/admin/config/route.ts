import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { CONFIG } from '@/lib/server/config';
import { listProviders, PROVIDER_KEYS } from '@/lib/server/ai-provider';
import { isUsingFallbackJwtSecret } from '@/lib/server/config';

type ConfKey = 'default_provider' | 'daily_limit' | 'qps_limit' | 'tier_access' | 'service_paused' | 'global_daily_limit' | 'exhausted_tip' | `ai_key_${string}`;

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
      tierAccess: map.tier_access || 'all',
    },
    // 每家提供商的配置状态明细（不含密钥明文）
    providers: listProviders(),
    // 运行护栏：紧急暂停开关 + 全局每日上限
    guard: {
      servicePaused: map.service_paused === '1',
      globalDailyLimit: parseInt(map.global_daily_limit || '0', 10),
    },
    // 次数用尽引导文案（空 = 不提示）
    exhaustedTip: map.exhausted_tip || '',
    // 安全状态：JWT 密钥仍在用开发默认值时提醒（生产模式会在服务端拒绝启动，此标记主要覆盖开发/预览环境）
    security: {
      usingFallbackJwtSecret: isUsingFallbackJwtSecret,
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
    } else if (key === 'tier_access') {
      // 用户端开放档位：all=全开 / standard=到标准版 / plus=到高质量版
      const v = String(raw ?? '').trim();
      if (!['all', 'standard', 'plus'].includes(v)) {
        return NextResponse.json({ success: false, error: '参数非法: tier_access' }, { status: 400 });
      }
      write.run(key, v);
    } else if (key === 'service_paused') {
      // 紧急暂停开关：'1'=暂停所有生成（止损） / '0'=恢复
      const v = raw === true || raw === '1' || raw === 1 ? '1' : '0';
      write.run(key, v);
    } else if (key === 'global_daily_limit') {
      // 全局每日生成上限（全站所有卡合计；0=不限制）
      const n = parseInt(String(raw), 10);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return NextResponse.json({ success: false, error: '参数非法: global_daily_limit' }, { status: 400 });
      }
      write.run(key, String(n));
    } else if (key === 'exhausted_tip') {
      // 次数用尽引导文案：展示在用户端“今日次数已用完”提示后（空 = 不提示）
      const v = String(raw ?? '').trim();
      if (v.length > 200) {
        return NextResponse.json({ success: false, error: '引导文案不能超过200字' }, { status: 400 });
      }
      write.run(key, v);
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

/**
 * DELETE 清除某家服务商的全部配置（ai_key_xxx + ai_model_xxx），即停用该服务商
 * body: { provider: 'deepseek' }
 * 若清除的是当前默认服务商，系统自动 fallback 到其他已配置服务商，不会中断服务
 */
export async function DELETE(request: NextRequest) {
  const auth = authenticateAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }
  let body: { provider?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const provider = (body.provider || '').trim();
  if (!PROVIDER_KEYS.includes(provider as never)) {
    return NextResponse.json({ success: false, error: `未知提供商: ${provider}` }, { status: 400 });
  }
  const del = db.prepare('DELETE FROM system_config WHERE key = ?');
  del.run(`ai_key_${provider}`);
  del.run(`ai_model_${provider}`);
  return NextResponse.json({ success: true });
}
