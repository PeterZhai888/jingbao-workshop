import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许预览代理/本机通过 127.0.0.1 与 localhost 访问 dev 资源（HMR 等）
  allowedDevOrigins: ['http://127.0.0.1:5000', 'http://localhost:5000'],
  // 旧工具页地址重定向到统一创作页（保留收藏夹/分享链接可用）
  async redirects() {
    return [
      { source: '/storyboard', destination: '/studio?tool=storyboard', permanent: true },
      { source: '/titles', destination: '/studio?tool=titles', permanent: true },
    ];
  },
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
