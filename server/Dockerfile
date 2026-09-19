# ---- 数据中心机柜容量管理平台 - 后端 ----
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# 优先复制依赖清单以利用缓存
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

EXPOSE 3000

# 默认连接 compose 中的 postgres 服务；可用 DB_MODE=memory 切换内存存储
CMD ["node", "src/server.js"]
