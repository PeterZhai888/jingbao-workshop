# Railway 部署：完全掌控构建环境，规避 Railpack/Nixpacks 的配置兼容性问题
FROM node:20-bookworm-slim

# better-sqlite3 原生模块编译工具链（node-gyp 需要 python3 + make/g++）
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先只复制依赖清单，充分利用 Docker 层缓存
COPY package.json pnpm-lock.yaml .npmrc ./
RUN npm install -g pnpm@9.0.0 \
  && pnpm install --frozen-lockfile

# 复制源码并构建（build.sh = tsc 类型检查 + next build + tsup 打包）
COPY . .
RUN pnpm run build

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1

# Railway 运行时自动注入 PORT；server.ts 读取 process.env.PORT（默认 5000）
# 内存限制只在运行期生效，避免影响构建期的 next build
CMD ["bash", "-c", "NODE_OPTIONS='--max-old-space-size=512' node dist/startup.js"]
