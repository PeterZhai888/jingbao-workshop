'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Film,
  Loader2,
  ShieldCheck,
  RefreshCw,
  LogOut,
  Home,
  CreditCard,
  ScrollText,
  Settings,
  Lock,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

const ADMIN_SESSION_KEY = 'ai_video_tool_admin_session';

interface AdminSession {
  token: string;
  admin: { id: number; username: string; role: string };
}

// ========= 登录页 =========
function AdminLogin({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [answer, setAnswer] = useState('');
  const [captcha, setCaptcha] = useState<{ captchaId: string; question: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCaptcha = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/captcha');
      const data = await res.json();
      if (data.success) setCaptcha({ captchaId: data.captchaId, question: data.question });
    } catch {
      toast.error('验证码获取失败，请刷新重试');
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast.error('请输入账号和密码');
      return;
    }
    if (!answer.trim()) {
      toast.error('请输入验证码答案');
      return;
    }
    if (!captcha) {
      toast.error('验证码未加载，请点击刷新');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaId: captcha.captchaId,
          answer: parseInt(answer, 10),
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || '登录失败');
        // 登录失败后验证码已消费，重新取一张
        setAnswer('');
        fetchCaptcha();
        return;
      }
      const session: AdminSession = { token: data.token, admin: data.admin };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      toast.success('登录成功');
      onLogin(session);
    } catch {
      toast.error('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">管理后台登录</CardTitle>
          <CardDescription>仅限管理员访问，连续 5 次失败将锁定 IP 30 分钟</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">账号</label>
            <Input
              placeholder="管理员账号"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">密码</label>
            <Input
              type="password"
              placeholder="管理员密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">验证码</label>
            <div className="flex gap-2">
              <div className="flex h-10 min-w-[110px] items-center justify-center rounded-md border border-border bg-slate-50 font-mono text-base font-bold tracking-wider select-none">
                {captcha?.question || '加载中...'}
              </div>
              <Input
                placeholder="输入计算结果"
                value={answer}
                onChange={(e) => setAnswer(e.target.value.replace(/[^0-9-]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="flex-1"
                inputMode="numeric"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => { setAnswer(''); fetchCaptcha(); }}
                title="换一题"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button onClick={handleLogin} disabled={loading} className="w-full h-11 gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 登录中...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> 登录管理后台
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ========= 功能占位 Tab =========
function PlaceholderPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Inbox className="h-7 w-7" />
        </div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        <Badge variant="secondary" className="mt-4">将在 Prompt 3 阶段交付完整功能</Badge>
      </CardContent>
    </Card>
  );
}

// ========= 后台框架（已登录） =========
function AdminDashboard({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const [tab, setTab] = useState<'cards' | 'logs' | 'config'>('cards');
  const [stats, setStats] = useState<{ cards: number | null; logs: number | null }>({ cards: null, logs: null });

  useEffect(() => {
    // 简版看板：卡密总数 + 日志总数（复用现有分页接口的 total 字段）
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${session.token}` };
        const [cardsRes, logsRes] = await Promise.all([
          fetch('/api/admin/cards?page=1&pageSize=1', { headers }),
          fetch('/api/admin/logs?page=1&pageSize=1', { headers }),
        ]);
        const cards = await cardsRes.json();
        const logs = await logsRes.json();
        if (cards?.success) setStats((s) => ({ ...s, cards: cards.total }));
        if (logs?.success) setStats((s) => ({ ...s, logs: logs.total }));
      } catch {
        // 静默失败，看板显示 —
      }
    })();
  }, [session.token]);

  const tabs = [
    { key: 'cards' as const, label: '卡密管理', icon: CreditCard },
    { key: 'logs' as const, label: '使用日志', icon: ScrollText },
    { key: 'config' as const, label: '系统配置', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* 简版看板 */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>卡密总数</CardDescription>
            <CardTitle className="text-3xl font-bold text-primary">
              {stats.cards ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>使用日志总数</CardDescription>
            <CardTitle className="text-3xl font-bold text-fuchsia-500">
              {stats.logs ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* 功能 Tab */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'cards' && (
        <PlaceholderPanel
          title="卡密批量生成 / 查询 / 冻结 / 作废"
          desc="后端接口已就绪（生成、列表、状态变更均已通过 27 项端到端测试），图形化操作界面开发中"
        />
      )}
      {tab === 'logs' && (
        <PlaceholderPanel
          title="使用记录查询"
          desc="支持按卡密、操作类型过滤的分页日志查询，图形化界面开发中"
        />
      )}
      {tab === 'config' && (
        <PlaceholderPanel
          title="系统配置"
          desc="AI 服务商切换、每日次数上限、敏感词库等在线配置，图形化界面开发中"
        />
      )}
    </div>
  );
}

// ========= 页面入口 =========
export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 恢复管理员会话（Token 12 小时有效，过期后接口返回 401 重新登录）
    const stored = localStorage.getItem(ADMIN_SESSION_KEY);
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {
        localStorage.removeItem(ADMIN_SESSION_KEY);
      }
    }
    setReady(true);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
    toast.success('已退出管理后台');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 管理后台专属顶栏（用户导航栏在此路径隐藏） */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 font-bold">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg">管理后台</span>
            {session && (
              <Badge variant="outline" className="ml-1 hidden sm:inline-flex">
                {session.admin.username}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Home className="h-4 w-4" /> 返回首页
              </Button>
            </Link>
            {session && (
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5 text-destructive hover:text-destructive">
                <LogOut className="h-4 w-4" /> 退出
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {!ready ? (
          <div className="py-32 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          </div>
        ) : session ? (
          <AdminDashboard session={session} onLogout={handleLogout} />
        ) : (
          <AdminLogin onLogin={setSession} />
        )}
      </main>

      <footer className="border-t border-border/60 py-4">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <Film className="h-3.5 w-3.5" />
          AI短视频工具箱 · 管理后台
        </div>
      </footer>
    </div>
  );
}
