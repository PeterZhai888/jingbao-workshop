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
import type { StoryboardShot, CreationMode } from '@/lib/types';

/** 实际生效的创作方式（auto 只是路由入口，最终必然落到三种之一） */
type ConcreteMode = Exclude<CreationMode, 'auto'>;

/**
 * auto 模式下用关键词规则识别文案类型（零成本、可预测、可调试）：
 * - 真人口播信号：教学/分享/日常类词汇 → real
 * - 故事/玄幻信号：小说/漫剧/奇幻类词汇 → ai
 * - 无明显信号或打平 → hybrid（混合创作是通用性最好的兜底）
 */
function detectCreationMode(text: string): ConcreteMode {
  // 高置信真人口播信号：教学、分享、日常记录类
  const realKeywords = [
    '口播', '讲解', '分享', '教你', '干货', '知识', '经验', '方法', '技巧',
    '日常', 'vlog', 'Vlog', '探店', '测评', '开箱', '访谈', '大家好',
    '今天给大家', '给大家', '聊聊', '朋友们', '小伙伴', '建议收藏', '避坑', '注意',
  ];
  // 高置信 AI 视频/故事信号：玄幻、漫剧、小说推文类
  const aiKeywords = [
    '玄幻', '修仙', '穿越', '漫剧', '小说', '异世界', '魔法', '宗门', '修炼',
    '江湖', '武侠', '奇幻', '上古', '神兽', '灵气', '宫廷', '王爷', '千金',
    '霸总', '妖', '魔', '仙门', '法术', '公主', '王子', '王国', '从前', '有一天',
  ];
  let realScore = 0;
  let aiScore = 0;
  for (const kw of realKeywords) if (text.includes(kw)) realScore++;
  for (const kw of aiKeywords) if (text.includes(kw)) aiScore++;
  if (realScore > aiScore) return 'real';
  if (aiScore > realScore) return 'ai';
  return 'hybrid';
}

// 镜头数量规则（三种模式共用）：'auto' 时由 AI 自行判断，数字则精确输出
function buildCountRule(count: number | 'auto'): string {
  return count === 'auto'
    ? `1. 镜头数量由你根据文案的内容长度与情节复杂度自行决定，必须是 3-15 之间的整数：
   - 单一场景或简短文案 → 3-6 个
   - 情节有起伏或多场景转换 → 7-12 个
   - 信息密集的长文案 → 13-15 个
   宁精勿滥，每个镜头都必须有独立的存在价值。`
    : `1. 输出恰好 ${count} 个镜头，不多不少。`;
}

