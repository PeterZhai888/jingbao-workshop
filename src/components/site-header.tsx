'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCardAuth } from '@/lib/card-auth';
import { Button } from '@/components/ui/button';
import {
  Film,
  Sparkles,
  History,
  LogOut,
  Shield,
  Clapperboard,
  Menu,
  X,
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

const navItems = [
  { href: '/storyboard', label: '文本转分镜', icon: Clapperboard },
  { href: '/titles', label: 'AI爆款标题', icon: Sparkles },
  { href: '/history', label: '历史记录', icon: History },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useCardAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 管理后台路径单独处理
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Film className="h-5 w-5" />
          </div>
          <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
            AI短视频工具箱
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {session && navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href;
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
                  <DropdownMenuItem onClick={() => router.push('/admin')} className="gap-2">
                    <Shield className="h-4 w-4" /> 管理后台
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
            {session && navItems.map(item => {
              const Icon = item.icon;
              const active = pathname === item.href;
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
                <div className="px-3 py-2 border-t border-border/60 mt-2 pt-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-xs">
                      今日 {session.dailyUsed}/{session.dailyLimit}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={logout} className="text-destructive gap-1.5 h-8 px-2">
                      <LogOut className="h-4 w-4" /> 退出
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    有效期至 {new Date(session.cardExpiresAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
