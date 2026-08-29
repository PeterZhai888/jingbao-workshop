/**
 * 生产启动入口：先做运行期配置校验（JWT_SECRET 强制、DB_PATH 告警），
 * 通过后再 require dist/server.js。
 */
console.error('[startup] 🚀 dist/startup.js 启动中... NODE_ENV=' + process.env.NODE_ENV);
console.error('[startup] 工作目录: ' + process.cwd());
console.error('[startup] dist 存在: ' + require('fs').existsSync('./lib/server/config.js'));

try {
  const { validateRuntimeConfig } = require('./lib/server/config');
  console.error('[startup] ✅ 加载 config 成功');
  validateRuntimeConfig();
  console.error('[startup] ✅ validateRuntimeConfig 通过');
  require('./server.js');
  console.error('[startup] ✅ require server.js 完成（进入 Next prepare 阶段）');
} catch (err) {
  console.error('[startup] ❌ 启动失败:', err);
  process.exit(1);
}
