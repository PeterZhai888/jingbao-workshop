'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCardAuth } from '@/lib/card-auth';
import { Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Props {
  children: ReactNode;
}

export default function ProtectedPage({ children }: Props) {
  const { session, isLoading } = useCardAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      // 未登录，延时跳回首页（带锚点）
      const t = setTimeout(() => router.replace('/#card-input'), 1500);
      return () => clearTimeout(t);
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-5">
          <Shield className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold">请先激活卡密</h2>
        <p className="mt-2 text-muted-foreground max-w-sm">
          此功能需要卡密验证后才能使用。1秒后自动跳转首页，或手动点击下方按钮。
        </p>
        <Link href="/#card-input" className="mt-6">
          <Button className="gap-1.5">
            <Shield className="h-4 w-4" />
            去激活卡密
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
