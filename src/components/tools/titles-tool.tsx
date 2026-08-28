'use client';

import { useState } from 'react';
import { useCardAuth } from '@/lib/card-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Copy,
  CheckCircle2,
  Loader2,
  TrendingUp,
  Hash,
  RefreshCw,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { ModelSelector, type ModelSelection } from '@/components/model-selector';

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

const STYLE_TAGS: Record<string, string> = {
  '悬念好奇': 'bg-amber-50 text-amber-700 border-amber-200',
  '痛点共鸣': 'bg-rose-50 text-rose-700 border-rose-200',
  '干货实用': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '反差对比': 'bg-violet-50 text-violet-700 border-violet-200',
  '数字清单': 'bg-sky-50 text-sky-700 border-sky-200',
  '情绪价值': 'bg-pink-50 text-pink-700 border-pink-200',
};

function detectStyle(title: string): string {
  if (/[0-9一二三四五六七八九十]+.*?个|步|招|秒|分钟/.test(title)) return '数字清单';
  if (/后悔|居然|没想到|别再|求求|踩坑|99%|内行人/.test(title)) return '悬念好奇';
  if (/必看|技巧|学会|实测|干货|攻略/.test(title)) return '干货实用';
  if (/以为|其实|对比|替代|一模一样|平价/.test(title)) return '反差对比';
  if (/戒掉|提升|精致|治愈|美好|小确幸/.test(title)) return '情绪价值';
  return '痛点共鸣';
}

