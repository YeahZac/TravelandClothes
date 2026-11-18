# 全民优享 traffic-cms → 微信云托管服务 test-sever
# Node 20 + deasync 会触发 async hook stack corrupted；运行时仍锁 Node 18。
# 多阶段：编译态装原生依赖，运行态只带 wget，减小最终层体积，缓解 CCR 推层超时。

FROM node:18-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY traffic-cms/package.json traffic-cms/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && npm cache clean --force

FROM node:18-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY traffic-cms/package.json traffic-cms/package-lock.json* ./
COPY traffic-cms/src ./src
COPY traffic-cms/public ./public
COPY traffic-cms/sql ./sql
COPY traffic-cms/scripts ./scripts
COPY traffic-cms/deploy ./deploy
COPY traffic-cms/data/legal ./data/legal
# 运行时目录（云盘/空卷可挂载；不把本地 uploads/sqlite 打进镜像）
RUN mkdir -p uploads data certs/wxpay

ENV PORT=80
ENV COS_MODE=tencent
ENV DB_NAME=travel_clothes
ENV BUILD_ID=async-hotpath-v30
EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --start-period=90s --retries=8 \
  CMD wget -qO- http://localhost:80/ping || exit 1

CMD ["node", "src/entry.js"]
