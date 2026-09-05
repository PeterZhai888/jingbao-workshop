import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { SiteHeader } from '@/components/site-header';
import { CardAuthProvider } from '@/lib/card-auth';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} - 一键生成爆款脚本与标题`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'AI短视频创作工具箱，支持文本转专业分镜脚本、AI爆款标题生成。无需注册，输入卡密即可使用。',
  keywords: [
    'AI短视频',
    '分镜脚本',
    '爆款标题',
    '短视频创作',
    'AI工具',
    '抖音',
    'B站',
    '小红书',
  ],
  authors: [{ name: SITE_NAME }],
  openGraph: {
    title: `${SITE_NAME} | 一键生成爆款脚本与标题`,
    description:
      '文本转专业分镜脚本、AI爆款标题生成。无需注册，输入卡密即可使用。',
    locale: 'zh_CN',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        <CardAuthProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10 overflow-x-hidden">
            {children}
          </main>
          <footer className="border-t border-border/60 bg-white/60 mt-12">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} {SITE_NAME} · {SITE_TAGLINE}
            </div>
          </footer>
        </CardAuthProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
