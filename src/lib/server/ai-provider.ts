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

/** 每家服务商的精选模型清单（含价格档位标注，管理后台下拉可选） */
export const MODEL_CATALOG: Record<ProviderKey, Array<{ id: string; label: string }>> = {
  qwen: [
    { id: 'qwen-turbo', label: 'qwen-turbo · 低价高速（默认）' },
    { id: 'qwen-plus', label: 'qwen-plus · 标准价，能力均衡' },
    { id: 'qwen-max', label: 'qwen-max · 旗舰价，最强能力' },
    { id: 'qwen-flash', label: 'qwen-flash · 免费额度，极低价' },
  ],
  zhipu: [
    { id: 'glm-4-flash', label: 'glm-4-flash · 免费（默认）' },
    { id: 'glm-4-air', label: 'glm-4-air · 低价' },
    { id: 'glm-4-airx', label: 'glm-4-airx · 低价加速' },
    { id: 'glm-4-plus', label: 'glm-4-plus · 标准价' },
    { id: 'glm-4-long', label: 'glm-4-long · 长文本' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'deepseek-chat · 标准价（默认）' },
    { id: 'deepseek-reasoner', label: 'deepseek-reasoner · 推理模型，稍贵' },
  ],
  hunyuan: [
    { id: 'hunyuan-lite', label: 'hunyuan-lite · 免费额度（默认）' },
    { id: 'hunyuan-standard', label: 'hunyuan-standard · 标准价' },
    { id: 'hunyuan-pro', label: 'hunyuan-pro · 旗舰价' },
  ],
  doubao: [
    { id: 'doubao-lite-4k', label: 'doubao-lite-4k · 低价（默认，可填接入点ID）' },
    { id: 'doubao-lite-32k', label: 'doubao-lite-32k · 低价长文本' },
    { id: 'doubao-pro-4k', label: 'doubao-pro-4k · 标准价' },
    { id: 'doubao-pro-32k', label: 'doubao-pro-32k · 标准价长文本' },
  ],
  siliconflow: [
    { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B · 免费额度（默认）' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B · 标准价，能力强' },
    { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3 · 标准价' },
    { id: 'THUDM/glm-4-9b-chat', label: 'glm-4-9b · 免费额度' },
  ],
};

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

/** 解析单个提供商的完整配置（Key 为空返回 null） */
function resolveOne(key: ProviderKey): ResolvedProvider | null {
  const def = PROVIDERS[key];
  if (!def) return null;
  const keyFromDb = getSystemConfig(`ai_key_${def.key}`);
  const apiKey = keyFromDb || process.env[def.envKey] || '';
  if (!apiKey) return null;
  const baseURL = (def.envBaseURL && process.env[def.envBaseURL]) || def.baseURL;
  const model = (def.envModel && process.env[def.envModel]) || getSystemConfig(`ai_model_${def.key}`) || def.model;
  return { key: def.key, label: def.label, baseURL, model, apiKey };
}

/**
 * 解析当前生效的提供商配置（system_config 优先，环境变量兜底）
 * 若首选提供商未配置 Key，自动回退到第一个已配置 Key 的提供商
 */
export function resolveProvider(preferred?: ProviderKey): ResolvedProvider | null {
  const wanted = (preferred || (getSystemConfig('default_provider') as ProviderKey | null)) || 'qwen';
  const first = resolveOne(wanted);
  if (first) return first;

  // 回退：按固定顺序找第一个已配置 Key 的提供商
  for (const k of PROVIDER_KEYS) {
    const fallback = resolveOne(k);
    if (fallback) return fallback;
  }
  return null;
}

/** 全部提供商与配置状态（管理后台展示用，不返回密钥明文） */
export function listProviders() {
  return (Object.keys(PROVIDERS) as ProviderKey[]).map((k) => {
    const def = PROVIDERS[k];
    const keyFromDb = getSystemConfig(`ai_key_${def.key}`);
    const currentModel = (def.envModel && process.env[def.envModel]) || getSystemConfig(`ai_model_${def.key}`) || def.model;
    return {
      key: def.key,
      label: def.label,
      defaultModel: def.model,
      currentModel,
      // 当前模型是否来自后台自定义（非预设清单内 → 自定义；或存了 ai_model_ 也算自定义选择）
      modelCustom: !!getSystemConfig(`ai_model_${def.key}`) && !MODEL_CATALOG[k].some((m) => m.id === currentModel),
      models: MODEL_CATALOG[k],
      configured: !!(keyFromDb || process.env[def.envKey]),
      configuredFrom: keyFromDb ? '后台配置' : (process.env[def.envKey] ? '环境变量' : '未配置'),
    };
  });
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// ===== HTTPS_PROXY 代理支持（Node fetch 默认不走代理，沙箱/企业网环境必需）=====
let cachedProxyDispatcher: { dispatcher: unknown } | null | undefined;

/** 读取代理环境变量，返回 fetch 的 dispatcher 选项；无代理环境返回 null */
function getProxyDispatcher(): { dispatcher: unknown } | null {
  if (cachedProxyDispatcher !== undefined) return cachedProxyDispatcher;
  cachedProxyDispatcher = null;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxyUrl) return null;
  try {
    // undici 是 Node 内置 fetch 的底层实现，随 Node 一起安装
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ProxyAgent } = require('undici') as { ProxyAgent: new (url: string) => unknown };
    cachedProxyDispatcher = { dispatcher: new ProxyAgent(proxyUrl) };
  } catch {
    // undici 不可用时忽略，直连
  }
  return cachedProxyDispatcher;
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
        // 沙箱/企业网络需走 HTTP(S)_PROXY 代理访问外部 API；Node fetch 默认不走代理
        ...(getProxyDispatcher() ?? {}),
      } as RequestInit);

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
