'use client';

import { useEffect, useState } from 'react';
import ProtectedPage from '@/components/protected-page';
import { useCardAuth } from '@/lib/card-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  History as HistoryIcon,
  Clapperboard,
  Sparkles,
  Calendar,
  Loader2,
  ChevronRight,
  FileJson,
  Inbox as Empty,
  Trash2,
} from 'lucide-react';
import type { HistoryItem, StoryboardResult, TitleResult } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isStoryboard(item: HistoryItem): item is StoryboardResult {
  return item.type === 'storyboard';
}

export default function HistoryPage() {
  const { session } = useCardAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/history', {
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.items || []);
      } else if (data.code === 'SESSION_INVALID') {
        // 忽略，路由会处理
      } else {
        // 如果后端未就绪，使用localStorage降级
        const local = localStorage.getItem('ai_video_tool_history');
        if (local) {
          try {
            setItems(JSON.parse(local));
          } catch { /* ignore */ }
        }
      }
    } catch {
      // 网络失败时降级
      const local = localStorage.getItem('ai_video_tool_history');
      if (local) {
        try {
          setItems(JSON.parse(local));
        } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [session]);

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selected?.id === id) setSelected(null);
    // 同步到本地
    localStorage.setItem('ai_video_tool_history', JSON.stringify(items.filter((i) => i.id !== id)));
    toast.success('已删除该记录');
  };

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <HistoryIcon className="h-7 w-7 text-primary" />
            历史记录
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm sm:text-base">
            查看和管理你过往生成的分镜脚本与爆款标题
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* 列表 */}
          <Card className="lg:col-span-2 border-border/60 h-fit max-h-[70vh] overflow-hidden flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  生成记录
                </span>
                <Badge variant="secondary">{items.length} 条</Badge>
              </CardTitle>
              <CardDescription>最近生成的内容会显示在上方</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto pt-0">
              {loading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                    <Empty className="h-7 w-7" />
                  </div>
                  <p className="text-sm text-muted-foreground">暂无历史记录</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">去生成你的第一条分镜或标题吧</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => {
                    const isStory = isStoryboard(item);
                    const active = selected?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelected(item)}
                        className={`group rounded-xl border p-3 cursor-pointer transition-all ${
                          active
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border/60 hover:border-primary/40 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${
                              isStory
                                ? 'bg-blue-100 text-primary'
                                : 'bg-fuchsia-100 text-fuchsia-600'
                            }`}
                          >
                            {isStory ? <Clapperboard className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="text-xs h-5">
                                {isStory ? '分镜脚本' : '爆款标题'}
                              </Badge>
                              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${active ? 'rotate-90' : ''}`} />
                            </div>
                            <div className="mt-1.5 text-sm font-medium line-clamp-1">
                              {isStory ? item.title : item.inputText}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(item.createdAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 详情 */}
          <Card className="lg:col-span-3 border-border/60">
            <CardHeader className="flex-row items-start justify-between space-y-0 gap-3 flex-wrap">
              <div>
                <CardTitle className="text-lg">
                  {selected ? (
                    <span className="flex items-center gap-2">
                      {isStoryboard(selected) ? (
                        <><Clapperboard className="h-5 w-5 text-primary" /> {selected.title}</>
                      ) : (
                        <><Sparkles className="h-5 w-5 text-fuchsia-500" /> 爆款标题 · {selected.inputText}</>
                      )}
                    </span>
                  ) : (
                    '记录详情'
                  )}
                </CardTitle>
                <CardDescription>
                  {selected ? formatDate(selected.createdAt) : '选择左侧记录查看详情'}
                </CardDescription>
              </div>
              {selected && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="gap-1.5 h-9 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除？</AlertDialogTitle>
                      <AlertDialogDescription>
                        删除后不可恢复，确定要删除这条记录吗？
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(selected.id)} className="bg-destructive hover:bg-destructive/90">
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardHeader>
            <CardContent>
              {!selected ? (
                <div className="py-20 text-center">
                  <div className="mx-auto h-16 w-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
                    <FileJson className="h-8 w-8" />
                  </div>
                  <p className="text-muted-foreground">点击左侧记录查看详情</p>
                </div>
              ) : isStoryboard(selected) ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-50 border border-border/60 p-4 text-sm">
                    <div className="font-semibold text-primary text-xs mb-1.5">输入文案</div>
                    <p className="leading-relaxed text-muted-foreground whitespace-pre-wrap">{selected.inputText}</p>
                  </div>
                  <div className="space-y-2.5">
                    {selected.shots.map((shot) => (
                      <div
                        key={shot.shotNumber}
                        className="rounded-xl border border-border/60 p-4 bg-white"
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="secondary" className="bg-primary text-primary-foreground">
                            镜头 {String(shot.shotNumber).padStart(2, '0')}
                          </Badge>
                          <Badge variant="outline" className="text-xs">时长 {shot.duration}</Badge>
                          <Badge variant="outline" className="text-xs text-fuchsia-700 border-fuchsia-200 bg-fuchsia-50/50">
                            {shot.cameraMove}
                          </Badge>
                        </div>
                        <div className="text-sm">
                          <span className="font-semibold text-xs">画面 · </span>
                          <span className="leading-relaxed">{shot.sceneDescription}</span>
                        </div>
                        {shot.dialogue && (
                          <div className="mt-2 rounded-lg bg-slate-50 border-l-2 border-indigo-400 px-3 py-2 text-sm">
                            <span className="font-semibold text-indigo-600 text-xs">台词 · </span>
                            <span>{shot.dialogue}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-50 border border-border/60 p-4 text-sm">
                    <div className="font-semibold text-fuchsia-600 text-xs mb-1.5">视频主题</div>
                    <p className="leading-relaxed text-muted-foreground">{selected.inputText}</p>
                  </div>
                  <div className="space-y-2.5">
                    {selected.titles.map((t, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border/60 bg-white p-3.5 text-sm flex items-start gap-3"
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-700 text-xs font-bold">
                          {i + 1}
                        </span>
                        <p className="leading-relaxed">{t}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedPage>
  );
}
