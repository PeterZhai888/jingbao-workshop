import { createServer, type ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeDatabase } from '@/lib/server/db';

console.error('[server] 🔧 server.ts 开始执行...');

// 1. 先建库（同步，毫秒级）
console.error('[server] 🗄️ initializeDatabase() ...');
initializeDatabase();
console.error('[server] ✅ 数据库就绪');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '5000', 10);

// 2. 先开 HTTP 端口！让 Railway Startup Probe 立刻探测成功
//    prepare() 要花 5~15 秒，端口先开着就不会被 SIGKILL
console.error('[server] 🌐 创建 HTTP server（先开端口防 Startup Probe 杀掉）...');
let nextReady = false;
let handleReady: ((req: any, res: any, parsedUrl: any) => Promise<void>) | null = null;

const server = createServer(async (req, res) => {
  if (!nextReady || !handleReady) {
    // 还在 prepare，返回 503 让 Railway 知道活着
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

server.listen(port, '0.0.0.0', () => {
  console.error(`[server] 🎉 端口 ${port} 已打开！Railway Startup Probe 通过 ✅`);
});

// 3. 后台慢慢 prepare Next.js（端口已经开了，不会被杀）
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
    // 不退出！端口还开着，持续返回 503，方便 Railway 继续探
    // 给 10 秒让用户看到日志再退出
    setTimeout(() => process.exit(1), 10000);
  });
