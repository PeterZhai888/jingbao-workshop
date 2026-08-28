#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
# 分别打包 server 与 config（依赖层必须有 dist/lib/server/config.js 供 startup require）
pnpm tsup src/server.ts src/lib/server/config.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
# 运行期入口：先做配置校验再启动 server，与构建期完全隔离
cp src/startup.ts dist/startup.js

echo "Build completed successfully!"
