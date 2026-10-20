# 江汉BR —— 零依赖 Node 服务
# 没有 package.json、没有 npm install：镜像 = Node 运行时 + 代码本身
# 基础镜像自带 arm64（Apple Silicon 原生，不需要 Rosetta）
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=8123 \
    HOST=0.0.0.0

# 只拷运行必需的文件（测试脚本、截图脚本、文档都不进镜像）
COPY server.js world.js game.js trade.js ./
COPY data ./data
COPY public ./public

# 数据目录。真正持久化靠 volume 挂载，这里保证目录存在且 node 用户可写
RUN mkdir -p /app/store/saves /app/store/_trash \
 && chown -R node:node /app

USER node

EXPOSE 8123

# SIGTERM → flushStorage() 落盘后退出
STOPSIGNAL SIGTERM

# 探 /api/health 而不是首页：零 IO、不碰静态资源逻辑
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8123/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
