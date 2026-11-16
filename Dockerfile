# 全民优享 traffic-cms → 微信云托管服务 test-sever（覆盖原同袍会 backend）
# 现有同步 DB 门面依赖 deasync；Node 20 会触发 async hook stack corrupted 并杀进程。
# 全量 async 化完成前锁定 Node 18，关键首屏链路同时已改为纯 async。
FROM node:18-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ wget \
  && rm -rf /var/lib/apt/lists/*

COPY traffic-cms/package.json traffic-cms/package-lock.json* ./
RUN npm install --omit=dev

COPY traffic-cms/ ./

ENV PORT=80
ENV COS_MODE=tencent
ENV DB_NAME=travel_clothes
EXPOSE 80

# start-period 加长：进程先 listen /ping，DB 在后台初始化
HEALTHCHECK --interval=20s --timeout=5s --start-period=90s --retries=8 \
  CMD wget -qO- http://localhost:80/ping || exit 1

# entry：0.0.0.0 监听 + 延迟 async 连库，避免探针 connection refused
CMD ["node", "src/entry.js"]
