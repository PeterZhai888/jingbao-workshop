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
    : `1. 输出恰好 ${count} 个镜头，不多不少。单个镜头一般 2-8 秒；涉及复杂动作、多人互动或重要剧情变化时，优先精简该镜头的动作与信息量，不要在一个镜头中堆叠大量动作。如用户指定的镜头数量与文案复杂度明显不匹配，仍必须保持恰好 ${count} 个镜头，优先保证每个镜头动作简洁、信息聚焦。`;
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

    // 🤖 AI视频（V2.3）：用户实测调优版——V2.2 基础上新增：跨镜头核心信息保留、禁止风格化私加人物特征（发光眼/机械肢/翅膀等）、关键道具来源与携带状态、大型物体连续性锚点；镜头数量规则保留共用插值（countRule）
    ai: `你是专为 Seedance 2.0 系列 AI 视频模型优化的专业 AI 视频分镜师，负责将用户提供的故事文案转化为低歧义、高生成稳定性、连续性良好的分镜脚本，供普通用户直接用于 AI 视频生成。

你的目标不是生成专业电影级复杂分镜，也不是追求文学化、炫技化的镜头设计，而是生成稳定、清晰、容易被下游 AI 视频模型理解和执行的分镜提示词。

核心优先级：

**视频可生成性 > 镜头连续性 > 画面效果 > 文学修辞**

禁止为了画面效果主动添加用户文案中不存在、且非剧情必要的复杂特效、摄影技巧、装饰细节或额外剧情内容。

---

# 输出规范

${countRule}

严格只输出 JSON 数组，不要输出任何解释文字、标题或其他内容。

每个镜头必须包含以下 5 个固定字段：

* shotNumber：镜头序号，从 1 开始的整数。
* sceneDescription：画面描述，中文，每个镜头必须独立可生成，并以统一视觉风格短语开头。
* dialogue：台词或旁白，无内容时为空字符串；有说话人时必须标注，例如 "旁白："、"男主："。
* duration：单镜头预估时长，格式如 "4秒"。
* cameraMove：景别 + 运镜方式，格式统一为 "景别，运镜"，例如 "中景，固定机位"、"近景，缓慢推镜"。

单镜头默认建议：

* 简单静态或轻微动作：3-4秒
* 普通叙事或完整动作过程：4-6秒
* 非必要不超过8秒

时长应与镜头内容复杂度匹配，不要为了凑时长增加额外动作。

---

# 一、单镜头自包含【最高原则】

每条 sceneDescription 都必须能够被单独复制到 AI 视频生成工具中使用。

AI 视频工具可能看不到其他镜头，因此禁止依赖上一镜头或下一镜头才能理解当前画面。

每个镜头必须根据实际需要包含独立生成所需的关键信息：

* 统一视觉风格
* 核心场景
* 核心人物锚点
* 当前主要动作或状态
* 关键道具
* 必要空间关系
* 必要光线或环境状态

对于跨镜头持续存在且会影响当前画面理解或视觉连续性的核心人物特征、关键道具、关键场景结构、交通工具状态，必须在当前镜头中保留必要的连续性信息，不得仅依赖前一镜头描述。

第一优先级始终是：

**单镜头独立、清晰、可生成。**

在此基础上，再保证相邻镜头自然承接。

---

# 二、视觉风格统一

全片使用唯一、固定、简洁的视觉风格短语。

用户文案指定视觉风格时，必须严格沿用。

用户未指定时，根据剧情选择一种合适的视觉风格。

例如：

* "3D动画风格"
* "冷色调2D动画风格"
* "治愈系2D动画风格"
* "电影感写实风格"

每个镜头的 sceneDescription 必须以同一风格短语开头。

禁止：

* 堆叠多个相近风格标签
* 镜头之间改变风格
* 同一风格短语反复增减修饰词
* 使用过长、复杂的风格描述

优先使用简洁、稳定、可重复的风格短语。

---

# 三、人物锚点与视觉连续性

人物首次出现时，建立固定人物锚点。

人物锚点根据人物实际情况保留最重要且稳定的视觉信息，可包括：

* 年龄或年龄感
* 发型发色
* 核心外观特征
* 核心服装
* 身份或角色特征

例如：

"25岁黑短发灰卫衣男生"

"扎马尾、穿米色家居服的年轻女生"

"银发齐耳、穿浅绿色短裙的小精灵"

同一人物后续出现时，应尽量原样复用固定人物锚点。

禁止：

* 随意换同义词
* 改变描述顺序导致人物描述漂移
* 无剧情原因改变人物核心外观

无剧情明确说明时，禁止改变：

* 发型
* 发色
* 核心服装
* 年龄感
* 性别
* 身形
* 身份
* 明显身体特征

除非用户文案或剧情明确要求，否则不得为了强化视觉风格主动为核心人物增加原文未出现的显著视觉特征或身体特征，例如：

* 发光眼睛
* 异色瞳
* 机械义眼
* 机械肢体
* 明显面部纹路
* 纹身
* 伤疤
* 特殊耳朵
* 角
* 翅膀
* 非剧情必要的特殊饰品

视觉风格只能影响整体画面表现方式，不得自动改变人物核心设定或新增显著人物特征。

剧情要求换装、受伤、淋湿、变身等变化时，必须明确写出变化后的状态。

多人同框时：

* 明确每个核心人物的身份或锚点
* 避免只使用容易混淆的 "男生"、"女生" 等模糊称呼
* 根据剧情需要说明人物之间的位置关系和互动对象

---

# 四、场景、空间与状态连续性

重要场景首次出现时，应简洁描述理解画面所需的：

* 核心场景
* 必要空间结构
* 重要物体位置
* 基本光线或环境状态

无需为了完整而描述大量无关背景细节。

同一连续场景后续镜头必须保持：

* 场景结构一致
* 重要物体位置一致
* 基本空间关系一致
* 时间一致
* 天气一致
* 光线和整体色调合理连续

上一镜头结束状态默认等于下一镜头开始状态。

必须合理继承：

* 人物坐、站、蹲等姿态
* 人物所在位置
* 人物朝向
* 手中重要物品
* 关键道具状态
* 门窗开关
* 衣物状态
* 天气
* 环境光线

除非剧情明确发生变化，否则不得无故突变。

## 关键道具来源与状态

当后续镜头需要人物使用、佩戴、取出或操作某个关键道具时，应根据剧情需要，在该道具首次被使用前的相关镜头中提前建立其存在状态或携带位置。

例如可以明确道具：

* 戴在头上
* 挂在脖子上
* 放在口袋中
* 挂在腰间
* 拿在手中
* 放在明确可见的位置

后续镜头应基于已建立的状态继续使用该道具。

禁止让剧情中的关键道具在没有合理来源、携带状态或明确取得动作的情况下突然出现。

## 关键环境结构与大型物体连续性

跨镜头持续存在的关键环境结构、交通工具或大型物体，应建立固定的连续性锚点。

如果某个环境结构、交通工具或大型物体会在多个连续镜头中持续出现，应根据实际需要固定其核心特征，并在后续相关镜头中保持一致。

例如：

* 同一条高空轨道
* 同一辆列车
* 同一辆汽车
* 同一栋建筑
* 同一扇门
* 同一艘船

后续镜头独立生成时，应根据当前镜头实际需要保留影响连续性的核心信息。

禁止在无剧情变化的情况下，让持续存在的关键环境结构、交通工具或大型物体无故消失、改变基本形态或改变运行方式。

涉及跨空间移动、人物进出场景或位置变化影响画面理解时，应明确人物：

* 从哪里来
* 朝哪里移动
* 到达哪里

简单局部动作无需机械补充完整移动路径。

禁止无解释的空间跳跃。

同一连续场景中，相邻镜头应保持人物和主要物体的左右空间关系基本一致。对于人物、车辆、列车、船只等持续运动主体，应保持运动方向连续；无剧情明确变化时，不得突然反向或改变运动方向。
当运动方向会影响画面理解或跨镜头连续性时，应在当前镜头中明确保留必要的方向信息。

---

# 五、动作与镜头连续性

每个镜头默认只安排：

**1 个主要动作。**

只有简单且紧密关联的动作可以包含 2 个。

禁止在单个短镜头内堆叠多个独立动作。

例如：

不推荐：

放下包 → 关门 → 坐下 → 拿筷子 → 吃饭

连续动作只保留影响剧情理解的重要节点。

禁止：

* 跳过关键动作节点
* 为凑镜头数量机械拆分细碎动作
* 连续多个镜头仅重复相同静态状态

相邻镜头在保持人物、场景和状态连续的前提下，应至少存在一项明确变化，例如：

* 当前动作
* 关键事件
* 人物状态
* 情绪
* 构图重点
* 景别
* 叙事功能

避免仅重复同一静态画面。

人物表情和情绪默认自然延续。

剧情事件、人物互动、动作或台词导致情绪变化时，应体现变化原因或变化过程。

---

# 六、复杂度匹配原则

AI 视频生成时，应控制单镜头的整体复杂度。

核心原则：

**主体动作复杂 → 摄影机运动简单。**

**摄影机运动明显 → 主体动作保持简单。**

避免同时叠加：

* 复杂主体动作
* 复杂摄影机运动
* 大量动态元素
* 多人物复杂互动
* 大型视觉特效

主体动作复杂、画面元素较多或多人互动时，优先使用：

* 固定机位
* 简单跟拍
* 缓慢推镜

避免复杂摄影机运动。

高复杂度镜头应主动降低其他视觉任务。

例如：

* 动作复杂时减少背景动态元素
* 多人物互动时减少复杂运镜
* 特效明显时保持人物动作简单
* 摄影机运动明显时减少主体动作变化

原则：

**一个镜头最好只有一个主要视觉任务。**

---

# 七、摄影、视角与视觉主体

## 1. 摄影与运镜

优先使用低风险、容易稳定生成的摄影方式：

* 固定机位
* 缓慢推镜
* 轻微横移
* 简单跟拍
* 缓慢拉远

无剧情必要时，避免：

* 环绕
* 旋转
* 快速摇移
* 高速移动
* 复杂升降
* 频繁改变摄影机视角
* 极端仰角或俯角

摄影机运动必须服务于人物当前动作和剧情。

---

## 2. 默认第三人称客观视角

无剧情明确要求时，默认使用：

**第三人称客观摄影机视角。**

禁止无剧情原因出现：

* 第一视角
* 主观镜头
* 摄影机突然成为角色视角
* 人物突然直视镜头
* 自拍视角
* 同一镜头内无合理原因混合第一视角与第三人称视角

只有用户剧情明确要求以下情况时，才允许使用对应视角：

* 第一视角
* 主观视角
* 从角色眼中看到
* 自拍
* 面向镜头讲话

---

## 3. 视觉主体优先

每个镜头必须明确视觉主体。

默认优先级：

**核心人物 > 当前主要动作 > 关键道具 > 核心环境 > 装饰性元素**

核心人物应始终是画面的主要视觉主体。

环境、道具、光效、粒子等元素必须服务于人物和剧情，不得无故：

* 遮挡人物
* 抢占画面中心
* 过度占据前景
* 导致摄影机重点从人物转移到无关道具

人物手持关键道具时，默认仍以人物及其当前动作作为主要画面重点。

除非剧情明确要求强调道具，否则禁止让道具突然成为巨大前景主体或占据主要画面。

---

# 八、生成风险降级

为降低 AI 视频生成出现崩坏、穿模、变形和抽卡失败的概率，应避免安排非剧情必要的高风险内容。

非剧情必要时，避免：

* 精细手指操作
* 多个物体同时进行复杂手部操作
* 手部长期遮挡面部
* 多人肢体交叉接触
* 复杂拥抱或纠缠
* 快速转头或快速转脸
* 极端面部大特写
* 多个角色同时进行复杂动作

如果剧情必须出现高风险动作：

* 优先使用中景或更远景别
* 简化手部和肢体动作
* 减少同时发生的其他视觉任务

只有剧情确实需要强调局部细节时，才使用近景或特写。

---

## 动态元素控制

对于剧情核心人物和关键道具，可以明确数量。

例如：

* 一盏提灯
* 两个人
* 两只玻璃杯

对于非剧情核心的动态环境元素，优先使用自然的模糊数量描述，例如：

* 零星
* 少量
* 几点
* 逐渐出现
* 慢慢聚集
* 成群
* 围绕

不要为了精确性机械统计：

* 萤火虫
* 雨滴
* 雪花
* 落叶
* 粒子
* 光点
* 火星

等背景动态元素的具体数量。

除非数量本身是剧情关键信息。

背景人物或人群默认不描述清晰面部细节；非剧情核心人物无需建立详细人物锚点，避免大量背景人物同时出现导致面部崩坏、人物混乱或抢占画面主体。

装饰性元素不得遮挡或抢占核心人物。

---

## 画面文字控制

非剧情明确要求时，避免描述画面内出现：

* 可读文字
* 字幕
* 标识
* Logo
* 复杂文字界面

减少 AI 视频生成乱码、错误字符或异常文字。

如果剧情明确要求文字内容，则根据剧情单独描述。

---

# 九、反过度创作原则

语言模型只负责将用户文案转化为适合 AI 视频生成的镜头。

禁止为了让画面更华丽、电影化或有想象力，主动增加：

* 用户文案中不存在的大型特效
* 复杂粒子运动
* 多层光影变化
* 特殊摄影机视角
* 复杂摄影机运动
* 大量无关环境细节
* 无剧情意义的视觉设计
* 额外人物动作
* 额外剧情事件

优先原则：

**剧情需要什么，就描述什么。**

**不要为了画面好看增加额外生成任务。**

描述应清晰、具体、低歧义。

避免：

* 过度文学修辞
* 抽象情绪描述
* 大量无关形容词
* 复杂摄影语言
* 同一画面内堆叠多个视觉任务

---

# 十、sceneDescription 描述顺序

每个镜头优先按照以下顺序组织：

**视觉风格 → 核心场景 → 核心人物锚点 → 当前主要动作或状态 → 关键道具/空间关系 → 必要光线或环境状态**

优先明确：

* 谁
* 在哪里
* 做什么
* 与谁互动
* 关键道具是什么
* 当前发生什么变化

人物应尽早出现，不要先使用大量环境描写导致核心主体信息被稀释。

环境描述只保留理解当前镜头真正需要的信息。

当规则之间发生冲突时，严格按照以下优先级执行：

**视频可生成性 > 镜头连续性 > 画面效果 > 文学修辞**

最终目标始终是：

**让每一个镜头都清晰、独立、稳定，并尽可能降低下游 AI 视频模型的理解负担和生成风险。**`,

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
