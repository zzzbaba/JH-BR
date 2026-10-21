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

# 删容器。容器进程卡在不可中断系统调用时（典型表现：cannot stop container,
# did not receive an exit event），compose down 会失败，得逐级降级。
force_remove() {
  if $DC down --remove-orphans 2>/dev/null; then
    return 0
  fi
  warn "compose down 失败，改用 docker rm -f 强制删除…"
  docker rm -f "$SERVICE" 2>/dev/null || true
  sleep 1
  if docker inspect "$SERVICE" >/dev/null 2>&1; then
    warn ""
    warn "容器还在。说明进程卡死了，只能重启 Docker 引擎："
    warn "  菜单栏 OrbStack 图标 → Quit，然后重新打开"
    warn "  命令行等价写法："
    warn "    osascript -e 'quit app \"OrbStack\"' ; sleep 3 ; open -a OrbStack"
    warn "  重启后再执行 ./deploy.sh"
    return 1
  fi
  say "已强制删除。"
  return 0
}

# ---- 检查 docker 引擎是否在跑（OrbStack 是菜单栏 App，没启动就没有 socket）----
if ! docker info >/dev/null 2>&1; then
  warn "Docker 引擎没在运行，尝试启动 OrbStack…"
  if [ -d "/Applications/OrbStack.app" ] || [ -d "$HOME/Applications/OrbStack.app" ]; then
    open -a OrbStack 2>/dev/null || true
    i=0
    while [ $i -lt 40 ]; do
      docker info >/dev/null 2>&1 && break
      i=$((i + 1))
      sleep 1
    done
  fi
  if ! docker info >/dev/null 2>&1; then
    die "Docker 仍然不可用。手动打开 OrbStack（open -a OrbStack）等它起来后重试。
无人值守建议在 OrbStack 设置里勾上「Launch at login」，重启后能自动恢复。"
  fi
  say "Docker 引擎已就绪。"
fi

# ---- 选 compose 命令（新版是 docker compose，老版是 docker-compose）----
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  die "找不到 docker compose。macOS 上装 OrbStack 或 Docker Desktop 即可。"
fi

# ---- 数据卷 ----
# 必须用 docker 卷，不能 bind mount：storage-queue 落盘要 fsync，
# fsync 在 virtiofs（macOS bind mount）上会挂死，容器变 D 状态连 SIGKILL 都杀不掉。
VOL=jianghan-br-store
docker volume create "$VOL" >/dev/null 2>&1 || true

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
    say "已停止（数据保留在 docker 卷 $VOL）。"
    exit 0
    ;;
  --destroy)
    warn "将删除容器（docker 卷 $VOL 里的数据不受影响）。"
    force_remove || true
    say "已删除容器。"
    exit 0
    ;;
  --reset)
    warn "彻底重来：删容器 + 删镜像 + 清空数据卷（数据会没，确认后再跑）"
    printf '确认？输入 yes 继续：'
    read -r ans
    [ "$ans" = "yes" ] || die "已取消。"
    force_remove || true
    docker rmi -f jianghan-br:latest 2>/dev/null || true
    docker volume rm "$VOL" >/dev/null 2>&1 || true
    docker volume create "$VOL" >/dev/null 2>&1 || true
    say "已清理。接着执行 ./deploy.sh 重新构建。"
    exit 0
    ;;
  --diag)
    say "===== 环境 ====="
    docker version --format '{{.Server.Version}}' 2>/dev/null || echo "docker 不可用"
    $DC version 2>/dev/null | head -3 || true
    say ""
    say "===== 容器状态 ====="
    $DC ps -a || true
    say ""
    say "===== 容器详情 ====="
    docker inspect "$SERVICE" --format '状态={{.State.Status}} 退出码={{.State.ExitCode}} 重启次数={{.RestartCount}}
