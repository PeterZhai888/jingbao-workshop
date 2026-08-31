'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCardAuth } from '@/lib/card-auth';
import { Button } from '@/components/ui/button';
import {
  Film,
  History,
  LogOut,
  Shield,
  Clapperboard,
  Menu,
  X,
  Home,
  RefreshCcw,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { SITE_NAME } from '@/lib/site';

const navItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/studio', label: '创作工具', icon: Clapperboard },
  { href: '/history', label: '历史记录', icon: History },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { session, logout, verifyCard } = useCardAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchCode, setSwitchCode] = useState('');
  const [switchLoading, setSwitchLoading] = useState(false);

  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) return null;

  const handleSwitch = async () => {
    const code = switchCode.trim().toUpperCase();
    if (!/^SP-[A-Z0-9]{12}$/.test(code)) {
      toast.error('卡密格式错误（应为 SP- 开头，后跟 12 位大写字母数字）');
      return;
    }
    setSwitchLoading(true);
    try {
      const ok = await verifyCard(code);
      if (ok) {
        setSwitchOpen(false);
        setSwitchCode('');
      }
    } finally {
      setSwitchLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Film className="h-5 w-5" />
          </div>
          <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
            {SITE_NAME}
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const needAuth = item.href !== '/';
            if (needAuth && !session) return null;
            const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    今日 {session.dailyUsed}/{session.dailyLimit}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  有效期至 {new Date(session.cardExpiresAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Shield className="h-4 w-4 text-primary" />
                    {session.cardCode.slice(0, 6)}…
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2 text-xs text-muted-foreground break-all">
                    {session.cardCode}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSwitchOpen(true)} className="gap-2">
                    <RefreshCcw className="h-4 w-4" /> 切换卡密
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4" /> 退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/#card-input">
              <Button size="sm" className="gap-1.5">
                <Shield className="h-4 w-4" />
                输入卡密
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden rounded-lg p-2 text-muted-foreground hover:bg-muted"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/60 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-3 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const needAuth = item.href !== '/';
              if (needAuth && !session) return null;
              const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            {session && (
              <>
                <div className="px-3 py-2 border-t border-border/60 mt-2 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-xs">
                      今日 {session.dailyUsed}/{session.dailyLimit}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={logout} className="text-destructive gap-1.5 h-8 px-2">
                      <LogOut className="h-4 w-4" /> 退出
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    有效期至 {new Date(session.cardExpiresAt).toLocaleDateString('zh-CN')}
                  </div>
                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => { setSwitchOpen(true); setMobileOpen(false); }}>
                    <RefreshCcw className="h-4 w-4" /> 切换卡密
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 切换卡密弹窗 */}
      <Dialog open={switchOpen} onOpenChange={(open) => { if (!open) setSwitchCode(''); setSwitchOpen(open); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>切换卡密</DialogTitle>
            <DialogDescription>输入新的卡密，验证成功后将替换当前账号（不影响任何已保存的历史记录）</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="text-xs text-muted-foreground">
              当前卡密：<span className="font-mono">{session?.cardCode}</span>
            </div>
            <Input
              placeholder="SP-XXXXXXXXXXXX"
              value={switchCode}
              onChange={(e) => setSwitchCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSwitch(); }}
              className="font-mono uppercase"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSwitchOpen(false)}>取消</Button>
            <Button onClick={handleSwitch} disabled={switchLoading}>
              {switchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              验证并切换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
