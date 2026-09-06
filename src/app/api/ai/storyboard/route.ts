import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard, withRenewHeader, checkSensitive } from '@/lib/server/auth';
import {
  writeUsageLog,
  touchCardUsage,
  saveGeneratedHistory,
  getExhaustedTip,
  getDailyUsed,
} from '@/lib/server/card-service';
import { callAI, extractJSON, PROVIDER_KEYS, getModelCost } from '@/lib/server/ai-provider';
import type { ProviderKey } from '@/lib/server/ai-provider';
import { checkGlobalGuard } from '@/lib/server/service-guard';
import type { StoryboardShot } from '@/lib/types';

// 分镜生成的系统 Prompt：要求输出严格 JSON（镜头数量由用户指定，'auto' 时由 AI 自行判断）
function buildSystemPrompt(count: number | 'auto', extra?: string): string {
  const countRule = count === 'auto'
    ? `1. 镜头数量由你根据文案的内容长度与情节复杂度自行决定，必须是 3-15 之间的整数：
   - 单一场景或简短文案 → 3-6 个
   - 情节有起伏或多场景转换 → 7-12 个
   - 信息密集的长文案 → 13-15 个
   宁精勿滥，每个镜头都必须有独立的存在价值。`
    : `1. 输出恰好 ${count} 个镜头，不多不少。`;
  const base = `你是专业的短视频分镜编剧。根据用户的视频文案，输出一份分镜脚本。
要求：
${countRule}
2. 严格只输出 JSON 数组，不要任何解释文字、不要 markdown 代码块之外的说明。
3. 每个镜头包含以下字段：
   - shotNumber: 镜头序号（从 1 开始的整数）
   - sceneDescription: 画面描述（中文，具体到人物动作、场景、光线氛围，40-80字）
   - dialogue: 台词或旁白（可为空字符串；有台词时标注说话人，如"旁白：""女主："）
   - duration: 预估时长（如"3秒"、"5秒"，单个镜头一般 2-8 秒）
   - cameraMove: 运镜建议（如"固定机位"、"推镜，中景→特写"、"环绕运镜"、"跟拍"）
4. 分镜节奏要适配抖音/快手/视频号竖屏短视频，前 3 秒必须抓住观众。
示例输出格式：
[{"shotNumber":1,"sceneDescription":"...","dialogue":"旁白：...","duration":"3秒","cameraMove":"固定机位"}]`;
  return extra ? `${base}\n【用户补充要求】${extra}` : base;
}

// 降级用的通用分镜模板（AI 失败时不扣次数，直接返回结构化提示）
function fallbackShots(text: string): StoryboardShot[] {
  return [
    { shotNumber: 1, sceneDescription: `开场：围绕「${text.slice(0, 16)}」构建视觉冲击力强的第一帧，快速锁定注意力`, dialogue: '旁白：一句话点题，勾起好奇', duration: '3秒', cameraMove: '固定机位' },
    { shotNumber: 2, sceneDescription: '展开：交代核心内容的关键画面与人物状态', dialogue: '', duration: '5秒', cameraMove: '推镜，中景→特写' },
    { shotNumber: 3, sceneDescription: '高潮：突出最有价值的操作或情绪点', dialogue: '旁白：讲清痛点与解决方式', duration: '5秒', cameraMove: '跟拍/近景' },
    { shotNumber: 4, sceneDescription: '收尾：总结价值并引导互动', dialogue: '字幕：#短视频 #干货，评论区聊聊', duration: '3秒', cameraMove: '固定，淡出' },
  ];
}

