# AI 短视频工具箱 —— 一键构建镜像（前端构建 + 后端运行）
# Node 24：使用内置 node:sqlite，零原生依赖，无需编译工具链
FROM node:24-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV PORT=3000
EXPOSE 3000
# 注意：Railway 不支持 Dockerfile VOLUME，需在 Railway 控制台手动挂载 Volume 到 /app/server/data
# --no-warnings：屏蔽 node:sqlite 的 ExperimentalWarning，保持生产日志干净
CMD ["node", "--no-warnings", "src/index.js"]