export function TitlesTool() {
  const { session, refreshUsage, logout } = useCardAuth();
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [titles, setTitles] = useState<string[] | null>(null);
  const [meta, setMeta] = useState<{ id: string; topic: string } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [model, setModel] = useState<ModelSelection>({ cost: 1 });

  const handleGenerate = async (useMock = false) => {
    if (!topic.trim()) {
      toast.error('请输入视频主题或核心内容');
      return;
    }
    if (session && session.dailyUsed + model.cost > session.dailyLimit) {
      const base = session.dailyUsed >= session.dailyLimit ? '今日次数已用完，请明天再来哦' : `剩余次数不足（本次需消耗${model.cost}次），请更换低档位模型`;
      toast.error(session.exhaustedTip ? `${base}\n${session.exhaustedTip}` : base, { duration: session.exhaustedTip ? 6000 : 4000 });
      return;
    }
    setLoading(true);
    try {
      if (useMock) {
        await new Promise((r) => setTimeout(r, 900));
        setTitles(MOCK_TITLES);
        setMeta({ id: 'demo-' + Date.now(), topic: '演示标题（非真实AI生成）' });
        toast.success('演示标题已生成（预览模式）');
      } else {
        const res = await fetch('/api/ai/titles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.token}`,
          },
          body: JSON.stringify({ topic, provider: model.provider, model: model.model }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (data.code === 'SESSION_INVALID') {
            // 清除本地失效 session，让首页重新显示激活表单
            logout();
            toast.error('登录状态已失效，请重新验证卡密');
            return;
          }
          // AI 失败降级：展示基础模板标题（本次不消耗次数）
          if (data.code === 'AI_BUSY' && data.fallback?.titles) {
            setTitles(data.fallback.titles as string[]);
            setMeta({ id: 'fallback', topic: '基础模板标题（AI繁忙降级，本次不扣次数）' });
            toast.warning('AI服务繁忙，已展示基础模板（本次不消耗次数），请稍后重试');
            return;
          }
          // 次数用尽：附带后台配置的引导文案
          if (data.code === 'DAILY_LIMIT' && data.tip) {
            toast.error(`${data.error}\n${data.tip}`, { duration: 6000 });
            return;
          }
          toast.error(data.error || '生成失败，请稍后再试');
          return;
        }
        setTitles(data.titles as string[]);
        setMeta({ id: data.id, topic });
        await refreshUsage();
        toast.success('10组爆款标题已生成！');
      }
    } catch (e) {
      console.error(e);
      toast.error('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyOne = (idx: number) => {
    if (!titles) return;
    navigator.clipboard.writeText(titles[idx]);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleCopyAll = () => {
    if (!titles) return;
    const text = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('已复制全部10条标题');
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary">今日 {session?.dailyUsed}/{session?.dailyLimit}</Badge>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-fuchsia-500" />
          AI 爆款标题生成
        </h1>
        <p className="mt-1.5 text-muted-foreground text-sm sm:text-base">
          输入主题或粘贴完整文案，一次生成 10 组适配抖音 / B站 / 小红书的爆款标题
        </p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            输入视频主题或完整文案
          </CardTitle>
          <CardDescription>支持两种方式：输入简短主题，或直接粘贴完整口播稿/文案（AI 自动提炼核心内容）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <ModelSelector value={model} onChange={setModel} />
          </div>
          <div className="space-y-2">
            <Textarea
              placeholder={'例如：&#10;&#10;平价手冲咖啡教程、独居女生快手早餐...&#10;&#10;或直接粘贴完整口播稿，AI 会自动提炼要点生成标题'}
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 2000))}
              className="min-h-[120px] resize-y text-base leading-relaxed"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>短主题或完整文案均可</span>
              <span className={topic.length > 1900 ? 'text-destructive font-medium' : ''}>
                {topic.length}/2000 字
              </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => handleGenerate(false)}
              disabled={loading || !topic.trim()}
              size="lg"
              className="gap-2 shrink-0 h-12 px-8"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  生成 10 组标题{model.cost > 1 ? `（耗${model.cost}次）` : ''}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleGenerate(true)}
              disabled={loading}
              size="lg"
              className="gap-2 h-12"
              title="无需卡密，查看演示效果"
            >
              <RefreshCw className="h-4 w-4" />
              演示预览
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-3.5 w-3.5" /> 试试这些主题：
            </span>
            {['平价手冲咖啡入门', '打工人5分钟快手早餐', '杭州周末citywalk路线'].map((t) => (
              <button
                key={t}
                className="text-xs rounded-full px-3 py-1 border border-border bg-white hover:bg-primary/5 hover:border-primary/30 transition-colors text-muted-foreground hover:text-primary"
                onClick={() => setTopic(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              爆款标题
            </CardTitle>
            <CardDescription>
              {titles ? `共 ${titles.length} 组 · 自动识别标题风格标签` : '等待生成...'}
            </CardDescription>
          </div>
          {titles && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerate(false)}
                disabled={loading || !topic.trim()}
                className="gap-1.5 h-9"
                title="用当前主题和模型重新生成一批"
              >
                <RefreshCw className="h-4 w-4" />
                重新生成
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyAll} className="gap-1.5 h-9">
                <Copy className="h-4 w-4" />
                复制全部
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!titles && !loading && (
            <div className="py-20 text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-fuchsia-50 text-fuchsia-400 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8" />
              </div>
              <p className="text-muted-foreground">在上方输入视频主题，一键生成 10 组爆款标题</p>
              <p className="text-xs text-muted-foreground/80 mt-2">也可以先点「演示预览」看看效果 ✨</p>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">AI 正在构思爆款标题...</p>
            </div>
          )}

          {titles && !loading && (
            <div className="grid md:grid-cols-2 gap-3">
              {titles.map((title, idx) => {
                const style = detectStyle(title);
                const copied = copiedIdx === idx;
                return (
                  <div
                    key={idx}
                    className="group rounded-xl border border-border/60 bg-gradient-to-br from-white to-slate-50/50 p-4 hover:shadow-md hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            {idx + 1}
                          </span>
                          <Badge variant="outline" className={`text-xs border ${STYLE_TAGS[style] || ''}`}>
                            {style}
                          </Badge>
                        </div>
                        <p className="text-sm leading-relaxed pr-2">{title}</p>
                      </div>
                      <button
                        onClick={() => handleCopyOne(idx)}
                        className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        title="复制这条"
                      >
                        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
