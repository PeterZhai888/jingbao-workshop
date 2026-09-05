# AI 短视频工具箱 —— 一键构建镜像（前端构建 + 后端运行）
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
# better-sqlite3 原生模块编译依赖（有预编译包时不会真正编译）
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
# better-sqlite3 强制源码编译，避免 prebuilt binary 在不同平台 ABI 不匹配导致 crash
RUN npm ci --omit=dev && npm rebuild better-sqlite3 --build-from-source
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV PORT=3000
EXPOSE 3000
# 注意：Railway 不支持 Dockerfile VOLUME，需在 Railway 控制台手动挂载 Volume 到 /app/server/data
CMD ["node", "src/index.js"]
