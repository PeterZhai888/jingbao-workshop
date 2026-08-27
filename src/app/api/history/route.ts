import { NextRequest, NextResponse } from 'next/server';
import { authenticateCard } from '@/lib/server/auth';
import { listGeneratedHistory } from '@/lib/server/card-service';

export function GET(request: NextRequest) {
  const auth = authenticateCard(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error },
      { status: auth.status || 401 },
    );
  }
  const list = listGeneratedHistory(auth.cardId!, 100);

  // 映射为前端需要的结构：HistoryItem（StoryboardResult | TitleResult）
  const items = list.map((r) => {
    if (r.type === 'storyboard') {
      const out = r.output as { title: string; shots: unknown[] };
      return {
        id: r.id,
        type: 'storyboard' as const,
        title: out.title || '分镜脚本',
        createdAt: r.createdAt,
        inputText: r.inputText,
        shots: out.shots || [],
      };
    } else {
      const out = r.output as { titles: string[] };
      return {
        id: r.id,
        type: 'titles' as const,
        title: '爆款标题',
        createdAt: r.createdAt,
        inputText: r.inputText,
        titles: out.titles || [],
      };
    }
  });

  return NextResponse.json({ success: true, items });
}
