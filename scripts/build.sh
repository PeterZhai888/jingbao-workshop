#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "[Build Step 1/4] TypeScript 类型检查（单进程，避免 CI/容器 OOM）..."
pnpm tsc -p tsconfig.json --noEmit

echo "[Build Step 2/4] Building the Next.js project（跳过 Next 内置 TypeScript 步骤，已在上一步完成）..."
export NEXT_PRIVATE_NTBA_CPUS="${NEXT_PRIVATE_NTBA_CPUS:-2}"
pnpm next build

echo "Bundling server with tsup..."
# 分别打包 server 与 config（依赖层必须有 dist/lib/server/config.js 供 startup require）
pnpm tsup src/server.ts src/lib/server/config.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
# 运行期入口：先做配置校验再启动 server，与构建期完全隔离
cp src/startup.ts dist/startup.js

echo "Build completed successfully!"
