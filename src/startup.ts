/**
 * 生产启动入口：先做运行期配置校验（JWT_SECRET 强制、DB_PATH 告警），
 * 通过后再 require dist/server.js。
 */
console.error('[startup] 🚀 dist/startup.js 启动中... NODE_ENV=' + process.env.NODE_ENV);
console.error('[startup] 工作目录: ' + process.cwd());
console.error('[startup] dist 存在: ' + require('fs').existsSync('./lib/server/config.js'));

// === 环境变量诊断 ===
const keysToCheck = [
  'JWT_SECRET', 'DB_PATH',
  'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL',
  'DEEPSEEK_API_KEY',
  'HUNYUAN_API_KEY',
  'DOUBAO_API_KEY', 'DOUBAO_MODEL',
  'DOUBAO_MODEL_FAST', 'DOUBAO_MODEL_STANDARD', 'DOUBAO_MODEL_PLUS', 'DOUBAO_MODEL_FLAGSHIP',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
  'SILICONFLOW_API_KEY',
  'TRUST_PROXY',
];
for (const k of keysToCheck) {
  const v = process.env[k];
  const status = v ? `✅ 已注入 (长度:${v.length})` : '❌ 未注入';
  console.error(`[startup]   ENV ${k}: ${status}`);
}

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
