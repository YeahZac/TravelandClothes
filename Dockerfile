# 全民优享 traffic-cms → 微信云托管服务 test-sever（覆盖原同袍会 backend）
FROM node:20-bookworm-slim

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

HEALTHCHECK --interval=30s --timeout=8s --start-period=50s --retries=5 \
  CMD wget -qO- http://localhost:80/ping || exit 1

CMD ["node", "src/server.js"]
