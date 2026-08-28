/**
 * 生产启动入口：先做运行期配置校验（JWT_SECRET 强制、DB_PATH 告警），
 * 通过后再 require dist/server.js。
 *
 * 为什么不直接在 server.ts 里校验？
 *   Next.js Turbopack 构建阶段会 import 整个依赖图（含 server.ts），
 *   并通过 react-dev-inspector 的 babel 插件在构建期执行代码。
 *   校验如果放在 server.ts 顶层，构建期就会因缺环境变量而 exit(1)。
 */
const { validateRuntimeConfig } = require('./lib/server/config');
validateRuntimeConfig();
require('./server.js');
