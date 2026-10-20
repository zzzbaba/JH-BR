#!/usr/bin/env bash
# 部署后冒烟测试 —— 在 Mac mini 上跑一遍，确认线上真的能用
#
#   ./smoke-test.sh                  测本机 8123
#   ./smoke-test.sh http://ip:8123   测别的地址
#
# 全绿退出码 0，有失败退出码 1，方便接 cron / CI。
set -uo pipefail
cd "$(dirname "$0")"

BASE="${1:-http://127.0.0.1:8123}"
PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$*"; }
no() { FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "$*"; }
section() { printf '\n\033[36m%s\033[0m\n' "$*"; }

code() { curl -s --noproxy '*' -o /dev/null -m 8 -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
size() { curl -s --noproxy '*' -o /dev/null -m 15 -w '%{size_download}' "$@" 2>/dev/null || echo 0; }

section "1. 健康检查"
H=$(curl -s --noproxy '*' -m 8 "$BASE/api/health" 2>/dev/null || true)
case "$H" in
  *'"ok":true'*)
    ok "/api/health 正常"
    printf '     %s\n' "$H"
    ;;
  *) no "/api/health 异常：${H:-无响应}" ;;
esac

section "2. 页面可访问"
[ "$(code "$BASE/")" = "200" ] && ok "首页 200" || no "首页打不开"
[ "$(code "$BASE/admin.html")" = "200" ] && ok "后台页 200" || no "后台页打不开"

section "3. 前端版本号注入"
VER=$(curl -s --noproxy '*' -m 8 "$BASE/" 2>/dev/null | grep -o 'app\.js?v=[a-z0-9]*' | head -1 | cut -d= -f2)
if [ -n "${VER:-}" ]; then ok "app.js 版本号 $VER"; else no "HTML 里找不到注入的 ?v="; fi

section "4. 压缩与缓存"
RAW=$(size "$BASE/app.js")
GZ=$(size -H 'Accept-Encoding: gzip' "$BASE/app.js")
if [ "${GZ:-0}" -gt 0 ] && [ "$GZ" -lt "$RAW" ]; then
  ok "app.js 原始 ${RAW}B → gzip ${GZ}B"
else
  no "gzip 没生效（原始 ${RAW}B，gzip ${GZ}B）"
fi
if [ -n "${VER:-}" ]; then
  CC=$(curl -s --noproxy '*' -m 8 -D - -o /dev/null "$BASE/app.js?v=$VER" 2>/dev/null | tr -d '\r' | grep -i '^cache-control' || true)
  case "$CC" in
    *immutable*) ok "版本号对得上 → 强缓存（$CC）" ;;
    *) no "版本号对得上但没强缓存（${CC:-无 Cache-Control}）" ;;
  esac
fi

section "5. 鉴权生效"
[ "$(code "$BASE/api/meta")" = "401" ] && ok "未登录访问 /api/meta 被拒（401）" || no "/api/meta 未鉴权就能访问"
[ "$(code "$BASE/api/state")" = "401" ] && ok "未登录访问 /api/state 被拒（401）" || no "/api/state 未鉴权就能访问"

section "6. 数据目录"
if [ -f store/admin.json ]; then
  ok "store/admin.json 存在（说明容器能写入挂载的 volume）"
  PW=$(grep -o '"password"[[:space:]]*:[[:space:]]*"[^"]*"' store/admin.json | sed 's/.*"\([^"]*\)"$/\1/' || true)
  [ -n "${PW:-}" ] && printf '     后台密码 %s\n' "$PW"
else
  no "store/admin.json 不存在 —— volume 可能没挂上，或容器没权限写"
fi
if [ -d store/saves ]; then
  n=$(find store/saves -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  ok "store/saves 可读（$n 份存档）"
else
  no "store/saves 不存在"
fi

section "7. 容器状态"
if command -v docker >/dev/null 2>&1; then
  ST=$(docker inspect -f '{{.State.Health.Status}}' jianghan-br 2>/dev/null || echo "unknown")
  case "$ST" in
    healthy) ok "容器健康：$ST" ;;
    starting) printf '  \033[33m…\033[0m 容器还在启动中（%s），稍等再跑一次\n' "$ST" ;;
    *) no "容器健康状态：$ST" ;;
  esac
else
  printf '  \033[33m…\033[0m 没装 docker，跳过（非容器方式运行属正常）\n'
fi

section "结果"
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32m全部通过（%d 项）\033[0m\n\n' "$PASS"
  exit 0
else
  printf '\033[31m%d 项通过，%d 项失败\033[0m\n\n' "$PASS" "$FAIL"
  exit 1
fi
