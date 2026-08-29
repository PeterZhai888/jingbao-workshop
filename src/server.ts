import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeDatabase } from '@/lib/server/db';

console.error('[server] 🔧 server.ts 开始执行...');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '5000', 10);

// ====== 先开 HTTP 端口！让 Railway Startup Probe 秒过 ======
let dbReady = false;
let nextReady = false;
let handleReady: ((req: any, res: any, parsedUrl: any) => Promise<void>) | null = null;

const server = createServer(async (req, res) => {
  if (!dbReady || !nextReady || !handleReady) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Starting up... please wait');
    return;
  }
  try {
    const parsedUrl = parse(req.url!, true);
    await handleReady(req, res, parsedUrl);
  } catch (err) {
    console.error('[server] ❌ handle error:', req.url, err);
    res.statusCode = 500;
    res.end('Internal server error');
  }
});

server.once('error', err => {
  console.error('[server] ❌ server.listen 炸了:', err);
  process.exit(1);
});

// 关键：DB 初始化和 Next prepare 全部放到 listen 回调里！
// new Database() / pragma 是同步阻塞调用，如果在 listen 回调前执行
// 会卡死事件循环 → listen 回调永远不触发 → 端口实际没开 → 被杀。
server.listen(port, '0.0.0.0', () => {
  console.error(`[server] 🎉 端口 ${port} 已打开！Railway Startup Probe 通过 ✅`);

  // 1. 建库（此时端口已开，即使下面 hang 也不会被 Startup Probe 杀）
  try {
    console.error('[server] 🗄️ initializeDatabase() 开始...');
    initializeDatabase();
    dbReady = true;
    console.error('[server] ✅ 数据库就绪');
  } catch (err) {
    console.error('[server] ❌ initializeDatabase 炸了:', err);
    setTimeout(() => process.exit(1), 15000);
    return;
  }

  // 2. Next.js prepare
  console.error('[server] ⏳ Next.js prepare() 中（约 5~15 秒）...');
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  app
    .prepare()
    .then(() => {
      handleReady = handle;
      nextReady = true;
      console.error('[server] ✅ Next.js prepare 完成！现在正式提供服务');
      console.log(
        `> Server ready at http://${hostname}:${port} as ${dev ? 'development' : 'production'}`,
      );
    })
    .catch(err => {
      console.error('[server] ❌ Next.js prepare 失败:', err);
      setTimeout(() => process.exit(1), 10000);
    });
});
