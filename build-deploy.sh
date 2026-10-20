#!/usr/bin/env bash
# 重新生成部署包 jianghan-br-deploy.zip
# 改完代码后跑一次，把 zip 传到 Mac mini 覆盖解压即可。
set -euo pipefail
cd "$(dirname "$0")"

STAGE=_pkg/jianghan-br
ZIP=jianghan-br-deploy.zip

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "需要 python3 来打包（保证 zip 内路径是正斜杠）"; exit 1; }

rm -rf _pkg
mkdir -p "$STAGE/data" "$STAGE/public" "$STAGE/store/saves" "$STAGE/store/_trash"

cp server.js world.js game.js trade.js "$STAGE"/
cp data/*.js "$STAGE"/data/
cp public/* "$STAGE"/public/
cp Dockerfile docker-compose.yml deploy.sh smoke-test.sh README-DEPLOY.md .dockerignore "$STAGE"/
touch "$STAGE/store/saves/.gitkeep" "$STAGE/store/_trash/.gitkeep"

# Windows 的 Compress-Archive 会写反斜杠路径，macOS 解压会得到带 \ 的文件名。
# 这里用 Python 的 zipfile，路径统一正斜杠，并保留 deploy.sh 的可执行位。
"$PY" - "$STAGE" "$ZIP" <<'PY'
import os, sys, zipfile, time
stage, out = sys.argv[1], sys.argv[2]
if os.path.exists(out):
    os.remove(out)

def mode_for(name):
    return 0o755 if name.endswith('.sh') else 0o644

n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(stage):
        dirs.sort(); files.sort()
        rel = os.path.relpath(root, os.path.dirname(stage)).replace(os.sep, '/')
        if root != stage:
            zi = zipfile.ZipInfo(rel + '/', time.localtime()[:6])
            zi.create_system = 3                      # Unix，否则 unzip 不认权限位
            zi.external_attr = (0o755 << 16) | 0x10
            z.writestr(zi, b'')
        for f in files:
            full = os.path.join(root, f)
            arc = rel + '/' + f
            zi = zipfile.ZipInfo.from_file(full, arc)
            zi.create_system = 3                      # 必须显式设成 Unix
            zi.external_attr = (mode_for(f) << 16) | 0o100000
            zi.compress_type = zipfile.ZIP_DEFLATED
            with open(full, 'rb') as fh:
                z.writestr(zi, fh.read())
            n += 1
print('打包完成：%d 个文件，%.1f KB' % (n, os.path.getsize(out) / 1024))
PY

echo "→ $ZIP"
echo "传到 Mac mini 后：unzip $ZIP && cd jianghan-br && chmod +x deploy.sh && ./deploy.sh"
