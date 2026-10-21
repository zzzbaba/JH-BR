# 江汉BR —— Mac mini 部署说明

零依赖 Node 服务，镜像里只有 Node 运行时和代码，不需要 `npm install`。
默认端口 **8123**，和 Windows 上完全一致。

---

## 一、前置条件

Mac mini 上装 **OrbStack**（推荐，比 Docker Desktop 轻很多）：

```bash
brew install --cask orbstack
```

装完打开一次 OrbStack，等它把 docker 命令注入好。验证：

```bash
docker version          # 能看到 Client 和 Server 两段
docker compose version  # 有输出即可
```

> 用 Docker Desktop 也行，命令完全一样。

**无人值守必做**：打开 OrbStack 设置 → General → 勾上 **Launch at login**。
OrbStack 是菜单栏 App，没登录/没启动就没有 docker 引擎，重启后服务不会自己回来。
（`deploy.sh` 检测到引擎没跑会自动尝试 `open -a OrbStack`，但开机自启更省事。）

---

## 二、部署（一条命令）

把 zip 传到 Mac mini，解压后进目录：

```bash
unzip jianghan-br-deploy.zip
cd jianghan-br
chmod +x deploy.sh
./deploy.sh
```

看到 `✅ 部署完成` 就好了，脚本会接着自动跑一遍冒烟测试。打开浏览器：

- 游戏：`http://<mac-mini-IP>:8123`
- 后台：`http://<mac-mini-IP>:8123/admin.html`

OrbStack 还会给一个容器域名，不用查 IP：

```
http://jianghan-br.orb.local:8123
```

**首次启动会生成一个随机的后台密码**（不是固定默认值），写在 `store/admin.json`，
同时打印在启动日志里。`deploy.sh` 跑完会直接把这个密码显示出来。

想自己看：

```bash
cat store/admin.json
# 或者
./deploy.sh --logs | head -20
```

**挂公网前请改成强密码**：进后台 → 设置 → 改密码（至少 8 位）。
改完所有后台会话立刻失效，需要重新登录。启动时如果检测到密码不足 10 位会打印警告。

---

## 三、从 Windows 迁移老数据（可选）

如果要把现有的存档和账号带过去，先把 Windows 上的 `store` 目录拷到 Mac mini，然后：

```bash
./deploy.sh --data /path/to/old-store
```

它会先导入再启动。导入后存档数会打印出来。

**不导入也没关系**，服务会自己建一个空的 `store`，从零开新档。

---

## 四、常用命令

```bash
./deploy.sh --status     # 运行状态 + 健康检查
./deploy.sh --logs       # 实时日志（Ctrl+C 退出）
./deploy.sh --restart    # 重启（会先落盘再重启，不丢数据）
./deploy.sh --stop       # 停止
./deploy.sh --destroy    # 删除容器，./store 数据保留
./deploy.sh --diag       # 出问题时先跑这个：环境/容器/日志/权限/端口一次全打出来
./deploy.sh --reset      # 彻底重来：删容器+删镜像+清空 store（会二次确认）

./smoke-test.sh          # 冒烟测试：10 项，全绿说明线上真的能用
./smoke-test.sh http://别的地址:8123
```

`smoke-test.sh` 会检查：健康接口、页面可访问、版本号注入、gzip、强缓存、
鉴权、数据目录可写、容器健康状态。**部署完或改完代码，跑它最快确认没坏。**

等价的 docker 命令：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
docker compose restart
docker compose down
```

---

## 五、监控（没有桌面也能看）

```bash
curl -s http://127.0.0.1:8123/api/health
```

```json
{"ok":true,"uptime":3600,"memMB":51,"saves":261,"dirty":0,
 "storage":true,"round":{"id":220,"state":"running"},"build":"7acbdd20"}
