FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY backend/package.json ./
RUN npm install --production

# 复制源码
COPY backend/ ./

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
