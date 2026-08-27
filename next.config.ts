import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
