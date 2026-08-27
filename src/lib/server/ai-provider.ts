// AI Provider 封装层：6 家大模型统一走 OpenAI 兼容格式
// 配置读取顺序：system_config 表（管理后台可改） → 环境变量兜底
import { db } from './db';

export type ProviderKey = 'qwen' | 'zhipu' | 'deepseek' | 'hunyuan' | 'doubao' | 'siliconflow';

interface ProviderDef {
  key: ProviderKey;
  label: string;
  baseURL: string;
  model: string;
  envKey: string;      // 存 API Key 的环境变量名
  envBaseURL?: string; // 可覆盖 baseURL 的环境变量名
  envModel?: string;   // 可覆盖 model 的环境变量名
}

// 6 家提供商默认接入参数（全部兼容 OpenAI /chat/completions 格式）
const PROVIDERS: Record<ProviderKey, ProviderDef> = {
  qwen: {
    key: 'qwen', label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',
    envKey: 'DASHSCOPE_API_KEY',
  },
  zhipu: {
    key: 'zhipu', label: '智谱AI',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    envKey: 'ZHIPU_API_KEY',
  },
  deepseek: {
    key: 'deepseek', label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
  hunyuan: {
    key: 'hunyuan', label: '腾讯混元',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    model: 'hunyuan-lite',
    envKey: 'HUNYUAN_API_KEY',
  },
  doubao: {
    key: 'doubao', label: '字节豆包',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-lite-4k',
    envKey: 'DOUBAO_API_KEY',
    envModel: 'DOUBAO_MODEL', // 豆包需填接入点ID，用环境变量覆盖
  },
  siliconflow: {
    key: 'siliconflow', label: '硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    envKey: 'SILICONFLOW_API_KEY',
  },
};

/** 全部提供商 key（校验用） */
export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

/** 读取 system_config 单值 */
function getSystemConfig(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export interface ResolvedProvider {
  key: ProviderKey;
  label: string;
  baseURL: string;
  model: string;
  apiKey: string;
}

/** 解析当前生效的提供商配置（system_config 优先，环境变量兜底） */
export function resolveProvider(preferred?: ProviderKey): ResolvedProvider | null {
  const wanted = (preferred || (getSystemConfig('default_provider') as ProviderKey | null)) || 'qwen';
  const def = PROVIDERS[wanted];
  if (!def) return null;

  // API Key：system_config 存 ai_keys_<provider>（管理后台在线填写），环境变量兜底
  const keyFromDb = getSystemConfig(`ai_key_${def.key}`);
  const apiKey = keyFromDb || process.env[def.envKey] || '';

  const baseURL = (def.envBaseURL && process.env[def.envBaseURL]) || def.baseURL;
  const model = (def.envModel && process.env[def.envModel]) || getSystemConfig(`ai_model_${def.key}`) || def.model;

  if (!apiKey) return null;
  return { key: def.key, label: def.label, baseURL, model, apiKey };
}

/** 全部提供商与配置状态（管理后台展示用，不返回密钥明文） */
export function listProviders() {
  return (Object.keys(PROVIDERS) as ProviderKey[]).map((k) => {
    const def = PROVIDERS[k];
    const keyFromDb = getSystemConfig(`ai_key_${def.key}`);
    return {
      key: def.key,
      label: def.label,
      defaultModel: def.model,
      currentModel: (def.envModel && process.env[def.envModel]) || getSystemConfig(`ai_model_${def.key}`) || def.model,
      configured: !!(keyFromDb || process.env[def.envKey]),
      configuredFrom: keyFromDb ? '后台配置' : (process.env[def.envKey] ? '环境变量' : '未配置'),
    };
  });
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface CallAIOptions {
  messages: ChatMessage[];
  timeoutMs?: number;   // 单次超时，默认 30s
  maxRetries?: number;  // 超时/5xx 自动重试次数，默认 2 次
  preferred?: ProviderKey;
}

export interface CallAIResult {
  ok: boolean;
  content: string;
  provider: string;     // 实际使用的提供商名
  error?: string;       // 内部诊断用（日志），不直接透给用户
}

/**
 * 调用大模型（OpenAI 兼容 /chat/completions）
 * - 超时或 5xx 自动重试，最多 maxRetries 次（默认 2 次）
 * - 最终失败返回 ok:false，调用方统一给用户「AI服务繁忙」降级提示
 */
export async function callAI(options: CallAIOptions): Promise<CallAIResult> {
  const provider = resolveProvider(options.preferred);
  if (!provider) {
    return { ok: false, content: '', provider: '-', error: 'AI_PROVIDER_NOT_CONFIGURED' };
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = options.maxRetries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: options.messages,
          temperature: 0.8,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content || '';
        if (content) {
          return { ok: true, content, provider: provider.label };
        }
        return { ok: false, content: '', provider: provider.label, error: 'EMPTY_RESPONSE' };
      }

      // 5xx 才重试；4xx（如 key 无效）重试无意义直接失败
      if (res.status >= 500 && attempt < maxRetries) {
        continue;
      }
      return { ok: false, content: '', provider: provider.label, error: `HTTP_${res.status}` };
    } catch (e) {
      // 网络错误/超时 → 重试
      if (attempt < maxRetries) continue;
      const reason = e instanceof Error && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
      return { ok: false, content: '', provider: provider.label, error: reason };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, content: '', provider: provider.label, error: 'RETRIES_EXHAUSTED' };
}

/** 从 LLM 输出文本中稳健提取 JSON 数组/对象（容忍 ```json 代码块包裹） */
export function extractJSON<T>(raw: string): T | null {
  if (!raw) return null;
  // 优先找 ```json ... ``` 代码块
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fence?.[1], raw].filter(Boolean) as string[];
  for (const c of candidates) {
    const trimmed = c.trim();
    // 直接尝试
    try { return JSON.parse(trimmed) as T; } catch { /* 继续找 */ }
    // 尝试截取第一个 [ 或 { 到最后一个 ] 或 }
    const start = Math.min(...[trimmed.indexOf('['), trimmed.indexOf('{')].filter((i) => i >= 0));
    const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));
    if (Number.isFinite(start) && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)) as T; } catch { /* 继续找 */ }
    }
  }
  return null;
}
