'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

/**
 * AI 生成等待进度指示（阶段性文案轮播，缓解 30-45 秒等待焦虑）
 * 每个阶段约 6 秒轮换，最后一条停留在"即将完成"
 */
export function GeneratingProgress({ stages }: { stages: string[] }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStage((s) => Math.min(s + 1, stages.length - 1));
    }, 6000);
    return () => clearInterval(timer);
  }, [stages.length]);

  const progress = Math.round(((stage + 1) / stages.length) * 100);

  return (
    <div className="py-16 text-center space-y-5">
      <div className="relative mx-auto h-14 w-14">
        <Loader2 className="h-14 w-14 animate-spin text-primary/20" />
        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
      </div>
      <div className="space-y-2.5 max-w-xs mx-auto">
        <p key={stage} className="text-sm font-medium text-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
          {stages[stage]}
        </p>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progress, 8)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">AI 生成约需 10-40 秒，请勿离开本页</p>
      </div>
    </div>
  );
}