export async function POST(request: NextRequest) {
  const auth = authenticateCard(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error },
      { status: auth.status || 401 },
    );
  }
  const { cardId, cardCode, dailyUsed, dailyLimit, ip, fingerprint, userAgent } = auth;

  // 次数检查
  if (dailyUsed! >= dailyLimit!) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'storyboard',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: 'DAILY_LIMIT',
    });
    return NextResponse.json(
      { success: false, code: 'DAILY_LIMIT', error: '今日AI生成次数已用完，请明天再来', tip: getExhaustedTip() },
      { status: 429 },
    );
  }

  let body: { text?: string; count?: number | 'auto'; provider?: string; model?: string; extra?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ success: false, error: '缺少输入文本' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ success: false, error: '文本过长，请精简到5000字以内' }, { status: 400 });
  // 用户补充要求（可选）：拼入 System Prompt 作为额外指令层，与文案内容隔离
  const extra = (body.extra || '').trim().slice(0, 100);

  // 分镜数量：'auto' = AI 自动判断；数字则 clamp 到 3-15（未传默认 10，兼容旧前端）
  const rawCount = body.count;
  let count: number | 'auto';
  if (rawCount === 'auto') {
    count = 'auto';
  } else {
    const n = parseInt(String(rawCount ?? 10), 10);
    count = Number.isFinite(n) ? Math.min(Math.max(n, 3), 15) : 10;
  }

  // 敏感词过滤
  const sens = checkSensitive(text);
  if (!sens.ok) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'storyboard',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: `SENSITIVE: ${sens.hit}`,
    });
    return NextResponse.json({ success: false, error: '输入内容包含违规词，请修改后重试' }, { status: 400 });
  }

  // ========= 调用真实 LLM =========
  // 用户指定的 provider/model 需在白名单内（非法值直接忽略走默认）
  const preferred = PROVIDER_KEYS.includes(body.provider as ProviderKey) ? (body.provider as ProviderKey) : undefined;
  const model = typeof body.model === 'string' ? body.model : undefined;
  // 本次消耗次数（按模型档位成本加权）
  const cost = preferred && model ? getModelCost(preferred, model) : 1;
  // 次数检查（含本次成本：剩余次数不足以覆盖本次消耗时拦截）
  if (dailyUsed! + cost > dailyLimit!) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'storyboard',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: 'DAILY_LIMIT',
    });
    return NextResponse.json(
      { success: false, code: 'DAILY_LIMIT', error: `今日剩余次数不足以完成本次生成（需${cost}次），请更换低档位模型或明天再来`, tip: getExhaustedTip() },
      { status: 429 },
    );
  }

  // 全局护栏：紧急暂停 + 全局每日上限（不通过时不扣次数）
  const guard = checkGlobalGuard();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, code: guard.code, error: guard.error },
      { status: 503 },
    );
  }

  const ai = await callAI({
    messages: [
      { role: 'system', content: buildSystemPrompt(count, extra) },
      { role: 'user', content: `视频文案：\n${text}` },
    ],
    maxRetries: 1, // 超时重试同样消耗豆包 token，控制在最多 2 次尝试
    preferred,
    model,
  });

  // AI 失败 → 降级提示，不扣次数、不写成功日志
  if (!ai.ok) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'storyboard',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: `AI_FALLBACK: ${ai.error} (${ai.provider})`,
    });
    return NextResponse.json(
      {
        success: false,
        code: 'AI_BUSY',
        error: ai.error === 'AI_PROVIDER_NOT_CONFIGURED'
          ? 'AI 服务尚未配置 API Key，请联系管理员在后台或环境变量中配置'
          : 'AI服务繁忙，请稍后再试',
        fallback: { shots: fallbackShots(text), note: '以下为基础模板分镜（本次不消耗次数），稍后可重新生成' },
      },
      { status: 503 },
    );
  }

  // 解析 LLM 输出
  const parsed = extractJSON<StoryboardShot[]>(ai.content);
  const contentPreview = ai.content.slice(0, 200).replace(/\s+/g, ' ');
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0 || !parsed[0]?.sceneDescription) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'storyboard',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: `AI_PARSE_FAIL (${ai.provider}) len=${parsed && Array.isArray(parsed) ? parsed.length : 0} preview="${contentPreview}"`,
    });
    return NextResponse.json(
      {
        success: false,
        code: 'AI_BUSY',
        error: 'AI服务繁忙，请稍后再试',
        fallback: { shots: fallbackShots(text), note: '以下为基础模板分镜（本次不消耗次数），稍后可重新生成' },
      },
      { status: 503 },
    );
  }

  // 并发兜底：AI 耗时期间其他请求可能已把当日次数用完，写入成功日志（扣次）前复核
  if (getDailyUsed(cardId!) + cost > dailyLimit!) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'storyboard',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: 'DAILY_LIMIT_RACE',
    });
    return NextResponse.json(
      { success: false, code: 'DAILY_LIMIT', error: '今日AI生成次数已用完，请明天再来', tip: getExhaustedTip() },
      { status: 429 },
    );
  }

  // 规范化镜头数据（序号重排 + 字段兜底）
  const shots: StoryboardShot[] = parsed.slice(0, 15).map((s, i) => ({
    shotNumber: typeof s.shotNumber === 'number' ? s.shotNumber : i + 1,
    sceneDescription: String(s.sceneDescription || ''),
    dialogue: String(s.dialogue || ''),
    duration: String(s.duration || '3秒'),
    cameraMove: String(s.cameraMove || '固定机位'),
  }));

  const title = (text.slice(0, 12) + (text.length > 12 ? '...' : '')) + ' · 分镜脚本';
  const id = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  // 写使用日志（success=1 即算扣次）
  writeUsageLog({
    cardId: cardId!,
    cardCode: cardCode!,
    action: 'storyboard',
    success: true,
    ip,
    userAgent,
    fingerprint,
    detail: { inputLen: text.length, shotsCount: shots.length, provider: ai.provider, cost },
  });

  // 写生成历史
  saveGeneratedHistory({
    id,
    cardId: cardId!,
    cardCode: cardCode!,
    type: 'storyboard',
    inputText: text,
    outputJson: { title, shots },
  });

  touchCardUsage(cardId!, ip!, fingerprint!);

  return withRenewHeader(
    NextResponse.json({
      success: true,
      id,
      title,
      shots,
      provider: ai.provider,
      cost,
    }),
    auth,
  );
}
