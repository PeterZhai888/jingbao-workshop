'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCardAuth } from '@/lib/card-auth';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bot, Sparkles } from 'lucide-react';

/** /api/ai/models 返回结构 */
interface UserModels {
  tierAccess: string;
  defaultProvider: string;
  providers: Array<{
    key: string;
    label: string;
    models: Array<{
      id: string;
      tier: string;
      tierLabel: string; // 如 "⚡ 极速版"
      cost: number;
      note: string;
    }>;
  }>;
}

export interface ModelSelection {
  provider?: string;
  model?: string;
  cost: number; // 1 = 默认/自动匹配
}

const STORAGE_KEY = 'ai_video_tool_model';
const AUTO: ModelSelection = { cost: 1 };

/** 模型选择器：自动匹配（默认）+ 各服务商模型（档位/成本/说明展示），选择存 localStorage */
export function ModelSelector({
  value,
  onChange,
}: {
  value: ModelSelection;
  onChange: (v: ModelSelection) => void;
}) {
  const { session } = useCardAuth();
  const [catalog, setCatalog] = useState<UserModels | null>(null);

  // 拉取可选模型列表
  useEffect(() => {
    if (!session?.token) return;
    fetch('/api/ai/models', { headers: { Authorization: `Bearer ${session.token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setCatalog(data as UserModels);
      })
      .catch(() => { /* 静默失败：仅显示自动匹配 */ });
  }, [session?.token]);

  // 恢复 localStorage 记忆（校验仍在目录内）
  useEffect(() => {
    if (!catalog) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const sel = JSON.parse(stored) as { provider?: string; model?: string };
      const ok = sel.provider && sel.model
        && catalog.providers.some(
          (p) => p.key === sel.provider && p.models.some((m) => m.id === sel.model),
        );
      if (ok) {
        const m = catalog.providers.find((p) => p.key === sel.provider)!.models.find((x) => x.id === sel.model)!;
        onChange({ provider: sel.provider, model: sel.model, cost: m.cost });
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const handleSelect = (val: string) => {
    if (val === 'auto') {
      localStorage.removeItem(STORAGE_KEY);
      onChange(AUTO);
      return;
    }
    const [provider, model] = val.split('::');
    const p = catalog?.providers.find((x) => x.key === provider);
    const m = p?.models.find((x) => x.id === model);
    if (!p || !m) return;
    const sel: ModelSelection = { provider, model, cost: m.cost };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model }));
    onChange(sel);
  };

  // 触发器显示文案
  const display = useMemo(() => {
    if (!value.provider || !value.model || !catalog) return '自动匹配';
    const p = catalog.providers.find((x) => x.key === value.provider);
    const m = p?.models.find((x) => x.id === value.model);
    if (!p || !m) return '自动匹配';
    return `${p.label} ${m.tierLabel}`;
  }, [value, catalog]);

  return (
    <div className="flex items-center gap-2">
      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select value={value.model ? `${value.provider}::${value.model}` : 'auto'} onValueChange={handleSelect}>
        <SelectTrigger className="h-9 w-auto gap-1.5 text-sm">
          <SelectValue placeholder="自动匹配" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>模型</SelectLabel>
            <SelectItem value="auto" className="gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                自动匹配
              </span>
              <span className="text-xs text-muted-foreground">（系统选择当前最优模型）</span>
              <span className="ml-auto pl-3 text-xs text-muted-foreground">1次</span>
            </SelectItem>
            {catalog?.providers.map((p) => (
              <SelectGroup key={p.key}>
                <SelectLabel>{p.label}</SelectLabel>
                {p.models.map((m) => (
                  <SelectItem key={`${p.key}::${m.id}`} value={`${p.key}::${m.id}`} className="gap-2">
                    <span className="flex flex-1 items-center justify-between gap-3 pr-1">
                      <span>
                        <span className="font-medium">{m.tierLabel}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{m.note}</span>
                      </span>
                      <span className={`text-xs ${m.cost > 1 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                        {m.cost}次
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground hidden sm:inline">{display}</span>
    </div>
  );
}
