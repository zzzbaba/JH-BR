#!/usr/bin/env bash
# 江汉BR 一键部署 —— macOS / OrbStack / Docker Desktop
#
#   ./deploy.sh              构建并启动（默认）
#   ./deploy.sh --data <目录>  先把老 store 目录导入再启动（迁移用）
#   ./deploy.sh --status     看运行状态
#   ./deploy.sh --logs       跟踪日志
#   ./deploy.sh --restart    重启
#   ./deploy.sh --stop       停止
#   ./deploy.sh --destroy    停止并删除容器（数据保留在 ./store）
set -euo pipefail
cd "$(dirname "$0")"

PORT=8123
SERVICE=jianghan-br

say() { printf '\033[36m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# ---- 选 compose 命令（新版是 docker compose，老版是 docker-compose）----
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  die "找不到 docker compose。macOS 上装 OrbStack 或 Docker Desktop 即可。"
fi

# ---- 数据目录 ----
mkdir -p store/saves store/_trash

ACTION="${1:-up}"

case "$ACTION" in
  --status)
    $DC ps
    exit 0
    ;;
  --logs)
    $DC logs -f --tail=100
    exit 0
    ;;
  --restart)
    $DC restart
    say "已重启。"
    exit 0
    ;;
  --stop)
    $DC stop
    say "已停止（数据保留在 ./store）。"
    exit 0
    ;;
  --destroy)
    warn "将删除容器（./store 里的数据不受影响）。"
    $DC down
    say "已删除容器。"
    exit 0
    ;;
  --data)
    SRC="${2:-}"
    [ -n "$SRC" ] || die "用法：./deploy.sh --data /path/to/store"
    [ -d "$SRC" ] || die "目录不存在：$SRC"
    say "导入老数据：$SRC → ./store"
    mkdir -p store
    # 用 cp -a 保留结构；不删目标里已有的东西，避免误伤
    cp -a "$SRC/." store/
    say "导入完成：$(find store/saves -name '*.json' 2>/dev/null | wc -l | tr -d ' ') 个存档"
    ;;
  up|"") ;;
  *) die "未知参数：$ACTION（可用：--data/--status/--logs/--restart/--stop/--destroy）" ;;
esac

# ---- 端口占用检查 ----
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    warn "端口 $PORT 已被占用，容器可能起不来。先执行：lsof -nP -iTCP:$PORT -sTCP:LISTEN"
  fi
fi

# ---- 构建 + 启动 ----
say "构建镜像并启动（首次约 10~30 秒）…"
$DC up -d --build

# ---- 等健康检查通过 ----
say "等待服务就绪…"
i=0
while [ $i -lt 40 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/index.html" || true)
  if [ "$code" = "200" ]; then break; fi
  i=$((i + 1))
  sleep 1
done

if [ "$code" = "200" ]; then
  say ""
  say "✅ 部署完成"
  say "   游戏    http://127.0.0.1:$PORT"
  say "   后台    http://127.0.0.1:$PORT/admin.html"
  if [ -f store/admin.json ]; then
    pwd=$(grep -o '"password"[[:space:]]*:[[:space:]]*"[^"]*"' store/admin.json | sed 's/.*"\([^"]*\)"$/\1/' || true)
    [ -n "${pwd:-}" ] && say "   后台密码 $pwd"
  else
    say "   后台密码 jianghan（首次启动自动生成，见 store/admin.json）"
  fi
  say "   数据目录 ./store（备份直接拷这个目录）"
  say ""
  say "   OrbStack 还可用容器域名访问：http://$SERVICE.orb.local:$PORT"
  say ""

  # 顺手跑一遍冒烟测试，省得部署完还要手动确认
  if [ -x ./smoke-test.sh ]; then
    say "自动冒烟测试："
    ./smoke-test.sh "http://127.0.0.1:$PORT" || warn "⚠ 冒烟测试有失败项，见上面的 ✗"
  fi
else
  warn "⚠ 启动超时，看日志：./deploy.sh --logs"
  $DC ps
  exit 1
fi