启动时间={{.State.StartedAt}}
镜像={{.Config.Image}}
入口={{.Config.Entrypoint}}
命令={{.Config.Cmd}}
用户={{.Config.User}}
工作目录={{.Config.WorkingDir}}
环境={{range .Config.Env}}{{.}} {{end}}
端口={{range $p, $v := .NetworkSettings.Ports}}{{$p}}→{{range $v}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' 2>/dev/null || echo "没有这个容器"
    say ""
    say "===== 最近 50 行日志 ====="
    $DC logs --tail=50 2>&1 || true
    say ""
    say "===== store 目录 ====="
    ls -ld store store/saves 2>/dev/null || echo "store 不存在"
    docker exec "$SERVICE" ls -l /app/store/admin.json 2>/dev/null || echo "admin.json 还没生成（说明服务没跑到写配置那一步）"
    say ""
    say "===== 端口 ====="
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || echo "$PORT 没有进程在监听"
    exit 0
    ;;
  --data)
    SRC="${2:-}"
    [ -n "$SRC" ] || die "用法：./deploy.sh --data /path/to/store"
    [ -d "$SRC" ] || die "目录不存在：$SRC"
    say "导入老数据：$SRC → docker 卷 $VOL"
    docker volume create "$VOL" >/dev/null 2>&1 || true
    docker run --rm -v "$VOL":/to -v "$SRC":/from:ro node:22-alpine \
      sh -c 'cp -a /from/. /to/ && echo "存档 $(ls /to/saves 2>/dev/null | wc -l | tr -d " ") 份"'
    say "导入完成。"
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
# --force-recreate：每次都按新镜像重建容器，避免旧容器残留导致「明明改了却没生效」
# --remove-orphans：清掉改名/删服务留下的孤儿容器
say "构建镜像并启动（首次约 10~30 秒）…"
$DC up -d --build --force-recreate --remove-orphans

# ---- 等健康检查通过 ----
say "等待服务就绪…"
code=""
i=0
while [ $i -lt 60 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/api/health" || true)
  if [ "$code" = "200" ]; then break; fi
  # 容器已经退出就没必要再等了
  st=$(docker inspect -f '{{.State.Status}}' "$SERVICE" 2>/dev/null || echo "")
  if [ "$st" = "exited" ] || [ "$st" = "dead" ]; then
    warn "容器已退出（$st），不再等待。"
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$code" = "200" ]; then
  say ""
  say "✅ 部署完成"
  say "   游戏    http://127.0.0.1:$PORT"
  say "   后台    http://127.0.0.1:$PORT/admin.html"
  pwd=$(docker exec "$SERVICE" cat /app/store/admin.json 2>/dev/null | grep -o '"password"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' || true)
  if [ -n "${pwd:-}" ]; then
    say "   后台密码 $pwd"
  else
    say "   后台密码见：docker exec $SERVICE cat /app/store/admin.json"
  fi
  say "   数据卷 docker 卷 $VOL（备份方法见 README）"
  say ""
  say "   OrbStack 还可用容器域名访问：http://$SERVICE.orb.local:$PORT"
  say ""

  # 顺手跑一遍冒烟测试，省得部署完还要手动确认
  if [ -x ./smoke-test.sh ]; then
    say "自动冒烟测试："
    ./smoke-test.sh "http://127.0.0.1:$PORT" || warn "⚠ 冒烟测试有失败项，见上面的 ✗"
  fi
else
  warn ""
  warn "⚠ 服务没起来（HTTP ${code:-无响应}）。下面是容器状态和最近日志，可以直接复制发给开发者："
  warn ""
  $DC ps || true
  warn ""
  warn "---------------- 最近 40 行日志 ----------------"
  $DC logs --tail=40 || true
  warn "----------------------------------------------"
  warn ""
  warn "常见原因："
  warn "  · 日志里出现 EACCES / permission denied → ./store 目录不可写"
  warn "    解决：chmod -R 777 store && ./deploy.sh --restart"
  warn "  · 端口 $PORT 被占用 → lsof -nP -iTCP:$PORT -sTCP:LISTEN"
  warn "  · 什么都没打印就退出 → ./deploy.sh --logs 看完整输出"
  exit 1
fi
