'use client';

import { useState } from 'react';
import { useCardAuth } from '@/lib/card-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clapperboard,
  Copy,
  Download,
  Loader2,
  Clock,
  Camera,
  MessageSquare,
  Sparkles,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ModelSelector, type ModelSelection } from '@/components/model-selector';
import type { StoryboardShot, StoryboardResult } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

// 测试用模拟数据
const MOCK_SHOTS: StoryboardShot[] = [
  { shotNumber: 1, sceneDescription: '清晨阳光透过窗帘，主角缓缓睁开眼睛，微笑看向窗外', dialogue: '', duration: '3秒', cameraMove: '固定机位，柔光' },
  { shotNumber: 2, sceneDescription: '主角走进厨房，拿起手冲咖啡壶，专注地注水', dialogue: '旁白：「美好的一天，从一杯手冲开始」', duration: '5秒', cameraMove: '推镜，中景→特写' },
  { shotNumber: 3, sceneDescription: '咖啡液缓缓滴入分享壶，琥珀色液体冒着热气', dialogue: '（白噪音：咖啡滴答声）', duration: '4秒', cameraMove: '微距俯拍，慢动作' },
  { shotNumber: 4, sceneDescription: '主角端着咖啡走到阳台，迎着阳光深呼吸', dialogue: '旁白：「生活需要仪式感，哪怕只有5分钟」', duration: '6秒', cameraMove: '环绕运镜' },
  { shotNumber: 5, sceneDescription: '咖啡杯特写，配字幕总结，画面渐暗', dialogue: '字幕：#生活方式 #手冲咖啡 #治愈系', duration: '3秒', cameraMove: '固定，淡出' },
];

