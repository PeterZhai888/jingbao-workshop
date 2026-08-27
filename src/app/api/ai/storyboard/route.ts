import { NextRequest, NextResponse } from 'next/server';

const MOCK_SHOTS = [
  { shotNumber: 1, sceneDescription: '清晨阳光透过窗帘，主角缓缓睁开眼睛，微笑看向窗外', dialogue: '', duration: '3秒', cameraMove: '固定机位，柔光' },
  { shotNumber: 2, sceneDescription: '主角走进厨房，拿起手冲咖啡壶，专注地注水', dialogue: '旁白：「美好的一天，从一杯手冲开始」', duration: '5秒', cameraMove: '推镜，中景→特写' },
  { shotNumber: 3, sceneDescription: '咖啡液缓缓滴入分享壶，琥珀色液体冒着热气', dialogue: '（白噪音：咖啡滴答声）', duration: '4秒', cameraMove: '微距俯拍，慢动作' },
  { shotNumber: 4, sceneDescription: '主角端着咖啡走到阳台，迎着阳光深呼吸', dialogue: '旁白：「生活需要仪式感，哪怕只有5分钟」', duration: '6秒', cameraMove: '环绕运镜' },
  { shotNumber: 5, sceneDescription: '咖啡杯特写，配字幕总结，画面渐暗', dialogue: '字幕：#生活方式 #手冲咖啡 #治愈系', duration: '3秒', cameraMove: '固定，淡出' },
];

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, code: 'SESSION_INVALID', error: '未登录' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const text = body.text || '';
    if (!text.trim()) return NextResponse.json({ success: false, error: '缺少输入文本' }, { status: 400 });

    // 占位：返回模拟分镜 + 基于输入前12字生成标题
    await new Promise((r) => setTimeout(r, 800)); // 模拟延迟

    const title = text.slice(0, 12) + (text.length > 12 ? '...' : '') + ' · 分镜脚本';

    return NextResponse.json({
      success: true,
      id: 'sb_' + Date.now(),
      title,
      shots: MOCK_SHOTS,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'AI服务繁忙，请稍后再试' }, { status: 500 });
  }
}
