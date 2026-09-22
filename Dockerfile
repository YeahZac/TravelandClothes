FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY backend/package.json ./
RUN npm install --production

# 复制源码
COPY backend/ ./

# 云托管探针检测 80 端口，应用需监听 80
ENV PORT=80
EXPOSE 80

# 健康检查：放宽超时，避免偶发 DB/冷启动误杀实例
HEALTHCHECK --interval=30s --timeout=8s --start-period=40s --retries=5 \
  CMD wget -qO- http://localhost:80/health || exit 1

CMD ["node", "src/app.js"]
