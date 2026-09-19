#!/usr/bin/env bash
# 一键启动数据中心机柜容量管理平台
#   ./start.sh           构建镜像、启动全部服务（PostgreSQL + API + Web）、健康检查
#   ./start.sh --test    启动后额外运行后端集成测试
#   ./start.sh --no-build 跳过镜像构建
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# 0. Prerequisites
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  error "未检测到 docker，请先安装 Docker: https://docs.docker.com/get-docker/"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  error "需要 docker compose（Docker Desktop 自带或安装 docker-compose-plugin）"
  exit 1
fi

RUN_TESTS=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --test) RUN_TESTS=1 ;;
    --no-build) SKIP_BUILD=1 ;;
    *) warn "未知参数: $arg" ;;
  esac
done

# ---------------------------------------------------------------------------
# 1. Backend unit tests (pure logic, no database needed)
# ---------------------------------------------------------------------------
info "运行后端单元测试（容量计算 / 上架冲突 / 迁移算法）…"
(
  cd backend
  if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund >/dev/null
  fi
  npm run test:unit
)
info "单元测试全部通过 ✅"

# ---------------------------------------------------------------------------
# 2. Frontend production build sanity check
# ---------------------------------------------------------------------------
info "校验前端生产构建…"
(
  cd frontend
  if [ ! -d node_modules ]; then
    npm install --no-audit --no-fund >/dev/null
  fi
  npm run build >/dev/null
)
info "前端构建成功 ✅"

# ---------------------------------------------------------------------------
# 3. Build & start containers
# ---------------------------------------------------------------------------
if [ "$SKIP_BUILD" -eq 0 ]; then
  info "构建 Docker 镜像…"
  $DC build
fi

info "启动服务（db / backend / frontend）…"
$DC up -d

# ---------------------------------------------------------------------------
# 4. Wait for health endpoints
# ---------------------------------------------------------------------------
info "等待后端就绪 …"
ok=0
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  error "后端在限定时间内未就绪，日志如下："
  $DC logs --tail=50 backend
  exit 1
fi
info "后端健康检查通过: $(curl -fsS http://localhost:3000/health)"

for i in $(seq 1 15); do
  if curl -fsS http://localhost:8080/ >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  error "前端未就绪"
  $DC logs --tail=50 frontend
  exit 1
fi
info "前端健康检查通过 ✅"

# ---------------------------------------------------------------------------
# 5. Optional: integration tests against the running PostgreSQL
# ---------------------------------------------------------------------------
if [ "$RUN_TESTS" -eq 1 ]; then
  info "运行集成测试（对容器内 PostgreSQL 执行完整 API 流程）…"
  (
    cd backend
    PGHOST=localhost PGPORT=5432 PGUSER=dcadmin PGPASSWORD=dcpass PGDATABASE=dc_capacity \
      npm run test:integration
  )
  info "集成测试全部通过 ✅"
fi

echo ""
info "🎉 平台已启动："
echo "   前端页面 : http://localhost:8080"
echo "   API 健康 : http://localhost:3000/health"
echo "   数据库   : localhost:5432 (dcadmin/dcpass)"
echo ""
echo "   已内置演示数据：RACK-A 处于电力/制冷超载，可在「迁移方案」页一键计算并执行。"
echo "   停止服务 : ./stop.sh"
