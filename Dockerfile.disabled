# 多阶段构建：编译阶段装原生模块依赖 → 运行阶段只带产物
FROM node:20-slim AS builder

# better-sqlite3 等原生模块编译所需
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# 构建环境变量：
#   NEXT_TELEMETRY_DISABLED → 关遥测避免网络请求
#   NEXT_PRIVATE_NTBA_CPUS=4 → 限制收集页面数据的 worker 数（容器 CPU/内存有限时 31 workers 会 OOM）
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PRIVATE_NTBA_CPUS=4 \
    NODE_OPTIONS="--max-old-space-size=4096"

# 先拷包定义文件再安装（利用 Docker 缓存）
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN pnpm install --frozen-lockfile

# 构建 Next.js 与 server bundle（config 必须单独打包，供 startup require）
COPY . .
# 强制移除 TRAE/Railway 可能在 COPY 时带进 /app/.babelrc（它会被
# react-dev-inspector 插件利用，在构建期执行代码导致 exit/副作用）
RUN rm -f /app/.babelrc /app/.babelrc.js /app/babel.config.js /app/babel.config.cjs \
    && pnpm next build
RUN pnpm tsup src/server.ts src/lib/server/config.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
# 运行期入口：先做配置校验（JWT_SECRET/DB_PATH）再启动 server，与构建期完全隔离
RUN cp src/startup.ts dist/startup.js

# --- 运行阶段：更轻量 ---
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=4096"

# 运行时只需 better-sqlite3 的原生 .node 文件，需要重新装一次完整依赖
# （上面构建阶段的 node_modules 带完整编译产物，但我们拷 dist/.next 过来）
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# 仅安装生产依赖 + 原生模块编译工具
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.0.0 --activate \
    && pnpm install --frozen-lockfile --prod

EXPOSE 5000
CMD ["node", "dist/startup.js"]
