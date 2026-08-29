import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard, checkSensitive } from '@/lib/server/auth';
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

// 爆款标题生成的系统 Prompt：一次输出 10 组（支持短主题或完整文案）
const SYSTEM_PROMPT = `你是顶级短视频爆款标题专家，深谙抖音、快手、B站、小红书的爆款逻辑。
用户会给你一段内容，可能是简短的主题描述，也可能是完整的视频文案/口播稿。
你的任务：一次生成 10 组爆款标题。
要求：
0. 如果输入是完整文案/口播稿，先在心中提炼出核心主题、亮点和目标受众（不要输出提炼过程），再基于提炼结果生成标题；如果输入是短主题则直接生成。
1. 严格只输出一个 JSON 数组，包含 10 个字符串，不要任何解释文字。
2. 标题风格要覆盖多样：悬念好奇、痛点共鸣、干货实用、反差对比、数字清单、情绪价值等。
3. 每条标题 15-30 字，口语化、有网感、带钩子，适配抖音/小红书/B站。
4. 可以适当使用数字、感叹号、省略号增强冲击力，但每条不要超过 1 个 emoji。
5. 10 条标题思路必须明显不同，禁止同质化。
示例输出格式：
["标题1","标题2","标题3"]`;

// 降级模板（AI 失败时不扣次数）
function fallbackTitles(topic: string): string[] {
  return [
    `关于${topic}，看这一条就够了`,
    `后悔没早知道！${topic}的正确打开方式`,
    `99%的人都做错了${topic}，快看你中招没`,
    `被问爆了！${topic}保姆级攻略来了`,
    `别再瞎摸索了，${topic}其实很简单`,
    `实测一个月，${topic}真实效果大公开`,
    `内行人偷偷在用的${topic}技巧`,
    `${topic}避坑指南，第3条太真实了`,
    `一分钟学会${topic}，新手也能上手`,
    `看完这条，你对${topic}的理解会刷新`,
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

  if (dailyUsed! >= dailyLimit!) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'titles',
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

  let body: { topic?: string; provider?: string; model?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const topic = (body.topic || '').trim();
  if (!topic) return NextResponse.json({ success: false, error: '缺少主题' }, { status: 400 });
  if (topic.length > 2000) return NextResponse.json({ success: false, error: '内容过长，请精简到2000字以内' }, { status: 400 });

  const sens = checkSensitive(topic);
  if (!sens.ok) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'titles',
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
  // 次数检查（含本次成本）
  if (dailyUsed! + cost > dailyLimit!) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'titles',
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
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `视频主题或完整文案：\n${topic}` },
    ],
    timeoutMs: 30_000,
    preferred,
    model,
  });

  if (!ai.ok) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'titles',
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
        fallback: { titles: fallbackTitles(topic), note: '以下为基础模板标题（本次不消耗次数），稍后可重新生成' },
      },
      { status: 503 },
    );
  }

  const parsed = extractJSON<string[]>(ai.content);
  if (!parsed || !Array.isArray(parsed) || parsed.length < 3) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'titles',
      success: false,
      ip,
      userAgent,
      fingerprint,
      detail: `AI_PARSE_FAIL (${ai.provider})`,
    });
    return NextResponse.json(
      {
        success: false,
        code: 'AI_BUSY',
        error: 'AI服务繁忙，请稍后再试',
        fallback: { titles: fallbackTitles(topic), note: '以下为基础模板标题（本次不消耗次数），稍后可重新生成' },
      },
      { status: 503 },
    );
  }

  // 并发兜底：AI 耗时期间其他请求可能已把当日次数用完，写入成功日志（扣次）前复核
  if (getDailyUsed(cardId!) + cost > dailyLimit!) {
    writeUsageLog({
      cardId: cardId!,
      cardCode: cardCode!,
      action: 'titles',
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

  const titles = parsed.map((t) => String(t).trim()).filter(Boolean).slice(0, 10);
  if (titles.length < 3) {
    return NextResponse.json(
      {
        success: false,
        code: 'AI_BUSY',
        error: 'AI服务繁忙，请稍后再试',
        fallback: { titles: fallbackTitles(topic), note: '以下为基础模板标题（本次不消耗次数），稍后可重新生成' },
      },
      { status: 503 },
    );
  }

  const id = 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  writeUsageLog({
    cardId: cardId!,
    cardCode: cardCode!,
    action: 'titles',
    success: true,
    ip,
    userAgent,
    fingerprint,
    detail: { topicLen: topic.length, titlesCount: titles.length, provider: ai.provider, cost },
  });

  saveGeneratedHistory({
    id,
    cardId: cardId!,
    cardCode: cardCode!,
    type: 'titles',
    inputText: topic,
    outputJson: { titles },
  });

  touchCardUsage(cardId!, ip!, fingerprint!);

  return NextResponse.json({ success: true, id, titles, provider: ai.provider, cost });
}
