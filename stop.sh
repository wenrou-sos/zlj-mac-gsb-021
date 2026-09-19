#!/usr/bin/env bash
# 停止并清理数据中心容量管理平台
#   ./stop.sh           停止容器（保留数据库数据卷）
#   ./stop.sh --purge   同时删除数据库数据卷
set -euo pipefail
cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

if [ "${1:-}" = "--purge" ]; then
  echo "[INFO] 停止服务并删除数据卷…"
  $DC down -v
else
  echo "[INFO] 停止服务（保留数据，加 --purge 可清除数据）…"
  $DC down
fi
echo "[INFO] 完成"