```

`build` 是前端资源版本号 —— 一眼看出线上跑的是哪一版代码。
这个接口不需要登录、不碰磁盘、不泄露玩家信息，可以直接喂给 uptime 监控：

```bash
# 每分钟探一次，挂了记日志
* * * * * curl -fsS -m 5 http://127.0.0.1:8123/api/health > /dev/null || echo "$(date) 挂了" >> ~/br-alert.log
```

---

## 六、数据与备份

所有状态都在 **docker 卷 `jianghan-br-store`** 里（不是项目目录）：

```
jianghan-br-store/
├── admin.json     后台密码
├── users.json     账号表
├── world.json     世界状态（当前轮次、聊天、空投）
├── saves/         每个玩家一个 JSON
└── _trash/        删除缓冲，会自动清空
```

**为什么用卷而不是 `./store` 目录？**
`storage-queue.js` 落盘时会 `fsync`（`handle.sync()`）。fsync 在 virtiofs
（macOS 的 bind mount）上会挂死——进程卡进 D 状态，连 SIGKILL 都杀不掉，
容器「Up 但没响应」，还会把整个 Docker 引擎拖到 420% CPU。
卷在 VM 内的 ext4 上，fsync 正常。**这是踩过的坑，别改回 bind mount。**

### 备份

```bash
# 手动备份到当前目录
docker run --rm -v jianghan-br-store:/d -v "$PWD":/b node:22-alpine \
  tar czf /b/br-$(date +%F).tgz -C /d .

# 每天凌晨 3 点，保留 7 天
crontab -e
0 3 * * * cd ~/Desktop/jianghan-br && docker run --rm -v jianghan-br-store:/d -v "$PWD":/b node:22-alpine tar czf /b/br-$(date +\%F).tgz -C /d . && find . -name 'br-*.tgz' -mtime +7 -delete
```

恢复：

```bash
docker run --rm -v jianghan-br-store:/d -v "$PWD":/b node:22-alpine \
  sh -c 'cd /d && tar xzf /b/br-2026-10-21.tgz'
./deploy.sh --restart
```

### 迁移老数据

```bash
./deploy.sh --data /path/to/old-store
```

会把那个目录的内容灌进 docker 卷。

**注意**：服务是「内存优先 + 串行队列落盘」，正常退出会 drain。
直接 `docker kill` 可能丢最后几百毫秒的数据。
用 `./deploy.sh --stop` 或 `docker compose stop` 会走 SIGTERM，先落盘再退出。

## 七、对外网开放（重要）

`8123` 是明文 HTTP，**不要直接把端口映射到公网**。三种做法：

**A. Cloudflare Tunnel（最省事，不用公网 IP、自带 HTTPS）**

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create jianghan-br
cloudflared tunnel route dns jianghan-br br.你的域名.com
cloudflared tunnel run --url http://localhost:8123 jianghan-br
```

**B. Nginx 反代 + Let's Encrypt**（有公网 IP 时）

```nginx
location / {
    proxy_pass http://127.0.0.1:8123;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 60s;
}
```

服务端已经设了 `keepAliveTimeout=65s`，比常见反代的 60s 长，不会出 502。

**C. Tailscale**（只给自己人玩，最安全）

```bash
brew install tailscale && tailscale up
# 之后用 http://<mac-mini-tailscale-IP>:8123 访问
```

---

## 八、已经做过的性能与安全处理

### 安全（公网防爆破）

| 项 | 现状 |
|---|---|
| 后台密码 | **首次启动随机生成**，不再是固定默认值；改密后旧会话立即失效 |
| 后台鉴权 | 只认登录签发的临时 token（12 小时过期），**已封掉明文密码直通** |
| 登录限流 | 两层：同账号 10 分钟错 8 次锁 1 分钟；同 IP 10 分钟错 50 次锁 5 分钟 |
| 账号枚举 | 「账号不存在」和「密码错」返回同一句话 |
| 真实 IP | 直连只信 socket 地址（请求头可伪造）；只有前面挂反代时才读 `X-Forwarded-For` |
| 密码存储 | scrypt + 每账号独立 salt |
| 会话 | 7 天滑动过期 + 每小时清理 |
| 响应头 | CSP / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy |
| 请求体 | 上限 2MB，超限拒绝 |
| 路径穿越 | 静态目录校验带分隔符，同级目录绕不过去 |

