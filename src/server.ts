import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeDatabase } from '@/lib/server/db';

// 注意：运行期配置校验（JWT_SECRET / DB_PATH）不在此文件内执行，
// 因为 Next.js 构建阶段会 import server.ts 并通过 babel 插件触发执行，
// 导致构建期缺少环境变量直接 exit(1)。校验由独立入口 dist/startup.js 负责。
//
// 但本文件在 Next.js 16 / Turbopack 构建期是否会被 import？
//   不会：Next.js 只扫描 app/ 下的 route/page 及其依赖图。server.ts 是
//   tsup 单独打包的独立入口，只有在运行期 node dist/server.js 才被执行。
//   因此在这里执行 initializeDatabase 是 100% 安全的（构建期完全不会触发）。
//
// 启动顺序（运行期）：
//   dist/startup.js → validateRuntimeConfig(JWT) → require('./server.js')
//     → initializeDatabase()（建库/建表/建默认管理员/备份调度）
//     → next.prepare() → http.listen
initializeDatabase();

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : 'production'
      }`,
    );
  });
});