export function StoryboardTool() {
  const { session, refreshUsage, logout } = useCardAuth();
  const [inputText, setInputText] = useState('');
  const [shotCount, setShotCount] = useState(10); // 分镜数量 3-15，默认 10
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StoryboardShot[] | null>(null);
  const [resultMeta, setResultMeta] = useState<{ id: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [model, setModel] = useState<ModelSelection>({ cost: 1 });

  // 自定义输入的合法值（3-15 整数）
  const customParsed = parseInt(customInput, 10);
  const customValid = Number.isFinite(customParsed) && customParsed >= 3 && customParsed <= 15;
  const effectiveCount = customMode ? (customValid ? customParsed : shotCount) : shotCount;

  const applyPreset = (n: number) => {
    setShotCount(n);
    setCustomMode(false);
  };

  const applyCustom = () => {
    if (customValid) {
      setShotCount(customParsed);
      setCustomMode(false);
      setCustomInput('');
    }
  };

  const handleGenerate = async (useMock = false) => {
    if (!inputText.trim()) {
      toast.error('请输入视频文案或故事文本');
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
        // 演示模式：使用模拟数据
        await new Promise((r) => setTimeout(r, 1200));
        setResult(MOCK_SHOTS);
        setResultMeta({ id: 'demo-' + Date.now(), title: '演示分镜脚本（非真实AI生成）' });
        toast.success('演示分镜已生成（预览模式）');
      } else {
        const res = await fetch('/api/ai/storyboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.token}`,
          },
          body: JSON.stringify({ text: inputText, count: effectiveCount, provider: model.provider, model: model.model }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (data.code === 'SESSION_INVALID') {
            // 清除本地失效 session，让首页重新显示激活表单
            logout();
            toast.error('登录状态已失效，请重新验证卡密');
            return;
          }
          // AI 失败降级：展示基础模板分镜（本次不消耗次数）
          if (data.code === 'AI_BUSY' && data.fallback?.shots) {
            setResult(data.fallback.shots as StoryboardShot[]);
            setResultMeta({ id: 'fallback', title: '基础模板分镜（AI繁忙降级，本次不扣次数）' });
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
        setResult(data.shots as StoryboardShot[]);
        setResultMeta({ id: data.id, title: data.title || '分镜脚本' });
        await refreshUsage();
        toast.success('分镜脚本生成成功！');
      }
    } catch (e) {
      console.error(e);
      toast.error('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = result.map(
      (s) =>
        `【镜头${s.shotNumber}】时长：${s.duration} | 运镜：${s.cameraMove}\n画面：${s.sceneDescription}\n台词：${s.dialogue || '（无）'}`,
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('已复制到剪贴板');
  };

  const handleExportJSON = () => {
    if (!result || !resultMeta) return;
    const data: StoryboardResult = {
      id: resultMeta.id,
      type: 'storyboard',
      title: resultMeta.title,
      createdAt: new Date().toISOString(),
      inputText,
      shots: result,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `分镜脚本_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalDuration = result
    ? result.reduce((acc, s) => {
        const m = s.duration.match(/(\d+)/);
        return acc + (m ? parseInt(m[1]) : 0);
      }, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">今日 {session?.dailyUsed}/{session?.dailyLimit}</Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Clapperboard className="h-7 w-7 text-primary" />
            文本转分镜脚本
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm sm:text-base">
            粘贴你的视频文案或故事，AI 一键生成专业短视频分镜表
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* 输入区 */}
        <Card className="lg:col-span-2 border-border/60 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              输入视频文案
            </CardTitle>
            <CardDescription>建议 100-2000 字，描述越清楚分镜越精准</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <ModelSelector value={model} onChange={setModel} />
            </div>
            <Textarea
              placeholder="例如：&#10;&#10;周末早晨，我决定给自己做一杯手冲咖啡。窗外阳光正好，咖啡豆的香气弥漫整个房间。慢下来，感受生活中的小确幸..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="min-h-[300px] resize-y text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{inputText.length} 字</span>
              <span>建议 100-2000 字</span>
            </div>

            {/* 分镜数量选择：快捷档位 + 自定义 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">分镜数量</label>
                <span className="text-xs text-primary font-medium">将生成 {effectiveCount} 条</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[3, 5, 10, 15].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => applyPreset(n)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      !customMode && shotCount === n
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'border border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                    }`}
                  >
                    {n} 条
                  </button>
                ))}
                {!customMode ? (
                  <button
                    type="button"
                    onClick={() => setCustomMode(true)}
                    className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground border border-border hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    自定义
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={3}
                      max={15}
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
                      placeholder="3-15"
                      className="w-20 h-9 rounded-lg border border-border px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={applyCustom}
                      disabled={!customValid}
                      className="h-9"
                    >
                      确定
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setCustomMode(false); setCustomInput(''); }}
                      className="text-xs text-muted-foreground hover:text-foreground px-1"
                    >
                      取消
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => handleGenerate(false)}
                disabled={loading || !inputText.trim()}
                className="flex-1 gap-2 h-11"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI 生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    生成分镜{model.cost > 1 ? `（耗${model.cost}次）` : ''}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGenerate(true)}
                disabled={loading}
                className="gap-2"
                title="无需卡密，查看演示效果"
              >
                <RefreshCw className="h-4 w-4" />
                演示预览
              </Button>
            </div>
            <div className="rounded-lg bg-slate-50 border border-border/60 p-3 text-xs text-muted-foreground leading-relaxed">
              💡 小技巧：文案中包含人物、场景、情绪描述时，生成效果最佳。每条分镜将包含镜头序号、画面描述、台词旁白、预估时长、运镜建议。
            </div>
          </CardContent>
        </Card>

        {/* 输出区 */}
        <Card className="lg:col-span-3 border-border/60">
          <CardHeader className="flex-row items-center justify-between space-y-0 gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="h-5 w-5 text-fuchsia-500" />
                分镜脚本
              </CardTitle>
              <CardDescription>
                {result ? (
                  <span className="flex items-center gap-2">
                    共 {result.length} 个镜头
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      预估总时长约 {totalDuration} 秒
                    </span>
                  </span>
                ) : (
                  '等待输入生成...'
                )}
              </CardDescription>
            </div>
            {result && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerate(false)}
                  disabled={loading || !inputText.trim()}
                  className="gap-1.5 h-9"
                  title="用当前文案和模型重新生成"
                >
                  <RefreshCw className="h-4 w-4" />
                  重新生成
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 h-9">
                  {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? '已复制' : '复制'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportJSON} className="gap-1.5 h-9">
                  <Download className="h-4 w-4" />
                  导出
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!result && !loading && (
              <div className="py-20 text-center">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
                  <Clapperboard className="h-8 w-8" />
                </div>
                <p className="text-muted-foreground">在左侧输入文案，点击「生成分镜」即可</p>
                <p className="text-xs text-muted-foreground/80 mt-2">也可以先点「演示预览」看看效果 ✨</p>
              </div>
            )}

            {loading && (
              <div className="py-20 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                <p className="mt-4 text-muted-foreground">AI 正在创作分镜脚本...</p>
                <p className="text-xs text-muted-foreground/80 mt-1">通常需要 10-30 秒</p>
              </div>
            )}

            {result && !loading && (
              <Tabs defaultValue="cards">
                <TabsList className="mb-4">
                  <TabsTrigger value="cards">卡片视图</TabsTrigger>
                  <TabsTrigger value="table">表格视图</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="cards" className="space-y-3 mt-0">
                  {result.map((shot) => (
                    <div
                      key={shot.shotNumber}
                      className="rounded-xl border border-border/60 bg-gradient-to-br from-white to-slate-50 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-wrap items-start gap-3 mb-3">
                        <Badge variant="secondary" className="bg-primary text-primary-foreground border-primary/20">
                          镜头 {String(shot.shotNumber).padStart(2, '0')}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" /> {shot.duration}
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-fuchsia-700 border-fuchsia-200 bg-fuchsia-50/50">
                          <Camera className="h-3 w-3" /> {shot.cameraMove}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-semibold text-primary text-xs">画面 · </span>
                          <span className="leading-relaxed">{shot.sceneDescription}</span>
                        </div>
                        {shot.dialogue && (
                          <div className="rounded-lg bg-slate-50 border-l-2 border-indigo-400 px-3 py-2 text-slate-700">
                            <span className="font-semibold text-indigo-600 text-xs">台词/旁白 · </span>
                            <span>{shot.dialogue}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="table" className="mt-0">
                  <div className="rounded-xl border border-border/60 overflow-x-auto">
                    <Table className="min-w-[560px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">镜头</TableHead>
                          <TableHead>画面描述</TableHead>
                          <TableHead>台词/旁白</TableHead>
                          <TableHead className="w-20">时长</TableHead>
                          <TableHead className="w-32">运镜</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.map((shot) => (
                          <TableRow key={shot.shotNumber}>
                            <TableCell className="font-mono font-bold text-primary">{shot.shotNumber}</TableCell>
                            <TableCell className="text-sm leading-relaxed max-w-sm">{shot.sceneDescription}</TableCell>
                            <TableCell className="text-sm max-w-xs text-muted-foreground">{shot.dialogue || '—'}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{shot.duration}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{shot.cameraMove}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="json" className="mt-0">
                  <pre className="rounded-xl bg-slate-900 text-slate-100 text-xs p-4 overflow-auto max-h-[600px] leading-relaxed font-mono">
{JSON.stringify(result, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
