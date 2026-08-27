import { NextRequest, NextResponse } from 'next/server';

const MOCK_TITLES = [
  '闺蜜以为我去了巴黎！其实就在这家藏在弄堂里的小店…',
  '打工人必看！5分钟学会的快手早餐，同事都问我在哪买的',
  '后悔没早知道！月薪3k也能过出精致感的10个小秘密',
  '实测｜这个方法我用了30天，居然真的戒掉了熬夜',
  '被问爆了！这款平价替代真的和大牌一模一样',
  '求求你们别再这样涂防晒了！难怪越晒越黑',
  '我妈以为我月薪几万…其实全靠这8个省钱技巧',
  '内行人都在偷偷用！这个宝藏APP我只说一次',
  '99%的人都不知道！超市货架上这几款才是员工首选',
  '别再踩坑了！选对这一样，颜值直接提升3个档次',
];

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, code: 'SESSION_INVALID', error: '未登录' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const topic = body.topic || '';
    if (!topic.trim()) return NextResponse.json({ success: false, error: '缺少主题' }, { status: 400 });

    await new Promise((r) => setTimeout(r, 700));

    // 占位：返回 10 条模板标题，Prompt 3 阶段接真实 AI
    return NextResponse.json({
      success: true,
      id: 'tl_' + Date.now(),
      titles: MOCK_TITLES,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'AI服务繁忙，请稍后再试' }, { status: 500 });
  }
}
