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