### 性能

| 项 | 说明 |
|---|---|
| 存档内存化 | 读写全走内存，每 2 秒批量落盘。851 份存档下 P50 3ms |
| 静态资源 | gzip + 内容哈希版本号 + 强缓存，首屏 282KB → 79KB |
| 密码哈希 | 异步 scrypt，不再阻塞事件循环（原来单次 63ms） |
| 删除文件 | 先 rename 进 `_trash` 再后台异步清，不阻塞主线程 |
| 日志 | 容器日志 10MB × 3 轮转，常年跑不会写满磁盘 |
| 健康检查 | 每 30 秒探一次 `/api/health`，挂了自动重启 |

### 还有一件事建议做

**开 HTTPS**。现在是明文 HTTP，密码和 token 在网络上裸奔，
上面这些防爆破措施对「半路抓包」没用。用第七节的 Cloudflare Tunnel
（自带 HTTPS）或 Nginx + Let's Encrypt，这是性价比最高的一步。

---

## 九、常见问题

**Q：容器起来了但浏览器打不开？**
先 `./deploy.sh --status` 看是不是 `healthy`。再看 `--logs`。
如果 Mac mini 上能开、别的机器不能，检查 macOS 防火墙是否放行了 8123。

**Q：端口 8123 被占用？**
```bash
lsof -nP -iTCP:8123 -sTCP:LISTEN
```
`deploy.sh` 启动前也会提示。

**Q：想换端口？**
改 `docker-compose.yml` 里的 `ports: "8123:8123"` 前一个数字，比如 `"9000:8123"`，
然后 `./deploy.sh --restart`。容器内部端口不要改。

**Q：改完代码怎么生效？**
把新文件覆盖进来，执行 `./deploy.sh`（会自动重建镜像）。
前端资源版本号是按文件内容哈希算的，玩家刷新页面就会拿到新版，不用清缓存。

**Q：日志里报 `EACCES: permission denied, open '/app/store/...'`？**

容器里以 `node`（uid 1000）运行，而 macOS 的 bind mount 属主是你（uid 501），对不上就写不了。
`deploy.sh` 每次启动前会执行 `chmod 777 store store/saves store/_trash`，正常情况下不会遇到。

如果手动改过 compose 或用 `docker compose up` 绕过脚本，补一下：

```bash
chmod 777 store store/saves store/_trash
docker compose restart
```

服务启动时会自检数据目录：写不进去会直接打印
`❌ 数据目录不可写：/app/store` 并退出码 1，不会静默死掉。

**Q：`cannot stop container: tried to kill container, but did not receive an exit event`？**

容器里的进程卡在**不可中断的系统调用**里，连 SIGKILL 都杀不掉。典型表现是三件事同时出现：
容器状态 `Up`、服务不响应、`docker compose down` 卡 30 多秒后报这个错。

按顺序试：

```bash
docker rm -f jianghan-br          # 强制删

# 还删不掉，就重启 Docker 引擎（任选其一）：
# 菜单栏 OrbStack 图标 → Quit，再重新打开
osascript -e 'quit app "OrbStack"' ; sleep 3 ; open -a OrbStack
# 实在不行重启 Mac mini
```

**原因**：旧版入口脚本里有 `chown -R`，在 virtiofs（macOS 的 bind mount）上递归改属主会卡死。
新版本已改成非递归，只改三个目录本身，不会再有这个问题。

**Q：`./deploy.sh` 卡在「等待服务就绪」不动？**

新版本会在 60 秒后自动打印容器状态和最近 40 行日志，直接照着日志看原因。
最常见的还是上面的权限问题。也可以手动看：

```bash
docker compose ps
docker compose logs --tail=40
```

**Q：数据会丢吗？**
只要 `./store` 目录还在就不会。容器删了、镜像删了都不影响。
