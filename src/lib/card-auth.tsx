'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { AuthSession } from '@/lib/types';
import { toast } from 'sonner';

interface CardAuthContextType {
  session: AuthSession | null;
  isLoading: boolean;
  verifyCard: (code: string) => Promise<boolean>;
  logout: () => void;
  refreshUsage: () => Promise<void>;
}

const CardAuthContext = createContext<CardAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'ai_video_tool_session';
const FINGERPRINT_KEY = 'ai_video_tool_fp';

// 简单指纹生成（IP需要后端配合，这里只用UA+随机数）
function getFingerprint(): string {
  if (typeof window === 'undefined') return '';
  let fp = localStorage.getItem(FINGERPRINT_KEY);
  if (!fp) {
    const ua = navigator.userAgent || '';
    const rand = Math.random().toString(36).substring(2, 10);
    fp = btoa(ua + '|' + Date.now() + '|' + rand).slice(0, 32);
    localStorage.setItem(FINGERPRINT_KEY, fp);
  }
  return fp;
}

export function CardAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化：从 localStorage 读取，并向服务端校验 token 是否仍有效
  // （防止本地残留失效 session：不仅会导致生成报错，还会把首页激活表单藏起来，用户无法重新激活）
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    let parsed: AuthSession | null = null;
    try {
      parsed = JSON.parse(stored) as AuthSession;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setIsLoading(false);
      return;
    }
    if (!parsed?.token || new Date(parsed.expiresAt) <= new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      setIsLoading(false);
      return;
    }
    setSession(parsed);
    // 服务端二次校验：token 失效（重启换密钥/卡密被删等）则立即清除本地残留
    fetch('/api/card/usage', { headers: { Authorization: `Bearer ${parsed.token}` } })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setSession(null);
        }
      })
      .catch(() => {
        // 网络异常时保留本地 session，不打断用户
      })
      .finally(() => setIsLoading(false));
  }, []);

  const verifyCard = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const fingerprint = getFingerprint();
      const res = await fetch('/api/card/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, fingerprint }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || '卡密验证失败，请检查卡密是否正确');
        return false;
      }
      const newSession: AuthSession = data.session;
      setSession(newSession);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      toast.success('卡密验证成功！欢迎使用');
      return true;
    } catch (e) {
      console.error(e);
      toast.error('网络错误，请稍后再试');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
    toast.success('已退出登录');
  }, []);

  // token 过期自动退出：定时检查 expiresAt，过期则清除 session（1 分钟缓冲）
  useEffect(() => {
    if (!session?.expiresAt) return;
    const msLeft = new Date(session.expiresAt).getTime() - Date.now() - 60_000;
    if (msLeft <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(() => logout(), msLeft);
    return () => clearTimeout(timer);
  }, [session?.expiresAt, logout]);

  const refreshUsage = useCallback(async (): Promise<void> => {
    if (!session?.token) return;
    try {
      const res = await fetch('/api/card/usage', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSession(prev => prev ? { ...prev, dailyUsed: data.dailyUsed, dailyLimit: data.dailyLimit, exhaustedTip: typeof data.exhaustedTip === 'string' ? data.exhaustedTip : prev.exhaustedTip } : prev);
        // 同步到 localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            parsed.dailyUsed = data.dailyUsed;
            parsed.dailyLimit = data.dailyLimit;
            if (typeof data.exhaustedTip === 'string') parsed.exhaustedTip = data.exhaustedTip;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          } catch { /* ignore */ }
        }
      } else if (data.code === 'SESSION_INVALID') {
        // Token 失效
        logout();
      }
    } catch {
      // 静默失败
    }
  }, [session, logout]);

  return (
    <CardAuthContext.Provider value={{ session, isLoading, verifyCard, logout, refreshUsage }}>
      {children}
    </CardAuthContext.Provider>
  );
}

export function useCardAuth() {
  const ctx = useContext(CardAuthContext);
  if (!ctx) throw new Error('useCardAuth must be used within CardAuthProvider');
  return ctx;
}
