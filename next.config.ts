import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许预览代理/本机访问 dev 资源（HMR 等）；必须是纯 hostname（不带协议/端口），localhost 已内置允许
  // ** 才能匹配多级子域（*.x 只匹配一层）
  allowedDevOrigins: ['**.traecontent.cn', '127.0.0.1'],
  // 旧工具页地址重定向到统一创作页（保留收藏夹/分享链接可用）
  async redirects() {
    return [
      { source: '/storyboard', destination: '/studio?tool=storyboard', permanent: true },
      { source: '/titles', destination: '/studio?tool=titles', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // 强制 Next.js 构建期页面数据收集 worker 数 = 2
    // 避免 Railway/容器里检测到 31 核就开 31 workers，导致 OOM -> SIGSEGV 崩溃
    cpus: 2,
  },
  // 生产构建：我们在构建命令前已经单独执行了单进程 `pnpm tsc -p tsconfig.json --noEmit`
  // 这里必须 ignoreBuildErrors=true，跳过 Next.js 自己的 "Running TypeScript" 多进程并行阶段
  // （容器/CI 里会开 N=CPU 核数个 tsc worker，内存不够直接 SIGSEGV 崩溃，之前的 31 workers OOM 就因为它）
  typescript: {
    ignoreBuildErrors: true,
    tsconfigPath: './tsconfig.json',
  },
};

export default nextConfig;
