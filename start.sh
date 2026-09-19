#!/usr/bin/env bash
#
# 数据中心机柜容量管理平台 - 一键启动脚本
#
# 用法:
#   ./start.sh              等同于 ./start.sh docker
#   ./start.sh docker       Docker Compose 构建并启动 (Postgres + API + Web)
#   ./start.sh local        本机直接启动（内存存储，无需 Docker / PostgreSQL）
#   ./start.sh dev          本机开发模式（Vite 热更新 + 内存 API）
#   ./start.sh test         运行后端全部自动化测试
#   ./start.sh stop         停止并移除 Docker 容器
#   ./start.sh clean        停止容器并删除数据卷（清空所有数据）
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
CLIENT_DIR="$ROOT_DIR/client"

# 输出颜色
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${BLUE}==>${NC} $*"; }
ok()    { echo -e "${GREEN}✔${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }

# 兼容 docker compose v2 与 docker-compose v1
compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

ensure_npm_deps() {
  if [ ! -d "$1/node_modules" ]; then
    info "安装依赖: $1"
    (cd "$1" && npm install --no-audit --no-fund)
  fi
}

cmd_docker() {
  command -v docker >/dev/null 2>&1 || { echo "未找到 docker，请先安装 Docker"; exit 1; }
  info "构建镜像并启动全栈服务（PostgreSQL + API + Web）..."
  compose_cmd up -d --build
  cat <<EOF

${GREEN}========================================================${NC}
  平台已启动:
    前端页面 : http://localhost:8080
    API 健康 : http://localhost:3000/api/health
  PostgreSQL : localhost:5432 (dcadmin/dcpass/dc_capacity)
${GREEN}========================================================${NC}
  查看日志: ./start.sh logs    停止: ./start.sh stop
EOF
}

cmd_local() {
  ensure_npm_deps "$SERVER_DIR"
  ensure_npm_deps "$CLIENT_DIR"
  info "构建前端生产包并由 Node 提供静态文件以外的方式运行..."
  (cd "$CLIENT_DIR" && npm run build)
  info "以内存存储模式启动 API（端口 3000）..."
  (cd "$SERVER_DIR" && DB_MODE=memory PORT=3000 node src/server.js) &
  API_PID=$!
  info "启动前端静态服务（端口 8080）..."
  (cd "$CLIENT_DIR" && npx --yes vite preview --port 8080 --host) &
  WEB_PID=$!
  trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM EXIT
  cat <<EOF

${GREEN}========================================================${NC}
  本机演示模式已启动（内存存储，重启后数据重置）:
    前端页面 : http://localhost:8080  (需通过代理访问 API)
    API 地址 : http://localhost:3000
${GREEN}========================================================${NC}
  按 Ctrl+C 停止全部服务
EOF
  wait
}

cmd_dev() {
  ensure_npm_deps "$SERVER_DIR"
  ensure_npm_deps "$CLIENT_DIR"
  info "启动 API（内存存储，端口 3000，支持 --watch 重启）..."
  (cd "$SERVER_DIR" && DB_MODE=memory PORT=3000 node --watch src/server.js) &
  API_PID=$!
  info "启动 Vite 开发服务器（端口 5173，/api 自动代理到 3000）..."
  (cd "$CLIENT_DIR" && npm run dev) &
  WEB_PID=$!
  trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM EXIT
  cat <<EOF

${GREEN}========================================================${NC}
  开发模式已启动: http://localhost:5173
${GREEN}========================================================${NC}
  按 Ctrl+C 停止
EOF
  wait
}

cmd_test() {
  ensure_npm_deps "$SERVER_DIR"
  info "运行后端自动化测试（容量算法 / 冲突检测 / 迁移规划 / API / 启动）..."
  (cd "$SERVER_DIR" && npm test)
  ok "全部测试通过"
}

cmd_stop() {
  info "停止容器..."
  compose_cmd down
  ok "已停止"
}

cmd_clean() {
  info "停止容器并删除数据卷..."
  compose_cmd down -v
  ok "已清理"
}

case "${1:-docker}" in
  docker) cmd_docker ;;
  local)  cmd_local ;;
  dev)    cmd_dev ;;
  test)   cmd_test ;;
  stop)   cmd_stop ;;
  clean)  cmd_clean ;;
  logs)   compose_cmd logs -f ;;
  *)
    echo "未知命令: $1"
    grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
