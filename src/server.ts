import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

// 注意：运行期配置校验（JWT_SECRET / DB_PATH）不在此文件内执行，
// 因为 Next.js 构建阶段会 import server.ts 并通过 babel 插件触发执行，
// 导致构建期缺少环境变量直接 exit(1)。校验由独立入口 dist/startup.js 负责。

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
