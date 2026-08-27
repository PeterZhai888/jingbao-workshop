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

  // 初始化：从 localStorage 读取并验证
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed: AuthSession = JSON.parse(stored);
        // 检查是否过期
        if (new Date(parsed.expiresAt) > new Date()) {
          setSession(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
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

  const refreshUsage = useCallback(async (): Promise<void> => {
    if (!session?.token) return;
    try {
      const res = await fetch('/api/card/usage', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSession(prev => prev ? { ...prev, dailyUsed: data.dailyUsed, dailyLimit: data.dailyLimit } : prev);
        // 同步到 localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            parsed.dailyUsed = data.dailyUsed;
            parsed.dailyLimit = data.dailyLimit;
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
