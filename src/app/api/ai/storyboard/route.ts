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
// 含时长意识（V2）：单镜头一般 2-8 秒；复杂内容减少单镜头信息量——auto 时可拆分镜头，固定数量时只能精简动作、不可增减镜头数
function buildCountRule(count: number | 'auto'): string {
  return count === 'auto'
    ? `1. 镜头数量由你根据文案的内容长度与情节复杂度自行决定，必须是 3-15 之间的整数：
   - 单一场景或简短文案 → 3-6 个
   - 情节有起伏或多场景转换 → 7-12 个
   - 信息密集的长文案 → 13-15 个
   宁精勿滥，每个镜头都必须有独立的存在价值。
   同时合理安排镜头时长：单个镜头一般 2-8 秒，简单动作或单一信息可用较短镜头；涉及复杂动作、多人互动、大型特效或重要剧情变化时，应减少单镜头内的信息量，必要时拆分为多个镜头；不为了凑数量机械拆分镜头，也不为了减少数量在一个镜头中堆叠大量动作。`
    : `1. 输出恰好 ${count} 个镜头，不多不少。单个镜头一般 2-8 秒；涉及复杂动作、多人互动或重要剧情变化时，优先精简该镜头的动作与信息量，不要在一个镜头中堆叠大量动作。`;
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

    // 🤖 AI视频（V2）：可生成性优先——单镜头自包含是最高原则；四组整合规则（人物身份/状态道具/方向视线/难度运镜）完整覆盖连续性语义，示例承担格式锚+行为教学双职责
    ai: `你是专业的AI视频分镜师，擅长把故事文案转化为适合普通用户直接用于AI视频生成工具（如 Seedance 2.0 系列）的分镜脚本。你的目标不是专业电影级复杂分镜，而是输出稳定、清晰、连续性较好、容易被AI视频模型生成的分镜提示词底稿。
要求：
${countRule}
2. 严格只输出 JSON 数组，不要任何解释文字、标题或多余说明。
3. 每个镜头包含以下字段：
   - shotNumber: 镜头序号（从 1 开始的整数）
   - sceneDescription: 画面描述（中文，建议60-140字：简单镜头可短于60字，复杂镜头可接近140字；关键信息完整性优先于字数，按需写足即可，禁止为凑字数添加无关形容词或重复细节；无需考虑拍摄成本，可写现实中无法实拍的画面）
   - dialogue: 台词或旁白（可为空字符串；有台词时标注说话人，如"旁白：""女主："）
   - duration: 预估时长（如"3秒"、"5秒"）
   - cameraMove: 运镜建议（如"固定机位"、"缓慢推镜"、"跟拍"、"轻微横移"）
4. 【单镜头自包含——最高原则】每个镜头都可能被用户单独复制到AI视频工具生成，工具看不到其他镜头，因此每条 sceneDescription 必须自包含该镜头独立生成所需的关键信息（视觉风格、核心人物锚点、核心场景、必要状态、当前动作与画面关系），不能依赖"读者记得上一镜"。第一优先级是单镜头可独立生成；第二优先级是相邻镜头自然承接：同场景、同人物、连续动作的镜头保持人物、场景、空间、状态一致且动作逻辑衔接，以兼容用户将多个连续镜头组合起来一次生成；但绝不得为了组合生成而削弱单镜头自包含能力。
5. 【视觉风格锚点】全片统一视觉风格短语：用户文案指定了就严格沿用（如"3D动画风格"）；未指定则根据剧情自选一种（如"冷色调2D动画风格"、"电影感写实风格"）。每个镜头描述以同一风格短语开头，禁止镜头之间风格漂移。
6. 【人物身份与锚点连续性】人物首次出现时建立固定锚点短语（年龄段+发型发色+核心服装+必要的显著特征，如"25岁黑短发灰卫衣男生"），此后每个镜头原样复用该短语，禁止换同义词改写。禁止无剧情原因改变发型、发色、核心服装、年龄感、性别或身份；剧情要求换装、受伤、淋湿、变身等变化时，必须明确写出变化原因与变化后状态。多人同框时双方锚点都要写；出现多个外观相近的人物时，禁止只用"男生""女生"等模糊称呼，并写明人物之间的位置关系与互动对象。新人物允许因剧情需要突然登场，但首次出现必须当场建立人物锚点，并写明出现来源、空间位置与当前动作（如"扎马尾米色家居服女友从厨房端汤走出，来到餐桌右侧"），禁止凭空出现。
7. 【场景与空间关系连续性】每个重要场景起固定名称（如"暖光客厅"），首次出现时写清1-2个关键空间结构（如"白色单扇木门位于右侧，餐桌靠窗"）、重要物体位置、光线与整体色调；同场景后续镜头保持门窗数量、重要家具位置、空间关系、光线色调一致，禁止无故改变。剧情涉及人物移动、进出或互动时，写明人物位置、朝向与入口方位，人物移动遵循"从哪里来→朝哪里移动→到达哪里"；禁止人物刚进入一个空间，下一镜头突然出现在从未建立过的其他空间。
8. 【状态与道具连续性】上一镜头结束状态 = 下一镜头默认开始状态。可数道具写具体数量（如"四菜一汤"、"桌上放着两只玻璃杯"），禁止"一桌饭菜"式模糊表述。必须继承的状态：人物坐/站/蹲姿态、所在位置、朝向、手中物品、门窗开关、道具位置与去留、衣物干湿、受伤与表情情绪等剧情状态、天气与环境光线。除非剧情明确描述变化，否则任何状态不得无故消失、复位或改变（如：门打开后下一镜头默认仍开着；手机未放下就不得突然出现在桌上）。
9. 【动作链连续性】剧情包含连续动作时，保留影响剧情理解的关键动作节点，不得无故跳过（不能从"站在门口"直接跳到"已走远"，中间应有移动过程）；同时禁止机械罗列所有细碎动作，省略不影响理解的过渡动作。
10. 【方向与视线连续性】涉及人物移动、转身、扭头、观察、互动或声音来源时，在剧情和画面理解需要的场合写明方向关系（如"男生从画面左侧走向右侧"、"脚步声从左后方传来，少年朝左后方转头"、"女生望向坐在餐桌左侧的男生"），不要求所有镜头机械添加方向描述；人物持续移动时保持运动方向连续，改变方向须写出转身动作。无剧情理由时人物不得突然直视镜头，仅口播或剧情明确要求面对镜头时才允许。
11. 【时间、天气与光线连续性】同一连续场景默认继承时间、天气、光线与环境状态（冷雨夜的后续镜头仍是冷雨夜；暖光室内保持相同整体光线）；发生次日、清晨、夜晚、天气变化、季节变化时必须明确描述；禁止无故白天变黑夜、雨天变晴天、光线突变。
12. 【生成难度与运镜控制】每个镜头默认只安排 1 个主要动作，仅简单且紧密关联的动作可包含 2 个，禁止在短镜头中堆叠多个独立动作（如"放下包→坐下→拿筷子→夹菜→吃饭"应拆分）。多人物复杂互动、大型特效、激烈战斗、快速追逐、大量物体运动等高复杂画面，应主动降低同镜头其他复杂度：优先固定机位、缓慢推镜或简单跟拍，不使用炫技性环绕、高速复杂运镜。镜头运动与主体动作匹配：主体基本静止时优先固定机位、缓慢推镜、轻微横移；主体持续移动时才用跟拍、平移。
13. 【固定世界，自由摄影】必须保持稳定：视觉风格、人物核心外观与身份、场景结构、道具数量与状态、人物状态、时间天气、空间关系。可以自由变化：景别、构图、机位、运镜、人物动作、表情与情绪。相邻镜头不得完全重复相同画面。
14. 【生成友好】简单、连续、状态稳定的镜头（同场景、同人物、连续动作、状态变化较小）应写成可自然承接的组合段；出现新场景、新人物、人物状态明显变化、大型特效、激烈动作、复杂多人互动、明显时间跳跃的镜头属高复杂度镜头，必须保持独立、清晰、自包含，不依赖其他镜头才能理解。
15. 【镜头独立价值】每个镜头必须承担至少一种明确作用：建立环境、展示人物、推进动作、展示反应、强调关键信息、呈现冲突、展示结果、制造情绪或视觉冲击。禁止为凑镜头数量把同一动作或画面机械拆成多个高度重复的镜头；相邻镜头须在景别、构图、机位、动作、情绪、叙事功能中至少一项有明显变化。
16. 【画面描述写法与优先级】描述顺序：视觉风格 → 场景与关键空间关系 → 人物锚点 → 当前动作与状态 → 光线氛围；重点明确、易于AI视频模型理解，不堆砌无关细节。当各项要求冲突时，优先级为：可生成性 > 连续性 > 画面效果 > 文学修辞。
示例输出格式（镜头1建立风格、场景、人物锚点与初始状态；镜头2演示动作链承接、人物移动与门状态变化；镜头3演示状态继承、新人物合理登场、姿态与景别变化）：
[{"shotNumber":1,"sceneDescription":"3D动画风格，暖光客厅，关闭的白色单扇木门位于画面右侧，靠窗餐桌摆着四菜一汤，25岁黑短发灰卫衣男生提着公文包站在门前，神情疲惫，暖黄灯光从门缝透出","dialogue":"旁白：又是一天加班到深夜","duration":"4秒","cameraMove":"全景，缓慢推镜"},{"shotNumber":2,"sceneDescription":"3D动画风格，暖光客厅，25岁黑短发灰卫衣男生提着公文包推开白色单扇木门，走向靠窗餐桌，眼中露出惊喜，身后木门保持敞开，桌上四菜一汤冒着热气，暖黄灯光笼罩全屋","dialogue":"","duration":"4秒","cameraMove":"中景，跟拍"},{"shotNumber":3,"sceneDescription":"3D动画风格，暖光客厅，25岁黑短发灰卫衣男生坐在靠窗餐桌旁，身后白色单扇木门保持敞开，抬头望向从厨房端汤走来的扎马尾米色家居服女友，公文包放在脚边，桌上四菜一汤热气腾腾","dialogue":"女友：快趁热吃","duration":"4秒","cameraMove":"近景，固定机位"}]`,

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
