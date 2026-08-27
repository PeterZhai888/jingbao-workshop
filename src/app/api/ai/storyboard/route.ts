import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard, checkSensitive } from '@/lib/server/auth';
import {
  writeUsageLog,
  touchCardUsage,
  saveGeneratedHistory,
} from '@/lib/server/card-service';

// =========== Prompt 2 占位实现（Prompt 3 阶段接入真实 LLM） ===========
// 当前依然返回模拟分镜，但已经完整：
//  - 鉴权通过
//  - 次数检查与扣减（通过 writeUsageLog action=storyboard success=1 来计数）
//  - 敏感词过滤
//  - 指纹/IP 校验
//  - 历史记录落库（generated_history）
//  - 成功后 touch + refreshUsage
const MOCK_SHOTS = [
  { shotNumber: 1, sceneDescription: '开场全景：交代场景与时间，营造氛围', dialogue: '', duration: '3秒', cameraMove: '固定机位' },
  { shotNumber: 2, sceneDescription: '主角入场：交代人物身份与状态', dialogue: '旁白：点题一句话，说明今天要讲的事', duration: '5秒', cameraMove: '推镜，中景→特写' },
  { shotNumber: 3, sceneDescription: '关键动作：突出核心操作或亮点', dialogue: '（环境音或轻快BGM）', duration: '4秒', cameraMove: '跟拍/近景' },
  { shotNumber: 4, sceneDescription: '情绪反应：给用户情绪共鸣或价值点', dialogue: '旁白：点出痛点解决/感受', duration: '6秒', cameraMove: '环绕运镜' },
  { shotNumber: 5, sceneDescription: '收尾+引导：引导点赞/关注/评论', dialogue: '字幕：加话题标签，评论区互动引导', duration: '3秒', cameraMove: '固定，淡出' },
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
      { success: false, code: 'DAILY_LIMIT', error: '今日AI生成次数已用完，请明天再来' },
      { status: 429 },
    );
  }

  let body: { text?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }
  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ success: false, error: '缺少输入文本' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ success: false, error: '文本过长，请精简到5000字以内' }, { status: 400 });

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

  // ========= Prompt3 这里会调用真实LLM =========
  // 模拟延迟
  await new Promise((r) => setTimeout(r, 600));
  const title = (text.slice(0, 12) + (text.length > 12 ? '...' : '')) + ' · 分镜脚本';
  const id = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const shots = MOCK_SHOTS;

  // 写使用日志（success=1 即算扣次）
  writeUsageLog({
    cardId: cardId!,
    cardCode: cardCode!,
    action: 'storyboard',
    success: true,
    ip,
    userAgent,
    fingerprint,
    detail: { inputLen: text.length, shotsCount: shots.length },
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

  return NextResponse.json({
    success: true,
    id,
    title,
    shots,
  });
}
