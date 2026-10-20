#!/usr/bin/env bash
# 每日自检：跑八套测试（ui-test 需要 playwright-core，CI 里跳过）
# 任一失败 → 退出码 1，由 workflow 负责开 Issue
set -uo pipefail
cd "$(dirname "$0")/../.."

FAILED=/tmp/failed.txt
: > "$FAILED"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 测试脚本里硬编码了后台密码 jianghan，而 server.js 首次启动会随机生成，
# 所以这里预置一个固定的 admin.json，保证两边对得上。
mkdir -p store/saves store/_trash
printf '{"password":"jianghan","createdAt":%s}' "$(date +%s)000" > store/admin.json
echo "预置后台密码：$(cat store/admin.json)"

run_suite() {
  local t="$1"
  echo "::group::$t"
  if node "$t" > "/tmp/$t.log" 2>&1; then
    echo "✅ $t 通过"
    tail -n 3 "/tmp/$t.log"
  else
    echo "::error file=$t::$t 失败"
    tail -n 40 "/tmp/$t.log"
    echo "$t" >> "$FAILED"
  fi
  echo "::endgroup::"
}

echo "=========== 一、纯逻辑（不需要服务器）==========="
for t in test.js test2.js test3.js test4.js; do
  run_suite "$t"
done

echo "=========== 二、启动服务器 ==========="
node server.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
READY=0
for i in $(seq 1 40); do
  if curl -sf --max-time 2 http://127.0.0.1:8123/api/health > /dev/null 2>&1; then
    READY=1
    echo "服务器就绪（${i}s，pid=$SERVER_PID）"
    break
  fi
  sleep 1
done

if [ "$READY" = "0" ]; then
  echo "::error::服务器 40 秒内没有起来"
  tail -n 50 /tmp/server.log
  echo "server" >> "$FAILED"
else
  echo "=========== 三、接口与对战 ==========="
  for t in api-test2.js api-test3.js api-test4.js pvp-test.js; do
    run_suite "$t"
  done
  echo "--- 服务器日志尾部 ---"
  tail -n 20 /tmp/server.log
fi

echo "=========== 结果 ==========="
if [ -s "$FAILED" ]; then
  echo "失败套件："
  cat "$FAILED"
  exit 1
fi
echo "八套全绿（ui-test 因缺 playwright-core 跳过）"
