import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard, checkSensitive } from '@/lib/server/auth';
import {
  writeUsageLog,
  touchCardUsage,
  saveGeneratedHistory,
} from '@/lib/server/card-service';

const MOCK_TEMPLATES = [
  '闺蜜都看傻了！这个{topic}也太绝了吧',
  '后悔没早知道！{topic}的正确打开方式',
  '99%的人都做错了！{topic}避坑指南',
  '被问爆了！这个{topic}我愿意安利给所有人',
  '打工人必看！5分钟搞定{topic}',
  '我妈以为我月薪几万…其实全靠这个{topic}',
  '实测｜{topic}真实体验，看完再决定买不买',
  '求求你们别再这样{topic}了！难怪没效果',
  '内行人偷偷在用！{topic}隐藏玩法大公开',
  '别再踩坑了！{topic}选对这一样就够了',
];

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
      { success: false, code: 'DAILY_LIMIT', error: '今日AI生成次数已用完，请明天再来' },
      { status: 429 },
    );
  }

  let body: { topic?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const topic = (body.topic || '').trim();
  if (!topic) return NextResponse.json({ success: false, error: '缺少主题' }, { status: 400 });
  if (topic.length > 200) return NextResponse.json({ success: false, error: '主题过长' }, { status: 400 });

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

  // ========= Prompt3 这里接真实 LLM =========
  await new Promise((r) => setTimeout(r, 500));
  const titles = MOCK_TEMPLATES.map((t) => t.replace('{topic}', topic));
  const id = 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  writeUsageLog({
    cardId: cardId!,
    cardCode: cardCode!,
    action: 'titles',
    success: true,
    ip,
    userAgent,
    fingerprint,
    detail: { topicLen: topic.length },
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

  return NextResponse.json({ success: true, id, titles });
}