// 三套独立调教的分镜 Prompt：不同制作方式对应完全不同的专业分镜标准
function buildSystemPrompt(mode: ConcreteMode, count: number | 'auto', extra?: string): string {
  const countRule = buildCountRule(count);

  const prompts: Record<ConcreteMode, string> = {
    // 🧑 真人实拍：核心是"我拿手机就能拍"
    real: `你是专业的真人口播短视频编导，擅长把文案转化为"拿起手机就能拍"的分镜脚本。
要求：
${countRule}
2. 严格只输出 JSON 数组，不要任何解释文字、不要 markdown 代码块之外的说明。
3. 每个镜头包含以下字段：
   - shotNumber: 镜头序号（从 1 开始的整数）
   - sceneDescription: 画面描述（中文，以景别开头，如"中景：""近景：""特写："；写清人物站位、面向方向、表情、具体动作、手中道具；所有画面必须是手机在日常生活场景中可实拍的）
   - dialogue: 台词或旁白（将文案逐句分配到对应镜头；可为空字符串）
   - duration: 预估时长（如"3秒"、"5秒"，单个镜头一般 2-8 秒）
   - cameraMove: 机位与运镜（如"固定机位，手机与胸同高"、"手持轻微晃动"、"三脚架固定"，符合手机拍摄习惯）
4. 口播节奏优先：文案的每句话都要有对应镜头，以人物直视镜头讲话为主，可穿插手势、道具演示、B-roll（手机屏幕特写、环境空镜）辅助表达。
5. 场景必须简单可拍：书桌前、客厅、办公室、户外街道等日常场景；禁止玄幻、科幻、特效等无法实拍的画面。
示例输出格式：
[{"shotNumber":1,"sceneDescription":"中景：人物站在书架前面对镜头，右手举起一本书，眉头微皱，语气认真","dialogue":"如果你每天都很努力，却还是赚不到钱……","duration":"3秒","cameraMove":"固定机位，手机与胸同高"}]`,

    // 🤖 AI视频：核心是"这一段应该生成什么画面"，向 AI 生图/生视频提示词靠拢
    ai: `你是专业的AI视频分镜师，擅长把故事文案转化为可直接用于AI生图/AI生视频的分镜脚本。
要求：
${countRule}
2. 严格只输出 JSON 数组，不要任何解释文字、不要 markdown 代码块之外的说明。
3. 每个镜头包含以下字段：
   - shotNumber: 镜头序号（从 1 开始的整数）
   - sceneDescription: 画面描述（中文，写清人物外貌、年龄、服装等视觉特征，场景环境、光线氛围、动作与情绪；无需考虑拍摄成本，可写现实中无法实拍的画面；40-80字）
   - dialogue: 台词或旁白（可为空字符串；有台词时标注说话人，如"旁白：""女主："）
   - duration: 预估时长（如"3秒"、"5秒"）
   - cameraMove: 运镜建议（如"缓慢推镜，全景→中景"、"环绕运镜"、"航拍俯瞰"、"跟拍"）
4. 视觉连续性：同一人物在不同镜头中的外貌、服装描述保持一致；相邻镜头画面衔接自然，前后呼应。
5. 画面描述向AI生成提示词靠拢：具体的光线（晨光/冷色/逆光）、氛围（史诗感/治愈/悬疑）、构图细节，便于直接用于AI生图或生视频工具。
示例输出格式：
[{"shotNumber":1,"sceneDescription":"18岁黑衣少年站在古老宗门石阶前，衣袍被山风吹动，远处云海翻涌，冷色晨光从云层间洒落，少年眼神坚毅","dialogue":"旁白：踏入仙门那一刻，他的命运改变了","duration":"4秒","cameraMove":"缓慢推镜，全景→中景"}]`,

    // 🔀 混合创作：核心是"哪些地方真人拍，哪些地方用AI画面/B-roll"
    hybrid: `你是专业的短视频总编导，擅长设计"真人实拍 + AI画面/B-roll素材"混合编排的分镜脚本。
要求：
${countRule}
2. 严格只输出 JSON 数组，不要任何解释文字、不要 markdown 代码块之外的说明。
3. 每个镜头包含以下字段：
   - shotNumber: 镜头序号（从 1 开始的整数）
   - shotType: 镜头类型（"real" = 真人实拍，"ai" = AI生成画面或B-roll素材；每条必填）
   - sceneDescription: 画面描述（中文；real 镜头以景别开头，写清人物站位、表情动作，确保手机可拍；ai 镜头写清画面内容、光线氛围，可直接作为AI生图提示词）
   - dialogue: 台词或旁白（可为空字符串）
   - duration: 预估时长（如"3秒"、"5秒"）
   - cameraMove: 运镜建议（如"固定机位"、"推镜，中景→特写"、"横移镜头"）
4. 编排逻辑：口播讲解、观点输出、情绪表达用 real 镜头（人物面对镜头讲话）；案例展示、场景重现、氛围烘托、数据可视化用 ai 镜头（B-roll/AI画面）；两种镜头自然交替，节奏紧凑。
5. 适配抖音/快手/视频号竖屏短视频，前 3 秒必须抓住观众（真人出镜直视镜头或强视觉冲击画面）。
示例输出格式：
[{"shotNumber":1,"shotType":"real","sceneDescription":"中景：人物坐在书桌前面对镜头，双手摊开，表情认真","dialogue":"你有没有发现，很多人每天忙忙碌碌……","duration":"3秒","cameraMove":"固定机位"},{"shotNumber":2,"shotType":"ai","sceneDescription":"清晨拥挤的地铁站人流穿梭，上班族们神色匆匆，冷色调","dialogue":"","duration":"3秒","cameraMove":"横移镜头"}]`,
  };

  const base = prompts[mode];
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

  let body: { text?: string; count?: number | 'auto'; provider?: string; model?: string; extra?: string; mode?: CreationMode } = {};
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

  // 创作方式：'auto' = 关键词规则自动识别（默认）；非法值一律回退 auto
  const validModes: CreationMode[] = ['auto', 'real', 'ai', 'hybrid'];
  const requestedMode: CreationMode = body.mode && validModes.includes(body.mode) ? body.mode : 'auto';
  const mode: ConcreteMode = requestedMode === 'auto' ? detectCreationMode(text) : requestedMode;

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
      { role: 'system', content: buildSystemPrompt(mode, count, extra) },
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

  // 规范化镜头数据（序号重排 + 字段兜底；shotType 仅在合法值时保留）
  const shots: StoryboardShot[] = parsed.slice(0, 15).map((s, i) => ({
    shotNumber: typeof s.shotNumber === 'number' ? s.shotNumber : i + 1,
    sceneDescription: String(s.sceneDescription || ''),
    dialogue: String(s.dialogue || ''),
    duration: String(s.duration || '3秒'),
    cameraMove: String(s.cameraMove || '固定机位'),
    ...(s.shotType === 'real' || s.shotType === 'ai' ? { shotType: s.shotType } : {}),
  }));

  const MODE_TITLE: Record<ConcreteMode, string> = {
    real: '真人实拍', ai: 'AI视频', hybrid: '混合创作',
  };
  const title = (text.slice(0, 12) + (text.length > 12 ? '...' : '')) + ` · ${MODE_TITLE[mode]}分镜`;
  const id = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  // 写使用日志（success=1 即算扣次；记录创作方式便于后续分析识别准确率）
  writeUsageLog({
    cardId: cardId!,
    cardCode: cardCode!,
    action: 'storyboard',
    success: true,
    ip,
    userAgent,
    fingerprint,
    detail: { inputLen: text.length, shotsCount: shots.length, provider: ai.provider, cost, requestedMode, mode },
  });

  // 写生成历史
  saveGeneratedHistory({
    id,
    cardId: cardId!,
    cardCode: cardCode!,
    type: 'storyboard',
    inputText: text,
    outputJson: { title, shots, creationMode: mode },
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
      creationMode: mode,
      autoDetected: requestedMode === 'auto',
    }),
    auth,
  );
}
