'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Search,
  Plus,
  Download,
  Copy,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Snowflake,
  Ban,
  PlayCircle,
  KeyRound,
  Cpu,
} from 'lucide-react';
import { toast } from 'sonner';

const ADMIN_SESSION_KEY = 'ai_video_tool_admin_session';

interface AdminSession {
  token: string;
  admin: { id: number; username: string; role: string };
}

// ========= 通用 =========
function withAuth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  unused: { label: '未激活', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  active: { label: '已激活', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  frozen: { label: '已冻结', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  revoked: { label: '已作废', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: '已过期', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.unused;
  return <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>;
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
              <Button variant="outline" size="icon" onClick={() => { setAnswer(''); fetchCaptcha(); }} title="换一题">
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

// ========= Tab 1: 卡密管理 =========
interface CardRow {
  id: number;
  code: string;
  status: string;
  valid_days: number;
  daily_limit: number;
  remark: string | null;
  activated_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

function CardsPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchCode, setSearchCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [genResult, setGenResult] = useState<string[] | null>(null);
  const [genCopied, setGenCopied] = useState(false);

  // 生成表单
  const [genCount, setGenCount] = useState('10');
  const [genValidDays, setGenValidDays] = useState('30');
  const [genDailyLimit, setGenDailyLimit] = useState('20');
  const [genRemark, setGenRemark] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchCode.trim()) params.set('code', searchCode.trim());
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/admin/cards?${params}`, { headers: withAuth(token) });
      const data = await res.json();
      if (data.success) {
        setRows(data.items);
        setTotal(data.total);
      } else if (res.status === 401) {
        toast.error('登录已过期，请重新登录');
      }
    } catch {
      toast.error('加载卡密列表失败');
    } finally {
      setLoading(false);
    }
  }, [token, page, searchCode, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSetStatus = async (code: string, status: 'frozen' | 'revoked' | 'active') => {
    try {
      const res = await fetch('/api/admin/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuth(token) },
        body: JSON.stringify({ code, status }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${code} 已${status === 'frozen' ? '冻结' : status === 'revoked' ? '作废' : '恢复'}`);
        load();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const handleGenerate = async () => {
    const count = parseInt(genCount, 10);
    if (!Number.isFinite(count) || count < 1 || count > 500) {
      toast.error('生成数量需在 1-500 之间');
      return;
    }
    setGenLoading(true);
    try {
      const res = await fetch('/api/admin/cards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuth(token) },
        body: JSON.stringify({
          count,
          validDays: parseInt(genValidDays, 10) || 30,
          dailyLimit: parseInt(genDailyLimit, 10) || 20,
          remark: genRemark.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGenResult(data.cards.map((c: { code: string }) => c.code));
        toast.success(`成功生成 ${data.inserted} 张卡密`);
        load();
      } else {
        toast.error(data.error || '生成失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setGenLoading(false);
    }
  };

  const exportCSV = () => {
    if (!genResult) return;
    const csv = '卡密,状态,有效期(天),每日上限,备注\n' + genResult.map((c) => `${c},unused,${genValidDays},${genDailyLimit},${genRemark}`).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `卡密批量导出_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索卡密..."
            value={searchCode}
            onChange={(e) => { setSearchCode(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="unused">未激活</SelectItem>
            <SelectItem value="active">已激活</SelectItem>
            <SelectItem value="frozen">已冻结</SelectItem>
            <SelectItem value="revoked">已作废</SelectItem>
            <SelectItem value="expired">已过期</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setGenOpen(true)} className="gap-1.5 ml-auto">
          <Plus className="h-4 w-4" /> 批量生成卡密
        </Button>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>卡密</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-24">每日上限</TableHead>
              <TableHead className="w-28">激活时间</TableHead>
              <TableHead className="w-28">到期时间</TableHead>
              <TableHead className="hidden md:table-cell">备注</TableHead>
              <TableHead className="w-36 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  暂无卡密记录
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-semibold">{c.code}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm">{c.daily_limit} 次</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.activated_at?.slice(0, 16).replace('T', ' ') || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.expires_at?.slice(0, 10) || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[140px] truncate">{c.remark || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.status === 'active' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-sky-600" title="冻结" onClick={() => handleSetStatus(c.code, 'frozen')}>
                          <Snowflake className="h-4 w-4" />
                        </Button>
                      )}
                      {(c.status === 'unused' || c.status === 'active' || c.status === 'frozen') && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" title="作废" onClick={() => handleSetStatus(c.code, 'revoked')}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      {c.status === 'frozen' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" title="恢复激活" onClick={() => handleSetStatus(c.code, 'active')}>
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 条 · 第 {page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> 上一页
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 生成弹窗 */}
      <Dialog open={genOpen} onOpenChange={(open) => { setGenOpen(open); if (!open) { setGenResult(null); setGenCopied(false); } }}>
        <DialogContent className="sm:max-w-lg">
          {!genResult ? (
            <>
              <DialogHeader>
                <DialogTitle>批量生成卡密</DialogTitle>
                <DialogDescription>卡密格式：SP- + 12位大写字母数字（自动排除易混淆字符和连续序列）</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">数量</label>
                  <Input type="number" min={1} max={500} value={genCount} onChange={(e) => setGenCount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">有效期(天)</label>
                  <Input type="number" min={1} value={genValidDays} onChange={(e) => setGenValidDays(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">每日上限</label>
                  <Input type="number" min={1} value={genDailyLimit} onChange={(e) => setGenDailyLimit(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">备注（可选）</label>
                <Input placeholder="如：双11活动专用" value={genRemark} onChange={(e) => setGenRemark(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenOpen(false)}>取消</Button>
                <Button onClick={handleGenerate} disabled={genLoading} className="gap-1.5">
                  {genLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  生成
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>生成成功（{genResult.length} 张）</DialogTitle>
                <DialogDescription>请立即复制或导出保存，关闭后仍可在列表中查询</DialogDescription>
              </DialogHeader>
              <div className="max-h-72 overflow-auto rounded-lg border border-border/60 bg-slate-50 p-3 font-mono text-xs space-y-1">
                {genResult.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" className="gap-1.5" onClick={() => {
                  navigator.clipboard.writeText(genResult.join('\n'));
                  setGenCopied(true);
                  toast.success('已复制全部卡密');
                }}>
                  {genCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  复制全部
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={exportCSV}>
                  <Download className="h-4 w-4" /> 导出CSV
                </Button>
                <Button onClick={() => { setGenOpen(false); setGenResult(null); }}>完成</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========= Tab 2: 使用日志 =========
interface LogRow {
  id: number;
  card_code: string;
  action: string;
  success: number;
  ip: string | null;
  detail: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  verify: '卡密验证',
  storyboard: '生成分镜',
  titles: '生成标题',
  admin_generate_cards: '管理员发卡',
  admin_set_status: '卡密状态变更',
  admin_login: '管理员登录',
};

function LogsPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchCode, setSearchCode] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [loading, setLoading] = useState(true);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchCode.trim()) params.set('cardCode', searchCode.trim());
      if (filterAction !== 'all') params.set('action', filterAction);
      const res = await fetch(`/api/admin/logs?${params}`, { headers: withAuth(token) });
      const data = await res.json();
      if (data.success) {
        setRows(data.items);
        setTotal(data.total);
      }
    } catch {
      toast.error('加载日志失败');
    } finally {
      setLoading(false);
    }
  }, [token, page, searchCode, filterAction]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="按卡密搜索..."
            value={searchCode}
            onChange={(e) => { setSearchCode(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="操作类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作</SelectItem>
            <SelectItem value="verify">卡密验证</SelectItem>
            <SelectItem value="storyboard">生成分镜</SelectItem>
            <SelectItem value="titles">生成标题</SelectItem>
            <SelectItem value="admin_generate_cards">管理员发卡</SelectItem>
            <SelectItem value="admin_set_status">状态变更</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto self-start" onClick={load}>
          <RefreshCw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">时间</TableHead>
              <TableHead className="w-36">卡密</TableHead>
              <TableHead className="w-28">操作</TableHead>
              <TableHead className="w-16">结果</TableHead>
              <TableHead className="w-28">IP</TableHead>
              <TableHead className="hidden md:table-cell">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">暂无日志</TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.created_at?.slice(0, 19).replace('T', ' ')}</TableCell>
                  <TableCell className="font-mono text-xs">{r.card_code}</TableCell>
                  <TableCell className="text-sm">{ACTION_LABELS[r.action] || r.action}</TableCell>
                  <TableCell>
                    {r.success ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">成功</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">失败</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{r.ip || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate" title={r.detail || ''}>
                    {r.detail || '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 条 · 第 {page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> 上一页
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ========= Tab 3: 系统配置 =========
interface ProviderInfo {
  key: string;
  label: string;
  defaultModel: string;
  currentModel: string;
  configured: boolean;
  configuredFrom: string;
}

interface ConfigData {
  defaultProvider: string;
  dailyLimit: number;
  qpsLimit: number;
}

function ConfigPanel({ token }: { token: string }) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/config', { headers: withAuth(token) });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setProviders(data.providers || []);
      }
    } catch {
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuth(token) },
        body: JSON.stringify({
          default_provider: config.defaultProvider,
          daily_limit: String(config.dailyLimit),
          qps_limit: String(config.qpsLimit),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('基础配置已保存');
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async (providerKey: string) => {
    const key = (keyDrafts[providerKey] || '').trim();
    if (!key) {
      toast.error('请先输入 API Key');
      return;
    }
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuth(token) },
        body: JSON.stringify({ [`ai_key_${providerKey}`]: key }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('API Key 已保存（已加密存储于数据库）');
        setKeyDrafts((d) => ({ ...d, [providerKey]: '' }));
        load();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 基础配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" /> 基础配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">默认 AI 服务商</label>
              <Select value={config!.defaultProvider} onValueChange={(v) => setConfig({ ...config!, defaultProvider: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label} {p.configured ? '✓' : '（未配置）'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">每日生成上限（次）</label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={config!.dailyLimit}
                onChange={(e) => setConfig({ ...config!, dailyLimit: parseInt(e.target.value, 10) || 20 })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">全局 QPS 上限</label>
              <Input
                type="number"
                min={1}
                max={500}
                value={config!.qpsLimit}
                onChange={(e) => setConfig({ ...config!, qpsLimit: parseInt(e.target.value, 10) || 10 })}
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            保存基础配置
          </Button>
        </CardContent>
      </Card>

      {/* AI 服务商配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cpu className="h-5 w-5 text-fuchsia-500" /> AI 服务商（OpenAI 兼容格式）
          </CardTitle>
          <CardDescription>
            每家填入对应平台的 API Key 即可启用；默认模型可在部署时通过环境变量覆盖
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map((p) => (
            <div key={p.key} className="rounded-xl border border-border/60 p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="font-semibold text-sm">{p.label}</span>
                {p.configured ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {p.configuredFrom}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1">
                    <KeyRound className="h-3 w-3" /> 未配置
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto font-mono">模型：{p.currentModel}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={p.configured ? '已配置（输入可覆盖）' : `填入 ${p.label} API Key`}
                  value={keyDrafts[p.key] || ''}
                  onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                />
                <Button variant="outline" onClick={() => handleSaveKey(p.key)} disabled={!keyDrafts[p.key]?.trim()} className="gap-1.5 shrink-0">
                  <KeyRound className="h-4 w-4" /> 保存Key
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ========= 后台主界面 =========
function AdminDashboard({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const [tab, setTab] = useState<'cards' | 'logs' | 'config'>('cards');
  const [stats, setStats] = useState<{ cards: number | null; logs: number | null }>({ cards: null, logs: null });

  useEffect(() => {
    (async () => {
      try {
        const headers = withAuth(session.token);
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
            <CardTitle className="text-3xl font-bold text-primary">{stats.cards ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>使用日志总数</CardDescription>
            <CardTitle className="text-3xl font-bold text-fuchsia-500">{stats.logs ?? '—'}</CardTitle>
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

      {tab === 'cards' && <CardsPanel token={session.token} />}
      {tab === 'logs' && <LogsPanel token={session.token} />}
      {tab === 'config' && <ConfigPanel token={session.token} />}
    </div>
  );
}

// ========= 页面入口 =========
export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
      {/* 管理后台专属顶栏 */}
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
