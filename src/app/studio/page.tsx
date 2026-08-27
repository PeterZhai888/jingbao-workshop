'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ProtectedPage from '@/components/protected-page';
import { StoryboardTool } from '@/components/tools/storyboard-tool';
import { TitlesTool } from '@/components/tools/titles-tool';
import { Clapperboard, Sparkles, History } from 'lucide-react';

const TOOLS = [
  { key: 'storyboard', label: '文本转分镜', desc: '文案一键生成分镜表', icon: Clapperboard, color: 'text-primary' },
  { key: 'titles', label: 'AI爆款标题', desc: '一次生成10组标题', icon: Sparkles, color: 'text-fuchsia-500' },
] as const;

function StudioInner() {
  const searchParams = useSearchParams();
  const tool = searchParams.get('tool') === 'titles' ? 'titles' : 'storyboard';

  return (
    <ProtectedPage>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧功能菜单（桌面竖排 / 移动端横排） */}
        <aside className="lg:w-56 shrink-0">
          <div className="lg:sticky lg:top-20 space-y-1.5">
            <div className="hidden lg:block text-xs font-semibold text-muted-foreground px-3 mb-2">
              创作工具
            </div>
            <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                const active = tool === t.key;
                return (
                  <Link
                    key={t.key}
                    href={`/studio?tool=${t.key}`}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent hover:border-border/60'
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? '' : t.color}`} />
                    <span className="flex flex-col lg:flex-col">
                      {t.label}
                      <span className={`text-xs font-normal ${active ? 'text-primary-foreground/80' : 'text-muted-foreground/80'}`}>
                        {t.desc}
                      </span>
                    </span>
                  </Link>
                );
              })}
              <Link
                href="/history"
                className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <History className="h-5 w-5 shrink-0" />
                <span className="flex flex-col">
                  历史记录
                  <span className="text-xs font-normal text-muted-foreground/80">查看生成过的内容</span>
                </span>
              </Link>
            </nav>
          </div>
        </aside>

        {/* 右侧工作区 */}
        <main className="flex-1 min-w-0">
          {tool === 'storyboard' ? <StoryboardTool /> : <TitlesTool />}
        </main>
      </div>
    </ProtectedPage>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <StudioInner />
    </Suspense>
  );
}
