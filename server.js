// 江汉BR —— 零依赖 Node 服务器
// 启动： node server.js  →  http://127.0.0.1:8123
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const G = require('./game');
const W = require('./world');
const TRADE = require('./trade');
const DISK = require('./storage-queue');
let shuttingDown = false;
const MAPD = require('./data/map');
const ITEMD = require('./data/items');
const { RECIPES } = require('./data/recipes');
const { ACHIEVEMENTS, CAT_ORDER: ACH_CATS } = require('./data/achievements');
const SHOP = require('./data/shop');
const NPCD = require('./data/npcs');
const { FINAL_BOSS } = require('./data/boss');
const { STATUS } = require('./data/status');
const { SEVEN_WA, LIUYING } = require('./data/special');

const PORT = process.env.PORT || 8123;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const STORE = path.join(ROOT, 'store');
const USERS_FILE = path.join(STORE, 'users.json');
const ADMIN_FILE = path.join(STORE, 'admin.json');
const SAVE_DIR = path.join(STORE, 'saves');
// 回收站：删存档不直接 unlink。本机实测 unlink 单文件 587ms（Defender 行为扫描），
// 而 rename 只要 1ms。先挪进来，重启不会加载（不在 SAVE_DIR 里），再后台异步清。
const TRASH_DIR = path.join(STORE, '_trash');

// 启动进度日志：直接进容器日志，排查「起来了但没监听」这类问题全靠它。
// 必须用 fs.writeSync 直接写 fd 1：console.log 走的是带缓冲的流，
// 进程一旦在后面卡住，缓冲区里的内容可能永远不落盘 —— 表现就是「一条日志都没有」。
const bootLog = m => {
  try { fs.writeSync(1, '[boot] ' + m + '\n'); }
  catch (e) { try { console.log('[boot] ' + m); } catch (e2) { /* ignore */ } }
};
bootLog(`Node ${process.version} · 端口 ${process.env.PORT || 8123} · 主机 ${process.env.HOST || '127.0.0.1'} · 目录 ${STORE}`);

// 启动自检：数据目录必须可写。
// 容器里常见坑是挂载进来的 store 属主对不上（宿主 501 vs 容器 1000），
// 以前会在写 admin.json 时抛异常、容器静默退出，日志里只有一个看不懂的退出码。
// 这里主动探测并打印人话，退出码用 1（255 会被误认为是镜像/exec 问题）。
(function checkStore() {
  const probe = path.join(STORE, '.write-test');
  try {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    fs.mkdirSync(TRASH_DIR, { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    bootLog('数据目录可写');
  } catch (e) {
    console.error('==============================================');
    console.error('❌ 数据目录不可写：' + STORE);
    console.error('   ' + e.code + ' ' + e.message);
    console.error('');
    console.error('   容器里请确认 ./store 已挂载且可写。宿主机执行：');
    console.error('   chmod 777 store store/saves store/_trash');
    console.error('   然后重启：docker compose restart');
    console.error('==============================================');
    process.exit(1);
  }
})();

// ---------- 运行日志（内存环形缓冲） ----------
// 后台「日志」页读这里。只放内存，不落盘 —— 重启就清空，避免把日志文件也变成性能负担。
const LOG_MAX = 1000;
const LOG_BUF = [];
let logSeq = 1;

function rlog(level, tag, text, extra) {
  const m = {
    id: logSeq++,
    at: Date.now(),
    level: level || 'info',   // info | warn | error | sys
    tag: tag || '系统',
    text: String(text == null ? '' : text).slice(0, 600),
  };
  if (extra) m.extra = String(extra).slice(0, 1500);
  LOG_BUF.push(m);
  if (LOG_BUF.length > LOG_MAX) LOG_BUF.splice(0, LOG_BUF.length - LOG_MAX);
  return m;
}
function getLogs(since, level) {
  let out = LOG_BUF;
  if (since) out = out.filter(m => m.id > since);
  if (level && level !== 'all') out = out.filter(m => m.level === level);
  return out.slice(-400);
}

// 内存采样：每 5 秒记一条，后台画趋势用
const MEM_MAX = 120;
const MEM_BUF = [];
function sampleMem() {
  try {
    const m = process.memoryUsage();
    const r = W.round();
    let saves = 0;
    try { saves = listSavesCached().length; } catch (e) { /* ignore */ }
    MEM_BUF.push({
      at: Date.now(),
      heap: Math.round(m.heapUsed / 1048576 * 10) / 10,
      rss: Math.round(m.rss / 1048576 * 10) / 10,
      external: Math.round(m.external / 1048576 * 10) / 10,
      saves,
      chat: (W.get().chat || []).length,
      logs: LOG_BUF.length,
      online: W.online(),
      uptime: Math.round(process.uptime()),
      round: r.id,
      state: r.state,
    });
    if (MEM_BUF.length > MEM_MAX) MEM_BUF.shift();
  } catch (e) { /* ignore */ }
}

// 未捕获的异常 / Promise 拒绝：以前是直接打到 stdout，后台看不到
process.on('uncaughtException', e => {
  rlog('error', '异常', (e && e.message) || String(e), e && e.stack);
  console.error('[uncaught]', e);
});
process.on('unhandledRejection', e => {
  rlog('error', '未处理的 Promise', (e && e.message) || String(e), e && e.stack);
  console.error('[unhandledRejection]', e);
});

// ---------- 存储 ----------
function readJSON(f, fb) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; }
}
function writeJSON(f, obj) { return DISK.enqueue(f, obj); }

// ---------- 存储：内存优先（2026-10-20） ----------
// 以前每个 action 都要 readdir + 读全部存档（282 个 ≈ 38ms），
// Node 单线程被同步 IO 堵死，30 人并发 P50 能到 12 秒。
// 现在启动时全量载入内存，运行期读写都走 Map，磁盘只做「每 2 秒批量落盘」。
const SAVES = new Map();      // user -> saveObj
let USERS_DB = null;          // users.json 的内存副本
const DIRTY = new Set();      // 待落盘的 user
let usersDirty = false;
let usersVersion = 0;
let storageEpoch = 0;
let storageFlush = null;
const SAVE_VERSIONS = new Map();
let storageReady = false;

function loadAllStorage() {
  SAVES.clear();
  let files = [];
  try { files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.json')); } catch (e) { files = []; }
  let skipped = 0;
  for (const f of files) {
    const s = readJSON(path.join(SAVE_DIR, f), null);
    if (s && s.user) SAVES.set(s.user, s);
    else skipped++;
  }
  USERS_DB = readJSON(USERS_FILE, { users: {} });
  if (!USERS_DB.users) USERS_DB.users = {};
  storageReady = true;
  if (skipped) rlog('warn', '存储', `${skipped} 个存档缺少 user 字段，已跳过`);
  return { saves: SAVES.size, users: Object.keys(USERS_DB.users).length };
}

// 批量落盘：只写脏的，没改过就零 IO
async function flushStorage() {
  if (!storageReady) return { saves: 0, users: false };
  if (storageFlush) return storageFlush;
  storageFlush = (async () => {
    const batch = [];
    for (const u of DIRTY) {
      const s = SAVES.get(u);
      if (!s) continue;
      const file = savePath(u);
      batch.push({ u, file, version: SAVE_VERSIONS.get(u) || 0, rev: DISK.enqueue(file, s) });
    }
    const uv = usersVersion;
    const ur = usersDirty && USERS_DB ? DISK.enqueue(USERS_FILE, USERS_DB) : 0;
    let error;
    try { await DISK.flush(); } catch (e) { error = e; }
    let n = 0;
    for (const b of batch) {
      if (DISK.hasPersisted(b.file, b.rev) && (SAVE_VERSIONS.get(b.u) || 0) === b.version) {
        DIRTY.delete(b.u); n++;
      }
    }
    const ud = !!ur && usersVersion === uv && DISK.hasPersisted(USERS_FILE, ur);
    if (ud) usersDirty = false;
    if (error) { rlog('error', '落盘', error.code || error.message); throw error; }
    return { saves: n, users: ud };
  })();
  try { return await storageFlush; } finally { storageFlush = null; }
}

function loadUsers() {
  if (!storageReady) return readJSON(USERS_FILE, { users: {} });
  if (!USERS_DB) USERS_DB = readJSON(USERS_FILE, { users: {} });
  if (!USERS_DB.users) USERS_DB.users = {};
  return USERS_DB;
}
function saveUsers(db) {
  if (!storageReady) { writeJSON(USERS_FILE, db); return; }
  USERS_DB = db;
  usersDirty = true;
  usersVersion++;
  storageEpoch++;
}

function savePath(user) {
  const safe = crypto.createHash('md5').update(user).digest('hex').slice(0, 16);
  return path.join(SAVE_DIR, safe + '.json');
}
// 玩家遭遇结算：把结果写回被打的那个人
function applyPvp(attacker, res) {
  const ts = loadSave(res.user);
  if (!ts || !ts.char) return;
  const t = G.migrateChar(ts.char);
  const zone = (MAPD.BY_ID[attacker.pos] || {}).name || '油田';
  const push = (c, text, kind) => {
    c.log = c.log || [];
    c.log.push({ t: Date.now(), text, kind });
    if (c.log.length > 120) c.log = c.log.slice(-120);
  };
  if (res.win) {
    const dmg = Math.max(6, Math.min(60, Math.round(t.hp * 0.3)));
    const gold = Math.max(0, Math.min(t.gold || 0, Math.round((t.gold || 0) * 0.2)));
    t.hp = Math.max(0, t.hp - dmg);
    t.gold = Math.max(0, (t.gold || 0) - gold);
    attacker.gold = (attacker.gold || 0) + gold;
    push(t, `${attacker.name} 在${zone}对你动手，你损失 ${dmg} 点生命${gold ? `、¥${gold}` : ''}。`, 'bad');
    if (t.hp <= 0) {
      t.alive = false;
      t.scene = 'dead';
      t.pending = { reason: 'hp' };
      W.pushChat({ ch: 'public', from: '系统', text: `${attacker.name} 在${zone}放倒了 ${t.name}。`, kind: 'death' });
    } else {
      W.pushChat({ ch: 'public', from: '系统', text: `${attacker.name} 在${zone}袭击了 ${t.name}。`, kind: 'sys' });
    }
  } else {
    push(t, `${attacker.name} 在${zone}撞见你，转身跑了。`, 'warn');
  }
  writeSave(res.user, ts);
}

// 内存化之后 listSaves 只是遍历 Map（282 个对象 ≈ 0.02ms），
// 不用再加 1.5 秒缓存，也不用为「同区块玩家」单独建索引 —— 遍历就够快
function listSavesCached() { return listSaves(); }

function loadSave(user) {
  if (!storageReady) return readJSON(savePath(user), null);
  return SAVES.get(user) || null;
}
function writeSave(user, data) {
  if (!storageReady) { writeJSON(savePath(user), data); return; }
  if (data && !data.user) data.user = user;
  SAVES.set(user, data);
  storageEpoch++;
  SAVE_VERSIONS.set(user, (SAVE_VERSIONS.get(user) || 0) + 1);
  DIRTY.add(user);
}
// 删存档必须走这里：只删文件的话内存里还留着，玩家会「死而复生」
// 注意：本机 unlink 一个文件要 ~590ms，rename 只要 ~1ms。
// 所以统一「先 rename 进 _trash，再由 sweepTrash 后台异步清」，绝不阻塞事件循环。
let trashSeq = 0;
function deleteSave(user) {
  if (!user) return;
  SAVES.delete(user);
  DIRTY.delete(user);
  storageEpoch++;
  SAVE_VERSIONS.set(user, (SAVE_VERSIONS.get(user) || 0) + 1);
  DISK.remove(savePath(user));
}

// 后台清回收站：全程异步，不占主线程
// 实测：整目录 rm 最快，但会一口气占满线程池，HTTP 请求要排队 5 秒。
// 所以自己分批：每批 20 个，批间让出事件循环，服务全程可响应。
const TRASH_BATCH = 20;
const yieldLoop = () => new Promise(r => setTimeout(r, 0));

let trashBusy = false;
async function sweepTrash() {
  if (trashBusy) return;
  trashBusy = true;
  let done = 0;
  try {
    const items = await fs.promises.readdir(TRASH_DIR).catch(() => []);
    for (const it of items) {
      const p = path.join(TRASH_DIR, it);
      let st = null;
      try { st = await fs.promises.stat(p); } catch (e) { continue; }

      if (st.isFile()) {
        try { await fs.promises.unlink(p); done++; } catch (e) { rlog('warn', '回收站', `删 ${it} 失败：${e.code || e.message}`); }
        await yieldLoop();
        continue;
      }

      let names = [];
      try { names = await fs.promises.readdir(p); } catch (e) { names = []; }
      for (let i = 0; i < names.length; i += TRASH_BATCH) {
        const batch = names.slice(i, i + TRASH_BATCH);
        await Promise.all(batch.map(n => fs.promises.unlink(path.join(p, n)).catch(() => { })));
        done += batch.length;
        await yieldLoop();      // 让 HTTP 请求插进来
      }
      try { await fs.promises.rmdir(p); }
      catch (e) { rlog('warn', '回收站', `目录 ${it} 还没删干净，下一轮再试`); }
      await yieldLoop();
    }
    if (done) rlog('sys', '回收站', `清掉 ${done} 个文件`);
  } catch (e) {
    rlog('error', '回收站', `扫描失败：${e.message}`);
  }
  finally { trashBusy = false; }
}

function listSaves() {
  const out = [];
  if (!storageReady) {
    let files = [];
    try { files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.json')); } catch (e) { return out; }
    for (const f of files) {
      const s = readJSON(path.join(SAVE_DIR, f), null);
      if (s && s.char) out.push(s);
    }
    return out;
  }
  for (const s of SAVES.values()) if (s && s.char) out.push(s);
  return out;
}

// ---------- 管理员 ----------
// 首次启动生成随机密码，不再用 'jianghan' 这种默认值 ——
// 挂公网的服务如果保留默认密码，等于没有密码。
function loadAdmin() {
  let a = readJSON(ADMIN_FILE, null);
  if (!a || !a.password) {
    const pwd = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
    a = { password: pwd, createdAt: Date.now() };
    writeJSON(ADMIN_FILE, a);
    console.log('==============================================');
    console.log('  已生成管理员密码：' + pwd);
    console.log('  存在 store/admin.json，也可以用下面命令看：');
    console.log('  cat store/admin.json');
    console.log('==============================================');
  }
  // 老存档 / 迁移过来的 store 里可能还留着弱密码，启动时提醒一次
  if (String(a.password).length < 10) {
    console.log('⚠ 管理员密码不足 10 位，挂公网前请在后台改成强密码');
  }
  return a;
}
bootLog('初始化管理员配置…');
const ADMIN = loadAdmin();
bootLog('管理员配置就绪');
const adminTokens = new Map();
const ADMIN_TTL = 12 * 3600 * 1000;   // 管理员 token 12 小时过期

// ---------- 密码 ----------
// 用异步版 scrypt：同步版单次要 63ms，登录时整个事件循环停摆，
// 开局 30 个人同时登录就是 1.9 秒全服卡顿。异步版跑在线程池，不占主线程。
function hashPwd(pwd, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pwd), String(salt), 32, (err, key) => {
      if (err) reject(err); else resolve(key.toString('hex'));
    });
  });
}

// ---------- 会话 ----------
// token 不能永久有效：老版本只进不出，跑久了是内存泄漏 + 长期凭证风险
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const SESSION_FILE = path.join(STORE, 'sessions.json');
const sessions = new Map();     // token -> user
const sessionAt = new Map();    // token -> 最后使用时间
function newToken() { return crypto.randomBytes(24).toString('hex'); }

// 会话落盘：以前只在内存里，每次部署/重启全员掉线。
// 现在写进 store/sessions.json，重启后按过期时间恢复。
// 滑动续期（每个请求都会更新 at）不逐次写盘，60 秒最多写一次。
let sessTimer = null;
function persistSessions() {
  const obj = {};
  for (const [t, u] of sessions) obj[t] = { u, at: sessionAt.get(t) || 0 };
  try { writeJSON(SESSION_FILE, obj); } catch (e) { /* 落盘失败不影响在线 */ }
}
function markSessions() {
  if (sessTimer) return;
  sessTimer = setTimeout(() => { sessTimer = null; persistSessions(); }, 60000);
  if (sessTimer.unref) sessTimer.unref();
}
function setSession(t, user) { sessions.set(t, user); sessionAt.set(t, Date.now()); persistSessions(); }
function dropSession(t) { sessions.delete(t); sessionAt.delete(t); persistSessions(); }

// 启动时恢复未过期的会话
(function loadSessions() {
  const obj = readJSON(SESSION_FILE, null);
  if (!obj || typeof obj !== 'object') return;
  const now = Date.now();
  let n = 0;
  for (const [t, v] of Object.entries(obj)) {
    if (!v || typeof v.u !== 'string') continue;
    if (now - (v.at || 0) > SESSION_TTL) continue;
    sessions.set(t, v.u);
    sessionAt.set(t, v.at || now);
    n++;
  }
  if (n) bootLog(`恢复 ${n} 个会话（重启不掉线）`);
})();

function bearer(req) {
  return (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
}
function authUser(req) {
  const t = bearer(req);
  const u = sessions.get(t);
  if (!u) return null;
  const at = sessionAt.get(t) || 0;
  if (Date.now() - at > SESSION_TTL) { dropSession(t); return null; }
  sessionAt.set(t, Date.now());     // 滑动续期：一直在玩就不会掉线
  markSessions();                    // 续期不逐次写盘，最多每分钟一次
  return u;
}
function authAdmin(req) {
  const t = bearer(req);
  const at = adminTokens.get(t);
  if (at != null) {
    if (Date.now() - at > ADMIN_TTL) { adminTokens.delete(t); return false; }
    return true;
  }
  // 以前这里允许 "Bearer admin:<明文密码>" 直通。
  // 那等于给爆破留了个后门：攻击者可以对任意 /api/admin/* 反复试密码，
  // 完全不经过登录限流。现在只认登录签发的临时 token。
  return false;
}

// ---------- 输入净化 ----------
// 直接把尖括号干掉：HTML 标签构造不出来，XSS 就无从谈起。
// 客户端虽然有 esc()，但存储层也不该留脏数据 —— 后台页面、CSV 导出都会碰到这些字符串。
// 注意别改成「转义成 &lt;」：前端 esc() 会再转一次，玩家看到的就是 &lt; 这种乱码。
function sanitize(s, max = 200) {
  return String(s == null ? '' : s)
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

// ---------- 聊天冷却 ----------
// 没有冷却的话，一个脚本就能把公屏刷爆，所有人的聊天面板都别想看了。
// GM 不受限（自己人，而且 GM 命令本身也是走这个接口）。
const CHAT_CD = 2000;             // 两条消息最短间隔
const chatLast = new Map();       // user -> 上次发言时间

// ---------- 登录限流（要挂公网，必须防暴力破解）----------
// 两层：① 同 IP+账号，防盯着一个号猜密码
//       ② 同 IP 总次数，防换着用户名扫（撞库最常见的姿势）
const LOGIN_MAX = 8;              // 同一账号 10 分钟内错 8 次
const IP_MAX = 50;                // 同一 IP 10 分钟内错 50 次
const LOGIN_WINDOW = 10 * 60000;
const LOGIN_LOCK = 60000;         // 账号锁 1 分钟
const IP_LOCK = 5 * 60000;        // IP 锁 5 分钟
const loginGuard = new Map();     // key -> { n, first, lockUntil }

// 真实客户端 IP。
// 直接对外时只信 socket 地址 —— 请求头谁都能伪造，信了等于给爆破开后门。
// 只有「对端是本机/内网」（说明前面挂了 Nginx / cloudflared）才读代理头，
// 否则反代后面所有请求都变成 127.0.0.1，一个人爆破就能把全服锁死。
function isLocalPeer(ip) {
  const s = String(ip || '');
  const v = s.replace(/^::ffff:/, '');
  return v === '127.0.0.1' || v === '::1'
    || /^10\./.test(v) || /^192\.168\./.test(v) || /^172\.(1[6-9]|2\d|3[01])\./.test(v);
}
function clientIp(req) {
  const peer = (req.socket && req.socket.remoteAddress) || '?';
  if (!isLocalPeer(peer)) return peer;
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim().slice(0, 45);
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const parts = String(xff).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 45);   // 最右是代理追加的
  }
  const xr = req.headers['x-real-ip'];
  if (xr) return String(xr).trim().slice(0, 45);
  return peer;
}

function guardKey(req, user) { return clientIp(req) + '|' + String(user || '').slice(0, 32); }
function ipKey(req) { return 'ip|' + clientIp(req); }

function guardBlocked(key) {
  const g = loginGuard.get(key);
  if (!g || !g.lockUntil) return 0;
  const left = g.lockUntil - Date.now();
  if (left <= 0) { loginGuard.delete(key); return 0; }
  return Math.ceil(left / 1000);
}
function guardFail(key, max = LOGIN_MAX, lockMs = LOGIN_LOCK) {
  const now = Date.now();
  let g = loginGuard.get(key);
  if (!g || now - g.first > LOGIN_WINDOW) g = { n: 0, first: now, lockUntil: 0 };
  g.n++;
  if (g.n >= max) { g.lockUntil = now + lockMs; g.n = 0; g.first = now; }
  loginGuard.set(key, g);
}
function guardOk(key) { loginGuard.delete(key); }

// 一次失败的完整记账：账号级 + IP 级
function noteAuthFail(req, user) {
  guardFail(guardKey(req, user));
  guardFail(ipKey(req), IP_MAX, IP_LOCK);
}
// 返回还要等多少秒（0 = 放行）
function authWait(req, user) {
  return guardBlocked(guardKey(req, user)) || guardBlocked(ipKey(req));
}

// ---------- 响应 ----------
function acceptsGzip(req) {
  return !!req && /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
}

// 安全响应头：挂公网的基础防护
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',        // 别猜 MIME，防把 .js 当 html 执行
  'X-Frame-Options': 'DENY',                  // 不许被 iframe 套（防点击劫持）
  'Referrer-Policy': 'no-referrer',           // 不把地址栏泄露给第三方
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};
// CSP：只允许本站资源。页面里有内联 script/style，所以放行 'unsafe-inline'，
// 但外部脚本源被完全挡掉 —— 注入一个 <script src="//evil"> 是加载不了的。
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; "
  + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
  + "font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
  + "frame-ancestors 'none'";

// JSON 响应：>1KB 且客户端支持才压。小响应压完反而更大，别压。
function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const h = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  }, SEC_HEADERS);
  if (body.length > 1024 && acceptsGzip(res.req)) {
    h['Content-Encoding'] = 'gzip';
    h['Vary'] = 'Accept-Encoding';
    res.writeHead(code, h);
    return res.end(zlib.gzipSync(body, { level: 4 }));
  }
  h['Content-Length'] = body.length;
  res.writeHead(code, h);
  res.end(body);
}

function readBody(req, limit = 2e6) {
  return new Promise((resolve) => {
    let d = '', over = false, done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    req.on('data', c => {
      if (over) return;
      d += c;
      // 超限：老版本只 destroy 不 resolve，这个 Promise 永远挂着，
      // 请求处理器就悬在半空。必须 resolve 掉，让它走正常的 400 分支。
      if (d.length > limit) { over = true; d = ''; finish({}); }
    });
    req.on('end', () => {
      if (over) return;
      try { finish(JSON.parse(d || '{}')); } catch (e) { finish({}); }
    });
    req.on('error', () => finish({}));
    req.on('aborted', () => finish({}));
  });
}

// ---------- 静态资源：内容哈希版本号 + gzip + 强缓存 ----------
// 三个目标同时满足：
//   ① 首屏压缩（282KB → ~70KB）
//   ② 第二次打开 0 字节（版本号对得上就 immutable 缓存一年）
//   ③ 永远拿不到旧版本（版本号 = 文件内容哈希，内容一变 URL 就变；HTML 每次回源）
// 不需要手动改 index.html 里的 ?v=，服务端实时注入。
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const ASSETS = new Map();                 // name -> { key, ver, raw, gz, type }
const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.svg']);

function assetMeta(name) {
  const hit = ASSETS.get(name);
  if (hit) return hit; // 不可变容器镜像：运行期直接用内存缓存
  const file = path.join(PUBLIC, name);
  let st;
  try { st = fs.statSync(file); } catch (e) { return null; }
  const key = st.size + ':' + st.mtimeMs;
  const raw = fs.readFileSync(file);
  const ext = path.extname(name).toLowerCase();
  const meta = {
    key,
    ver: crypto.createHash('md5').update(raw).digest('hex').slice(0, 8),
    raw,
    type: MIME[ext] || 'application/octet-stream',
    gz: TEXT_EXT.has(ext) ? zlib.gzipSync(raw, { level: 6 }) : null,
  };
  ASSETS.set(name, meta);
  return meta;
}

// 把 HTML 里 src/href 的 ?v= 换成当前文件内容哈希
const ASSET_REF = /(\b(?:src|href)=")([^"?#]+\.(?:js|css))(?:\?[^"]*)?(")/gi;
function injectVersion(html) {
  return html.replace(ASSET_REF, (all, pre, url, post) => {
    const m = assetMeta(url.replace(/^.*\//, ''));
    return pre + url + '?v=' + (m ? m.ver : '0') + post;
  });
}

// 注入后的 index.html 缓存：key = 各资源版本拼接，任一文件变 key 就变
let HTML_CACHE = { key: '', raw: null, gz: null, etag: '' };
function htmlBody() {
  const idx = assetMeta('index.html');
  if (!idx) return null;
  const key = idx.ver + '|' + ['app.js', 'style.css', 'pixel.js']
    .map(n => { const m = assetMeta(n); return m ? m.ver : '0'; }).join(',');
  if (HTML_CACHE.key === key) return HTML_CACHE;
  const raw = Buffer.from(injectVersion(idx.raw.toString('utf8')), 'utf8');
  HTML_CACHE = {
    key, raw,
    gz: zlib.gzipSync(raw, { level: 6 }),
    etag: '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 16) + '"',
  };
  return HTML_CACHE;
}

function serveStatic(req, res, urlPath) {
  let p = urlPath.split('?')[0];
  if (p === '/' || p === '') p = '/index.html';
  const name = path.normalize(p).replace(/^([/\\])+/, '');
  const file = path.join(PUBLIC, name);
  // 必须带分隔符再比：只比 PUBLIC 的话，同级的 publicXxx 目录也会通过
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('forbidden'); }

  const isHtml = /\.html$/i.test(name);
  const gzOk = acceptsGzip(req);

  // ---- index.html：每次回源，但没改就只回 304 ----
  if (name === 'index.html') {
    const h = htmlBody();
    if (!h) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    const head = Object.assign({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate',
      'ETag': h.etag,
      'Vary': 'Accept-Encoding',
      'Content-Security-Policy': CSP,
    }, SEC_HEADERS);
    if ((req.headers['if-none-match'] || '') === h.etag) { res.writeHead(304, head); return res.end(); }
    const body = gzOk ? h.gz : h.raw;
    if (gzOk) head['Content-Encoding'] = 'gzip';
    head['Content-Length'] = body.length;
    res.writeHead(200, head);
    return res.end(body);
  }

  const meta = assetMeta(name);
  if (!meta) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }

  // ---- 其它资源：?v= 等于当前内容哈希 → 这份内容永远不会变，缓存一年 ----
  const v = new URLSearchParams(urlPath.split('?')[1] || '').get('v');
  const fresh = !isHtml && !!v && v === meta.ver;
  const etag = '"' + meta.ver + '"';
  const head = Object.assign({
    'Content-Type': meta.type,
    'Cache-Control': fresh ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
    'ETag': etag,
    'Vary': 'Accept-Encoding',
  }, SEC_HEADERS);
  if (isHtml) head['Content-Security-Policy'] = CSP;   // admin.html 走这条
  if (!fresh && (req.headers['if-none-match'] || '') === etag) { res.writeHead(304, head); return res.end(); }
  const body = (gzOk && meta.gz) ? meta.gz : meta.raw;
  if (gzOk && meta.gz) head['Content-Encoding'] = 'gzip';
  head['Content-Length'] = body.length;
  res.writeHead(200, head);
  res.end(body);
}

// ---------- 元数据 ----------
const META = {
  map: MAPD.MAP,
  regions: MAPD.REGIONS,
  spawn: MAPD.SPAWN_ID,
  items: ITEMD.ITEMS,
  recipes: RECIPES,
  attrNames: G.ATTR_CN,
  slotNames: G.SLOT_CN,
  baseSlots: G.BASE_SLOTS,
  achievements: ACHIEVEMENTS.map(a => ({ id: a.id, title: a.title, icon: a.icon, tier: a.tier, cat: a.cat, desc: a.desc, hint: a.hint })),
  achCats: ACH_CATS,
  moods: G.MOODS,
  market: {
    name: NPCD.BLACK_MARKET.name,
    markup: NPCD.BLACK_MARKET.markup,
    goods: NPCD.marketGoods(),
    greet: NPCD.BLACK_MARKET.greet,
    talks: NPCD.BLACK_MARKET.talks,
  },
  merc: {
    name: NPCD.MERC_CAMP.name,
    title: NPCD.MERC_CAMP.title,
    zone: NPCD.MERC_CAMP.zone,
    hire: NPCD.HIRE_TIERS,
    greet: NPCD.MERC_CAMP.greet,
    talks: NPCD.MERC_CAMP.talks,
  },
  attrTips: G.ATTR_TIPS,
  maxPlus: G.MAX_PLUS,
  fireModes: G.FIRE_MODES,
  merchants: SHOP.MERCHANTS,
  goods: SHOP.GOODS,
  bossZone: FINAL_BOSS.zone,
  bossName: FINAL_BOSS.name,
  status: STATUS,
  special: {
    sevenWa: { name: SEVEN_WA.name, age: SEVEN_WA.age, title: SEVEN_WA.title, desc: SEVEN_WA.desc, lines: SEVEN_WA.lines, ask: SEVEN_WA.ask, chance: SEVEN_WA.chance },
    liuying: { name: LIUYING.name, title: LIUYING.title, desc: LIUYING.desc, intro: LIUYING.intro, ask: LIUYING.ask, quizIntro: LIUYING.quizIntro },
  },
};

// META 是常量（50KB）：序列化 + 压缩各做一次，别每次登录都重算。
// isGM 只有两种取值，所以缓存两份就够了。
const META_CACHE = new Map();
function sendMeta(res, isGM) {
  const k = isGM ? '1' : '0';
  let c = META_CACHE.get(k);
  if (!c) {
    const body = Buffer.from(JSON.stringify({ ok: true, meta: META, isGM }), 'utf8');
    c = { body, gz: zlib.gzipSync(body, { level: 6 }) };
    META_CACHE.set(k, c);
  }
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Vary': 'Accept-Encoding',
  };
  if (acceptsGzip(res.req)) {
    h['Content-Encoding'] = 'gzip';
    h['Content-Length'] = c.gz.length;
    res.writeHead(200, h);
    return res.end(c.gz);
  }
  h['Content-Length'] = c.body.length;
  res.writeHead(200, h);
  res.end(c.body);
}

// ---------- CSV ----------
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return '\ufeff' + lines.join('\r\n');   // BOM，Excel 才不会乱码
}

function charRow(user, c) {
  const w = c.equip && c.equip.weapon ? ITEMD.ITEMS[c.equip.weapon.id] : null;
  const bagTxt = (c.bag || []).map(i => {
    const d = ITEMD.ITEMS[i.id];
    return (d ? d.name : i.id) + 'x' + i.n;
  }).join('; ');
  const titleNames = Object.keys(c.achievements || {}).map(id => {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    return a ? a.title : id;
  }).join('/');
  const a = c.attrs || {};
  const st = c.status && c.status.type !== 'normal' ? (STATUS[c.status.type] || {}).name || c.status.type : '正常';
  return [
    user,
    c.name,
    c.roundId,
    (MAPD.BY_ID[c.pos] || {}).name || c.pos,
    c.alive && c.scene !== 'dead' ? '存活' : '出局',
    c.turn,
    (c.stats && c.stats.kills) || 0,
    c.gold || 0,
    Math.round(c.hp), G.hpMax(c),
    Math.round(c.ep), G.epMax(c),
    a.sta, a.str, a.cha, a.int, a.luk,
    st,
    c.invincible ? '是' : '否',
    w ? w.name : '空手',
    w && c.equip.weapon.dur != null ? `${c.equip.weapon.dur}/${w.maxDur}` : '',
    Object.keys(c.achievements || {}).length,
    titleNames,
    (c.hostages || []).length,
    (c.stats && c.stats.songs) || 0,
    bagTxt,
  ];
}

const CSV_HEADERS = [
  '账号', '角色名', '轮次', '所在区块', '状态', '回合', '击杀', '金币',
  '生命', '生命上限', '精力', '精力上限',
  '体力', '武力', '魅力', '智力', '幸运',
  '异常状态', '无敌', '武器', '武器耐久', '称号数', '称号', '随行人数', '唱歌次数', '背包',
];

// ---------- 轮次辅助 ----------
function roundInfo() {
  const r = W.round();
  const sp = W.get().supply;
  return {
    id: r.id, state: r.state, startedAt: r.startedAt,
    endsAt: r.endsAt, hardEndsAt: r.hardEndsAt,
    extended: r.extended, winner: r.winner, endReason: r.endReason, bossKilled: r.bossKilled,
    bossSpawned: !!r.bossSpawned,
    endedAt: r.endedAt || null,
    nextStartAt: r.nextStartAt || null,
    autoStart: !!W.settings().autoStart,
    restartDelayMs: W.RESTART_MS,
    warned5: !!r.warned5,
    // 空投：后台要看得到箱子在哪、还剩多久、下次什么时候
    supply: sp ? {
      zone: sp.zone,
      zoneName: (MAPD.BY_ID[sp.zone] || {}).name || sp.zone,
      leftMs: Math.max(0, sp.until - Date.now()),
      epic: !!sp.epic,
    } : null,
    nextSupplyInMs: Math.max(0, (W.get().nextSupplyAt || 0) - Date.now()),
    now: Date.now(),
  };
}

// 轮次结束时结算
W.onEnd((round, reason) => {
  const saves = listSaves().filter(s => s.char && s.char.roundId === round.id);
  const ranked = saves.map(s => {
    const sc = G.scoreOf(s.char);
    return {
      username: s.user,
      name: s.char.name,
      kills: s.char.stats ? s.char.stats.kills : s.char.kills,
      turn: s.char.turn,
      alive: s.char.alive,
      boss: !!(s.char.stats && s.char.stats.bossKills),
      gold: s.char.gold || 0,
      titles: Object.keys(s.char.achievements || {}).length,
      score: sc.total,
    };
  }).sort((a, b) => (b.score - a.score) || (b.kills - a.kills) || (b.turn - a.turn));

  rlog('sys', '轮次', `第 ${round.id} 轮结束（${reason}）· ${ranked.length} 人参与 · 冠军 ${ranked[0] ? ranked[0].name + ' ' + ranked[0].score + '分' : '无'}`);
  W.pushHistory({
    roundId: round.id,
    endedAt: Date.now(),
    reason,
    winner: round.winner ? round.winner.username : (ranked[0] ? ranked[0].username : null),
    top: ranked.slice(0, 10),
  });
});

// ---------- 玩家辅助 ----------
function getChar(user) {
  const s = loadSave(user);
  if (!s || !s.char) return null;
  return G.migrateChar(s.char);
}

function saveChar(user, char) {
  const s = loadSave(user) || { user };
  s.char = char;
  s.updatedAt = Date.now();
  writeSave(user, s);
}

// 物品名查找（GM 用）：支持中文名、英文 id、模糊包含
function findItemByName(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  if (ITEMD.ITEMS[q]) return ITEMD.ITEMS[q];
  const all = Object.values(ITEMD.ITEMS);
  let hit = all.find(i => i.name === q);
  if (hit) return hit;
  hit = all.find(i => i.name.replace(/\s/g, '') === q.replace(/\s/g, ''));
  if (hit) return hit;
  const cands = all.filter(i => i.name.includes(q) || q.includes(i.name));
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    cands.sort((a, b) => b.name.length - a.name.length);
    return cands[0];
  }
  return null;
}

// ---------- GM 命令 ----------
const GM_PREFIX = '@//gm/';

function runGm(user, char, raw) {
  const cmd = raw.trim();
  const low = cmd.toLowerCase();

  if (low === 'show me the money') {
    const before = char.gold || 0;
    char.gold = before + 10000;
    return { ok: true, msg: `金币 +10000（${before} → ${char.gold}）` };
  }

  if (low === 'god bless you') {
    char.invincible = !char.invincible;
    return { ok: true, msg: char.invincible ? '无敌已开启。任何攻击都伤不到你。' : '无敌已关闭。' };
  }

  if (low.startsWith('give me')) {
    const rest = cmd.slice(7).trim();
    if (!rest) return { ok: false, msg: '用法：give me 物品名 [数量]' };
    // 末尾可能是数量
    const m = rest.match(/^(.*?)\s+(\d+)$/);
    let name = rest, n = 1;
    if (m) { name = m[1].trim(); n = Math.max(1, Math.min(999, parseInt(m[2], 10))); }
    const item = findItemByName(name);
    if (!item) return { ok: false, msg: `找不到物品「${name}」。` };
    const r = G.giveItem(char, item.id, n);
    if (!r.ok) return { ok: false, msg: '背包放不下。' };
    return { ok: true, msg: `获得 ${item.name} x${r.added}` };
  }

  if (low === 'help' || low === '') {
    return {
      ok: true,
      msg: 'GM 命令：show me the money / god bless you / give me 物品名 [数量]',
    };
  }

  return { ok: false, msg: `未知 GM 命令：${cmd}` };
}

// 状态快照：/api/state 和 /api/poll 共用一份逻辑，避免两处漂移
function statePayload(user, isGM) {
  const s = loadSave(user);
  const round = roundInfo();
  if (!s || !s.char) return { ok: true, hasSave: false, round, isGM };
  const c = G.migrateChar(s.char);
  // 轮次过期：上一轮的角色不能继续用
  const stale = c.roundId !== round.id;
  // 已结算（带走七娃后点了「结算」）：角色留在存档里做记录，但不再回到游戏界面
  const settled = !!(c.flags && c.flags.settled);
  // 轮次已经结束（时间到 / BOSS 被杀 / 全员出局）：角色不能再操作了。
  // 唯一例外是胜利画面 —— 玩家得看到结局并亲手点「结算」，所以 sevenwin 还放行。
  const roundOver = round.state !== 'running';
  const terminal = c.scene === 'sevenwin';
  const usable = !stale && !settled && (!roundOver || terminal);
  const out = {
    ok: true, hasSave: usable, stale, settled, state: usable ? G.snapshot(c) : null,
    round, roundOver, username: user, isGM,
    oldRound: stale ? c.roundId : null,
  };
  // 结算页战报：轮次结束时给，哪怕角色已经不能继续操作
  if (roundOver && !stale) {
    out.report = G.battleReport(c);
    out.summary = {
      kills: c.stats.kills || 0, turn: c.turn || 0, level: c.level || 1,
      gold: c.gold || 0, alive: !!c.alive,
    };
  }
  return out;
}

// ---------- 路由 ----------
async function handleReq(req, res) {
  if (shuttingDown) return json(res, 503, { ok: false, msg: '服务正在保存并退出。' });
  const url = req.url || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  if (!url.startsWith('/api/')) return serveStatic(req, res, url);

  const route = url.split('?')[0];
  const qs = new URL(url, 'http://x').searchParams;

  // ===== 健康检查（公开、零 IO、不泄露玩家信息）=====
  // 容器探针和外部监控（uptime robot / 自建巡检）都用这个，
  // 别拿首页当探针：首页要走静态资源逻辑，还带 gzip。
  if (route === '/api/health') {
    const r = W.round();
    const disk = DISK.status();
    const healthy = storageReady && disk.ok && !shuttingDown;
    return json(res, healthy ? 200 : 503, {
      ok: healthy,
      uptime: Math.round(process.uptime()),
      memMB: Math.round(process.memoryUsage().rss / 1048576),
      saves: SAVES.size,
      dirty: DIRTY.size,
      storage: storageReady && disk.ok,
      persistence: disk,
      round: { id: r.id, state: r.state },
      build: BUILD_VERSION,   // 前端版本号，一眼看出线上跑的是哪版
    });
  }

  // ===== 后台（独立鉴权，放最前）=====
  if (route === '/api/admin/login' && req.method === 'POST') {
    const wait = authWait(req, 'admin');
    if (wait) return json(res, 429, { ok: false, msg: `密码错太多次，等 ${wait} 秒再试。` });
    const { password } = await readBody(req);
    if (password !== ADMIN.password) {
      noteAuthFail(req, 'admin');
      return json(res, 403, { ok: false, msg: '密码不对。' });
    }
    guardOk(guardKey(req, 'admin'));
    const t = newToken();
    adminTokens.set(t, Date.now());
    return json(res, 200, { ok: true, token: t });
  }

  // 改管理员密码（无人值守时定期轮换用）
  if (route === '/api/admin/password' && req.method === 'POST') {
    if (!authAdmin(req)) return json(res, 401, { ok: false, msg: '需要管理员权限。' });
    const b = await readBody(req);
    const np = String(b.next || b.password || '');   // 后台表单传的是 password
    if (np.length < 8) return json(res, 400, { ok: false, msg: '新密码至少 8 位。' });
    if (np === ADMIN.password) return json(res, 400, { ok: false, msg: '新密码不能和旧的一样。' });
    ADMIN.password = np;
    writeJSON(ADMIN_FILE, ADMIN);
    adminTokens.clear();      // 所有旧会话立刻失效
    rlog('warn', '后台', '管理员密码已修改，所有后台会话失效');
    return json(res, 200, { ok: true, msg: '密码已更新，请重新登录。' });
  }

  if (route.startsWith('/api/admin/')) {
    if (!authAdmin(req)) return json(res, 401, { ok: false, msg: '需要管理员权限。' });
    return handleAdmin(route, req, res, qs);
  }

  // ===== 注册 / 登录 =====
  if (route === '/api/register' && req.method === 'POST') {
    const { username, password } = await readBody(req);
    if (!username || !password) return json(res, 400, { ok: false, msg: '账号和密码不能为空。' });
    if (String(username).length < 2 || String(username).length > 16) return json(res, 400, { ok: false, msg: '账号长度 2-16 位。' });
    if (String(password).length < 4) return json(res, 400, { ok: false, msg: '密码至少 4 位。' });
    const wait = authWait(req, username);
    if (wait) return json(res, 429, { ok: false, msg: `操作太频繁，等 ${wait} 秒再试。` });
    const db = loadUsers();
    if (db.users[username]) {
      // 重复注册也记一次失败：否则可以靠它无限探测哪些账号存在
      noteAuthFail(req, username);
      return json(res, 400, { ok: false, msg: '这个账号已经有人用了。' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[username] = { salt, hash: await hashPwd(password, salt), created: Date.now(), isGM: false };
    saveUsers(db);
    guardOk(guardKey(req, username));
    const token = newToken();
    setSession(token, username);
    return json(res, 200, { ok: true, token, username, hasSave: false });
  }

  if (route === '/api/login' && req.method === 'POST') {
    const { username, password } = await readBody(req);
    const wait = authWait(req, username);
    if (wait) return json(res, 429, { ok: false, msg: `密码错太多次，等 ${wait} 秒再试。` });
    const db = loadUsers();
    const u = db.users[username];
    // 账号不存在 / 密码错 用同一句话：否则等于送了个「哪些账号存在」的查询接口
    if (!u) {
      noteAuthFail(req, username);
      return json(res, 400, { ok: false, msg: '账号或密码不对。' });
    }
    if ((await hashPwd(String(password), u.salt)) !== u.hash) {
      noteAuthFail(req, username);
      return json(res, 400, { ok: false, msg: '账号或密码不对。' });
    }
    guardOk(guardKey(req, username));
    const token = newToken();
    setSession(token, username);
    const s = loadSave(username);
    return json(res, 200, { ok: true, token, username, hasSave: !!(s && s.char), isGM: !!u.isGM });
  }

  // ===== 需登录 =====
  const user = authUser(req);
  if (!user) return json(res, 401, { ok: false, msg: '未登录或会话已过期。' });
  const db = loadUsers();
  const isGM = !!(db.users[user] && db.users[user].isGM);

  if (route === '/api/logout') {
    dropSession(bearer(req));
    return json(res, 200, { ok: true });
  }

  if (route === '/api/meta') return sendMeta(res, isGM);

  // ===== 状态 =====
  if (route === '/api/state') {
    return json(res, 200, statePayload(user, isGM));
  }

  // ===== 开局 =====
  if (route === '/api/newgame' && req.method === 'POST') {
    let r = W.round();
    if (r.state === 'idle') {
      if (!W.settings().autoStart) return json(res, 400, { ok: false, msg: '当前没有进行中的对局，等待管理员开局。' });
      W.startRound('玩家 ' + user);
      r = W.round();
    }
    if (r.state === 'ended') return json(res, 400, { ok: false, msg: '这一轮已经结束了，等待下一轮。' });

    // 本轮已经死了就不能重生，得等下一轮
    const old = loadSave(user);
    if (old && old.char && old.char.roundId === r.id) {
      if (old.char.scene === 'dead' || old.char.alive === false) {
        return json(res, 400, { ok: false, msg: '你这一轮已经出局了，等下一轮吧。' });
      }
      return json(res, 400, { ok: false, msg: '你这一轮的角色还活着，不用重新开局。' });
    }

    const { name } = await readBody(req);
    const c = G.createChar(sanitize(name, 12) || user);
    c.roundId = r.id;
    // 账号级累计（跨轮次）：带七娃回家的次数
    c.career = Object.assign({ sevenWa: 0 }, (db.users[user] && db.users[user].career) || {});
    // 拿到 career 之后再同步一次：已经达成的跨轮称号直接静默标记，
    // 否则新一局点第一下就会弹「解锁称号：带他回家」
    G.syncCareerAchievements(c);
    saveChar(user, c);
    W.pushChat({ ch: 'public', from: '系统', text: `${c.name} 加入了第 ${r.id} 轮。`, kind: 'sys' });
    return json(res, 200, { ok: true, state: G.snapshot(c), round: roundInfo() });
  }

  // ===== 行动 =====
  if (route === '/api/action' && req.method === 'POST') {
    const body = await readBody(req);
    const s = loadSave(user);
    if (!s || !s.char) return json(res, 400, { ok: false, msg: '还没有存档。' });
    const c = G.migrateChar(s.char);
    const r0 = W.round();
    // settle（点胜利画面的「结算」）必须放行：七娃带走的那一刻本轮就已经结束了，
    // 如果这里也拦「对局已结束」，结算永远失败 → 存档没标记 settled → 刷新又回到胜利画面
    if (body.action !== 'settle') {
      if (c.roundId !== r0.id) {
        return json(res, 400, { ok: false, msg: '这一轮已经结束了。', round: roundInfo(), roundOver: true });
      }
      if (r0.state !== 'running') {
        // 带上 round，前端才能立刻切到结算画面，而不是只弹一行红字继续卡着
        return json(res, 400, { ok: false, msg: '对局已结束。', round: roundInfo(), roundOver: true });
      }
    }

    // 同区块的其他真人玩家：给 game.js 做「玩家遭遇」用
    // GM 隐身——既不把 GM 放进别人的候选，GM 自己也遇不到别人
    const needNearby = body.action === 'move' || body.action === 'explore';
    if (isGM || !needNearby) {
      c._nearby = [];
    } else {
      // GM 名单只读一次 users.json，别在 filter 里反复读
      const gmSet = new Set(Object.entries(loadUsers().users).filter(([, v]) => v.isGM).map(([u]) => u));
      c._nearby = listSavesCached()
        .filter(x => x.user !== user && x.char && x.char.roundId === r0.id
          && x.char.alive !== false && x.char.scene === 'map'
          && !(x.char.flags && x.char.flags.settled)
          && x.char.pos === c.pos
          && !gmSet.has(x.user))
        .map(x => {
          // 只算战斗需要的几个数，不做完整 snapshot（那个很重）
          const w = x.char.equip && x.char.equip.weapon ? G.ITEMS[x.char.equip.weapon.id] : null;
          const str = G.effAttr(x.char, 'str');
          return {
            user: x.user, name: x.char.name,
            hp: Math.max(20, Math.round(x.char.hp)), hpMax: Math.max(20, G.hpMax(x.char)),
            atk: Math.round((w ? w.dmg : 5) * (1 + str / 150)),
            def: G.playerDef(x.char),
            dodge: Math.round(6 + G.effAttr(x.char, 'luk') * 0.15),
            level: x.char.level || 1, bot: !!x.char.bot,
          };
        });
    }

    let r;
    try {
      r = G.act(c, body.action, body.payload || {});
    } catch (e) {
      console.error('[action error]', body.action, e);
      return json(res, 500, { ok: false, msg: '内部错误：' + e.message });
    }
    // 玩家遭遇的结果：写回被打的人
    if (c._pvpResult) {
      try { applyPvp(c, c._pvpResult); } catch (e) { console.error('[pvp]', e); }
      delete c._pvpResult;
    }
    saveChar(user, c);

    // 账号级累计同步回 users.json
    if (c.career) {
      const db2 = loadUsers();
      if (db2.users[user]) {
        db2.users[user].career = Object.assign({}, db2.users[user].career || {}, c.career);
        saveUsers(db2);
      }
    }

    // 死亡广播
    if (c.scene === 'dead' && !c._deathAnnounced) {
      c._deathAnnounced = true;
      saveChar(user, c);
      W.pushChat({ ch: 'public', from: '系统', text: `${c.name} 出局了。`, kind: 'death' });
    }

    // 击杀 BOSS → 全服结束
    if (c.flags.bossDefeated && r0.state === 'running' && !r0.bossKilled) {
      r0.bossKilled = true;
      W.endRound('boss', { username: user, name: c.name });
    }

    // 带走七娃 → 全服结束（算胜利）
    if (c.flags.sevenWaHome && W.round().state === 'running') {
      W.endRound('sevenwa', { username: user, name: c.name });
    }

    // 全员死亡 → 结束
    if (W.round().state === 'running') {
      const saves = listSaves().filter(x => x.char && x.char.roundId === W.round().id);
      const anyAlive = saves.some(x => x.char.alive && x.char.scene !== 'dead');
      if (saves.length > 0 && !anyAlive) W.endRound('wiped', null);
    }

    // 注意：这里要带上动作自己的附加字段（强化返回的 plus/where 等），
    // 只挑 ok/msg/achievements 会把前端要用的信息丢掉
    return json(res, 200, Object.assign({}, r, {
      ok: r.ok !== false,
      msg: r.msg || '',
      achievements: r.achievements || [],
      state: G.snapshot(c),
      round: roundInfo(),
    }));
  }

  // ===== 聊天 =====
  if (route === '/api/chat/send' && req.method === 'POST') {
    const { ch, text, to } = await readBody(req);
    const c = getChar(user);
    const zone = c ? c.pos : null;
    let body = sanitize(text, 200);
    if (!body) return json(res, 400, { ok: false, msg: '空消息。' });

    // GM 命令
    if (body.startsWith(GM_PREFIX)) {
      if (!isGM) {
        return json(res, 403, { ok: false, msg: '你没有 GM 权限。' });
      }
      if (!c) return json(res, 400, { ok: false, msg: '先开局。' });
      const out = runGm(user, c, body.slice(GM_PREFIX.length));
      const unlocked = G.checkAchievements(c);
      saveChar(user, c);
      W.pushChat({ ch: 'public', from: '系统', text: `[GM] ${user}：${out.msg}`, kind: 'gm' });
      return json(res, 200, {
        ok: out.ok, msg: out.msg, gm: true,
        achievements: unlocked || [],
      });
    }

    // 普通玩家发言有冷却（GM 命令在上面已经 return 了，不受影响）
    const lastAt = chatLast.get(user) || 0;
    const leftMs = CHAT_CD - (Date.now() - lastAt);
    if (leftMs > 0) {
      return json(res, 429, { ok: false, msg: `说太快了，${Math.ceil(leftMs / 1000)} 秒后再发。` });
    }
    chatLast.set(user, Date.now());

    if (ch === 'private') {
      const target = sanitize(to, 16).replace(/^@/, '');
      if (!target) return json(res, 400, { ok: false, msg: '要发给谁？' });
      if (!db.users[target]) return json(res, 400, { ok: false, msg: '没有这个玩家。' });
      const m = W.pushChat({ ch: 'private', from: user, to: target, text: body, zone });
      return json(res, 200, { ok: true, msg: m });
    }

    if (ch === 'zone') {
      if (!c) return json(res, 400, { ok: false, msg: '先开局。' });
      const m = W.pushChat({ ch: 'zone', from: user, to: null, text: body, zone, kind: 'say' });
      return json(res, 200, { ok: true, msg: m });
    }

    const m = W.pushChat({ ch: 'public', from: user, to: null, text: body, zone, kind: 'say' });
    return json(res, 200, { ok: true, msg: m });
  }

  if (route === '/api/chat/poll') {
    const since = parseInt(qs.get('since'), 10) || 0;
    const c = getChar(user);
    const zone = c ? c.pos : (qs.get('zone') || null);
    const msgs = W.getChat(since, user, zone);
    const maxId = msgs.length ? msgs[msgs.length - 1].id : since;
    return json(res, 200, { ok: true, msgs, maxId, round: roundInfo() });
  }

  // ===== 合并轮询 =====
  // 以前前端跑两个定时器：聊天 2.2 秒一次、状态 5 秒一次。
  // 现在合成一个请求，前端只留一个定时器 —— 连接数、鉴权、解析各少一半。
  // state=1 时才带完整快照，客户端每两次带一次，所以状态刷新频率仍是 5 秒。
  if (route === '/api/poll') {
    const since = parseInt(qs.get('since'), 10) || 0;
    const wantState = qs.get('state') === '1';
    const c = getChar(user);
    const zone = c ? c.pos : (qs.get('zone') || null);
    const msgs = W.getChat(since, user, zone);
    const maxId = msgs.length ? msgs[msgs.length - 1].id : since;
    const out = { ok: true, msgs, maxId, round: roundInfo() };
    if (wantState) {
      const st = statePayload(user, isGM);
      out.hasSave = st.hasSave;
      out.state = st.state;
      out.stale = st.stale;
      out.settled = st.settled;
      out.roundOver = st.roundOver;
      out.oldRound = st.oldRound;
    }
    return json(res, 200, out);
  }

  // ===== 排行榜 =====
  if (route === '/api/leaderboard') {
    const r = W.round();
    const saves = listSaves().filter(s => s.char && s.char.roundId === r.id);
    const board = saves.map(s => {
      const sc = G.scoreOf(s.char);
      // 只展示本轮拿到的称号：跨轮里程碑不该出现在本轮排行榜里
      const roundTitles = Object.keys(s.char.roundTitles || {});
      return {
        username: s.user,
        name: s.char.name,
        kills: s.char.stats ? s.char.stats.kills : s.char.kills,
        turn: s.char.turn,
        alive: s.char.alive && s.char.scene !== 'dead',
        boss: !!(s.char.stats && s.char.stats.bossKills),
        gold: s.char.gold || 0,
        titles: roundTitles.length,
        titleIds: roundTitles,
        zone: (MAPD.BY_ID[s.char.pos] || {}).name || '—',
        score: sc.total,
        parts: sc.parts,
      };
    }).sort((a, b) => (b.score - a.score) || (b.kills - a.kills) || (b.turn - a.turn));

    return json(res, 200, { ok: true, board, history: W.get().history.slice(0, 10), round: roundInfo() });
  }

  // ===== 成就总览 =====
  if (route === '/api/achievements') {
    const c = getChar(user);
    const mine = c ? (c.achievements || {}) : {};
    return json(res, 200, { ok: true, all: META.achievements, cats: META.achCats, mine });
  }

  // ===== 交易 =====
  if (route === '/api/trade/offer' && req.method === 'POST') {
    const { to, giveGold, giveItems, wantGold, wantItems } = await readBody(req);
    const target = String(to || '').replace(/^@/, '').trim();
    if (target === user) return json(res, 400, { ok: false, msg: '不能跟自己交易。' });
    const a = getChar(user), b = getChar(target);
    if (!a) return json(res, 400, { ok: false, msg: '你还没有角色。' });
    if (!b) return json(res, 400, { ok: false, msg: '对方没有角色。' });
    if (a.pos !== b.pos) return json(res, 400, { ok: false, msg: '你们不在同一个区块，交易不了。' });

    const r = TRADE.create(user, target, { giveGold, giveItems, wantGold, wantItems });
    if (!r.ok) return json(res, 400, r);
    W.pushChat({ ch: 'zone', from: '系统', to: null, text: `${a.name} 向 ${b.name} 发起了交易。`, zone: a.pos, kind: 'sys' });
    return json(res, 200, { ok: true, trade: r.trade });
  }

  if (route === '/api/trade/list') {
    return json(res, 200, { ok: true, incoming: TRADE.pendingFor(user), outgoing: TRADE.sentBy(user) });
  }

  if (route === '/api/trade/accept' && req.method === 'POST') {
    const { id } = await readBody(req);
    const t = TRADE.get(id);
    if (!t || t.status !== 'pending') return json(res, 400, { ok: false, msg: '这笔交易已经没了。' });
    if (t.to !== user) return json(res, 403, { ok: false, msg: '不是发给你的。' });

    const a = getChar(t.from), b = getChar(t.to);
    if (!a || !b) return json(res, 400, { ok: false, msg: '有一方角色不存在。' });
    if (a.pos !== b.pos) { TRADE.remove(id); return json(res, 400, { ok: false, msg: '你们已经不在同一个区块了。' }); }

    // 校验
    const has = (c, id2, n) => c.bag.filter(i => i.id === id2).reduce((s, i) => s + i.n, 0) >= n;
    if ((a.gold || 0) < t.giveGold) { TRADE.remove(id); return json(res, 400, { ok: false, msg: '发起方金币不够，交易取消。' }); }
    for (const it of t.giveItems) if (!has(a, it.id, it.n)) { TRADE.remove(id); return json(res, 400, { ok: false, msg: '发起方物品不足，交易取消。' }); }
    if ((b.gold || 0) < t.wantGold) return json(res, 400, { ok: false, msg: '你的金币不够。' });
    for (const it of t.wantItems) if (!has(b, it.id, it.n)) return json(res, 400, { ok: false, msg: `你没有足够的 ${ITEMD.ITEMS[it.id] ? ITEMD.ITEMS[it.id].name : it.id}。` });

    // 执行
    for (const it of t.giveItems) { G.takeItem(a, it.id, it.n); G.giveItem(b, it.id, it.n); }
    for (const it of t.wantItems) { G.takeItem(b, it.id, it.n); G.giveItem(a, it.id, it.n); }
    a.gold -= t.giveGold; b.gold += t.giveGold;
    b.gold -= t.wantGold; a.gold += t.wantGold;
    a.stats.trades++; b.stats.trades++;
    saveChar(t.from, a); saveChar(t.to, b);
    TRADE.remove(id);

    W.pushChat({ ch: 'zone', from: '系统', to: null, text: `${a.name} 和 ${b.name} 完成了交易。`, zone: a.pos, kind: 'sys' });
    return json(res, 200, { ok: true, msg: '交易完成。' });
  }

  if (route === '/api/trade/reject' && req.method === 'POST') {
    const { id } = await readBody(req);
    const t = TRADE.get(id);
    if (t && (t.to === user || t.from === user)) TRADE.remove(id);
    return json(res, 200, { ok: true });
  }

  // ===== 附近玩家（交易/私聊用）=====
  if (route === '/api/players/nearby') {
    const c = getChar(user);
    if (!c) return json(res, 200, { ok: true, players: [] });
    const saves = listSaves().filter(s => s.char && s.char.roundId === c.roundId && s.char.pos === c.pos && s.user !== user && s.char.alive);
    const players = saves.map(s => ({ username: s.user, name: s.char.name, kills: s.char.stats ? s.char.stats.kills : 0 }));
    return json(res, 200, { ok: true, players, zone: c.pos });
  }

  // 同区块玩家的公开背包（交易时看对方有什么）
  if (route === '/api/players/bag') {
    const target = qs.get('u');
    const c = getChar(user), t = getChar(target);
    if (!c || !t) return json(res, 404, { ok: false, msg: '玩家不存在。' });
    if (c.pos !== t.pos) return json(res, 403, { ok: false, msg: '不在同一个区块。' });
    const bag = t.bag.map(it => ({
      id: it.id, n: it.n,
      name: (ITEMD.ITEMS[it.id] || {}).name || it.id,
    }));
    return json(res, 200, { ok: true, name: t.name, gold: t.gold || 0, bag });
  }

  // ===== GM 开局 / 结束 =====
  if (route === '/api/round/start' && req.method === 'POST') {
    if (!isGM) return json(res, 403, { ok: false, msg: '需要 GM 权限。' });
    if (W.round().state === 'running') return json(res, 400, { ok: false, msg: '已经在跑了。' });
    W.startRound(user);
    return json(res, 200, { ok: true, round: roundInfo() });
  }

  if (route === '/api/round/end' && req.method === 'POST') {
    if (!isGM) return json(res, 403, { ok: false, msg: '需要 GM 权限。' });
    W.endRound('manual', null);
    return json(res, 200, { ok: true, round: roundInfo() });
  }

  if (route === '/api/export') {
    const s = loadSave(user);
    return json(res, 200, { ok: true, save: s });
  }

  // 导出自己的存档为 CSV
  if (route === '/api/export/csv') {
    const c = getChar(user);
    if (!c) return json(res, 404, { ok: false, msg: '还没有角色。' });
    const csv = toCsv(CSV_HEADERS, [charRow(user, c)]);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="br-${user}-${Date.now()}.csv"`,
    });
    return res.end(csv);
  }

  return json(res, 404, { ok: false, msg: 'not found' });
}

// ---------- 后台接口 ----------
async function handleAdmin(route, req, res, qs) {
  if (route === '/api/admin/items') {
    const items = Object.values(ITEMD.ITEMS)
      .map(i => ({ id: i.id, name: i.name, type: i.type, size: i.size, rarity: i.rarity }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const zones = MAPD.MAP.map(z => ({ id: z.id, name: z.name, danger: z.danger, region: z.region }));
    return json(res, 200, { ok: true, items, zones });
  }

  if (route === '/api/admin/bagview') {
    const u = qs.get('u');
    const c = getChar(u);
    if (!c) return json(res, 404, { ok: false, msg: '玩家不存在。' });
    const bag = c.bag.map(it => ({
      id: it.id,
      name: (ITEMD.ITEMS[it.id] || {}).name || it.id,
      n: it.n,
    }));
    return json(res, 200, { ok: true, bag, used: G.usedSlots(c), slots: G.slots(c) });
  }

  if (route === '/api/admin/stats') {
    const saves = listSaves();
    const r = W.round();
    const roundChars = saves.filter(s => s.char && s.char.roundId === r.id);
    const zoneCount = {};
    roundChars.forEach(s => { zoneCount[s.char.pos] = (zoneCount[s.char.pos] || 0) + 1; });
    const zoneHeat = Object.entries(zoneCount).map(([id, n]) => ({
      id, name: (MAPD.BY_ID[id] || {}).name || id, n,
    })).sort((a, b) => b.n - a.n);
    let bytes = 0;
    try {
      for (const f of await fs.promises.readdir(SAVE_DIR)) {
        try { bytes += (await fs.promises.stat(path.join(SAVE_DIR, f))).size; } catch (e) { /* 文件可能已删除 */ }
      }
    } catch (e) { /* ignore */ }
    const trashCount = await fs.promises.readdir(TRASH_DIR).then(x => x.length).catch(() => 0);
    const titles = {};
    roundChars.forEach(s => {
      for (const k of Object.keys(s.char.achievements || {})) titles[k] = (titles[k] || 0) + 1;
    });
    // 跨轮次累计：带七娃回家的总次数（好爸爸称号看的就是这个）
    const usersDb = loadUsers();
    const sevenWaTotal = Object.values(usersDb.users).reduce((a, u) => a + (((u.career && u.career.sevenWa) || 0)), 0);
    return json(res, 200, {
      ok: true,
      accounts: Object.keys(usersDb.users).length,
      chars: saves.length,
      roundChars: roundChars.length,
      alive: roundChars.filter(s => s.char.alive && s.char.scene !== 'dead').length,
      dead: roundChars.filter(s => !s.char.alive || s.char.scene === 'dead').length,
      totalKills: roundChars.reduce((a, s) => a + ((s.char.stats && s.char.stats.kills) || 0), 0),
      totalGold: roundChars.reduce((a, s) => a + (s.char.gold || 0), 0),
      sevenWaTotal,
      zoneHeat,
      titles,
      chatCount: W.get().chat.length,
      saveBytes: bytes,
      uptime: Math.round(process.uptime()),
      memMB: Math.round(process.memoryUsage().rss / 1048576),
      node: process.version,
      // 内存存储状态：内存里多少份、多少还没落盘
      storage: (() => {
        const trash = trashCount;
        return { ready: storageReady, saves: SAVES.size, dirty: DIRTY.size, usersDirty, trash, trashBusy };
      })(),
      settings: W.settings(),
      // 前端资源版本号（内容哈希）：后台一眼看出浏览器该拿哪一版
      assets: (() => {
        const out = {};
        for (const n of ['index.html', 'app.js', 'style.css', 'pixel.js', 'admin.html']) {
          const m = assetMeta(n);
          if (m) out[n] = m.ver;
        }
        return out;
      })(),
      // 物品/配方规模：改过数据后一眼看出有没有生效
      catalog: (() => {
        const all = Object.values(ITEMD.ITEMS);
        const by = t => all.filter(d => d.type === t).length;
        return {
          items: all.length,
          weapons: by('weapon'),
          armors: by('armor'),
          bags: by('bag'),
          meds: by('med'),
          hostile: by('hostile'),
          materials: by('material'),
          ammo: by('ammo'),
          throwable: by('throwable'),
          buffs: by('buff'),
          recipes: RECIPES.length,
          fireModes: Object.keys(ITEMD.FIRE_MODES || {}).length,
          epicGear: all.filter(d => (d.type === 'weapon' || d.type === 'armor') && d.rarity >= 5).length,
          maxPlus: G.MAX_PLUS,
        };
      })(),
    });
  }

  if (route === '/api/admin/chat') {
    const msgs = W.get().chat.slice(-120).reverse();
    return json(res, 200, { ok: true, msgs });
  }

  // ===== 运行日志：增量拉取 + 内存采样 =====
  if (route === '/api/admin/logs') {
    const since = parseInt(qs.get('since'), 10) || 0;
    const level = qs.get('level') || 'all';
    const list = getLogs(since, level);
    return json(res, 200, {
      ok: true,
      logs: list,
      maxId: logSeq - 1,
      total: LOG_BUF.length,
      // 各级别计数，前端做筛选徽标用
      counts: {
        all: LOG_BUF.length,
        error: LOG_BUF.filter(m => m.level === 'error').length,
        warn: LOG_BUF.filter(m => m.level === 'warn').length,
        info: LOG_BUF.filter(m => m.level === 'info').length,
        sys: LOG_BUF.filter(m => m.level === 'sys').length,
      },
      mem: MEM_BUF.slice(-40),
      now: MEM_BUF[MEM_BUF.length - 1] || null,
    });
  }

  // 手动清空日志（不影响业务数据）
  if (route === '/api/admin/logs/clear' && req.method === 'POST') {
    LOG_BUF.length = 0;
    rlog('sys', '日志', '日志已被管理员清空。');
    return json(res, 200, { ok: true });
  }

  // 只重读一个玩家的存档 —— 测试脚本改完文件后立刻同步，不用等 2 秒落盘周期
  if (route === '/api/admin/loadone' && req.method === 'POST') {
    const b = await readBody(req);
    const epoch = storageEpoch;
    if (DIRTY.has(b.username) || DISK.pending.has(savePath(b.username))) return json(res, 409, { ok: false, msg: '该存档正在保存，请稍后重试。' });
    const s = await fs.promises.readFile(savePath(b.username), 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!s) return json(res, 404, { ok: false, msg: '存档文件不存在。' });
    if (storageEpoch !== epoch) return json(res, 409, { ok: false, msg: '存档已变化，请重试。' });
    SAVES.set(b.username, s);
    storageEpoch++;
    SAVE_VERSIONS.set(b.username, (SAVE_VERSIONS.get(b.username) || 0) + 1);
    return json(res, 200, { ok: true });
  }

  // 重新从磁盘载入存储 —— 手改了 store/saves/*.json 之后用这个，不用重启
  if (route === '/api/admin/reload' && req.method === 'POST') {
    const epoch = storageEpoch;
    await flushStorage();
    await DISK.drain();
    const entries = await fs.promises.readdir(SAVE_DIR);
    const nextSaves = new Map();
    for (const name of entries.filter(x => x.endsWith('.json'))) {
      const value = JSON.parse(await fs.promises.readFile(path.join(SAVE_DIR, name), 'utf8'));
      if (!value || !value.user) throw new Error('存档格式错误，重载已取消。');
      nextSaves.set(value.user, value);
    }
    const nextUsers = JSON.parse(await fs.promises.readFile(USERS_FILE, 'utf8'));
    if (!nextUsers || !nextUsers.users) throw new Error('账号文件格式错误，重载已取消。');
    if (storageEpoch !== epoch) return json(res, 409, { ok: false, msg: '读取期间数据已更新，请在空闲时重试。' });
    SAVES.clear();
    for (const [u, value] of nextSaves) SAVES.set(u, value);
    USERS_DB = nextUsers;
    storageEpoch++;
    const st = { saves: SAVES.size, users: Object.keys(USERS_DB.users).length };
    rlog('sys', '存储', `手动重载：${st.saves} 个存档 / ${st.users} 个账号`);
    return json(res, 200, { ok: true, ...st });
  }

  // 主动跑一次 GC（仅提示，Node 无 --expose-gc 时无法强制）
  if (route === '/api/admin/logs/probe' && req.method === 'POST') {
    sampleMem();
    const m = process.memoryUsage();
    rlog('sys', '内存', `手动采样：堆 ${(m.heapUsed / 1048576).toFixed(1)}MB / RSS ${(m.rss / 1048576).toFixed(1)}MB`);
    return json(res, 200, { ok: true, mem: MEM_BUF[MEM_BUF.length - 1] });
  }

  // 导出全服存档为 CSV
  if (route === '/api/admin/export/csv') {
    const rows = listSaves().map(s => charRow(s.user, G.migrateChar(s.char)));
    const csv = toCsv(CSV_HEADERS, rows);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="br-all-${Date.now()}.csv"`,
    });
    return res.end(csv);
  }

  if (route === '/api/admin/chat/clear' && req.method === 'POST') {
    W.get().chat = [];
    W.save();
    return json(res, 200, { ok: true });
  }

  if (route === '/api/admin/playerdetail') {
    const u = qs.get('u');
    const c = getChar(u);
    if (!c) return json(res, 404, { ok: false, msg: '玩家不存在。' });
    return json(res, 200, {
      ok: true,
      char: {
        name: c.name, pos: c.pos, hp: Math.round(c.hp), hpMax: G.hpMax(c),
        ep: Math.round(c.ep), epMax: G.epMax(c), gold: c.gold || 0,
        attrs: c.attrs, status: c.status, invincible: !!c.invincible,
        achievements: c.achievements || {}, stats: c.stats || {}, career: c.career || {},
        hostages: c.hostages || [], turn: c.turn, alive: c.alive, scene: c.scene,
        roundId: c.roundId,
        log: (c.log || []).slice(-30),
      },
    });
  }

  if (route === '/api/admin/global' && req.method === 'POST') {
    const b = await readBody(req);
    const saves = listSaves().filter(s => s.char && s.char.roundId === W.round().id);
    let n = 0;
    for (const s of saves) {
      if (b.action === 'reset') {
        deleteSave(s.user);
        n++;
        continue;
      }
      const c = G.migrateChar(s.char);
      if (b.action === 'heal') {
        c.hp = G.hpMax(c); c.ep = G.epMax(c); c.alive = true;
        if (c.scene === 'dead') { c.scene = 'map'; c.pending = null; }
      } else if (b.action === 'gold') {
        c.gold = Math.max(0, (c.gold || 0) + (parseInt(b.amount, 10) || 0));
      } else if (b.action === 'item') {
        if (b.itemId && ITEMD.ITEMS[b.itemId]) G.giveItem(c, b.itemId, Math.max(1, Math.min(99, b.n || 1)));
      } else if (b.action === 'invincible') {
        c.invincible = !!b.on;
      } else {
        return json(res, 400, { ok: false, msg: '未知批量操作。' });
      }
      saveChar(s.user, c);
      n++;
    }
    return json(res, 200, { ok: true, affected: n });
  }

  if (route === '/api/admin/gmcmd' && req.method === 'POST') {
    const b = await readBody(req);
    const c = getChar(b.username);
    if (!c) return json(res, 404, { ok: false, msg: '玩家不存在。' });
    const out = runGm(b.username, c, String(b.cmd || ''));
    const unlocked = G.checkAchievements(c);
    saveChar(b.username, c);
    return json(res, 200, { ok: out.ok, msg: out.msg, achievements: unlocked || [] });
  }

  if (route === '/api/admin/kick' && req.method === 'POST') {
    const b = await readBody(req);
    let n = 0;
    // 先收集再删：边遍历边删虽然 Map 允许，但容易漏掉 sessionAt 的清理
    const victims = [];
    for (const [t, u] of sessions) if (u === b.username) victims.push(t);
    for (const t of victims) { dropSession(t); n++; }
    return json(res, 200, { ok: true, kicked: n });
  }

  if (route === '/api/admin/overview') {
    const saves = listSaves();
    const db = loadUsers();
    const players = saves.map(s => ({
      username: s.user,
      name: s.char.name,
      roundId: s.char.roundId,
      alive: s.char.alive && s.char.scene !== 'dead',
      scene: s.char.scene,
      hp: Math.round(s.char.hp), hpMax: G.hpMax(s.char),
      ep: Math.round(s.char.ep),
      gold: s.char.gold || 0,
      pos: s.char.pos,
      zoneName: (MAPD.BY_ID[s.char.pos] || {}).name || '—',
      turn: s.char.turn,
      kills: s.char.stats ? s.char.stats.kills : s.char.kills,
      invincible: !!s.char.invincible,
      titles: Object.keys(s.char.achievements || {}).length,
      bagUsed: G.usedSlots(s.char), bagSlots: G.slots(s.char),
      attrs: s.char.attrs,
      // 跨轮次战绩（带七娃回家次数在 users.json 的 career 里，这里合并出来给后台看）
      career: Object.assign({ sevenWa: 0 }, (db.users[s.user] && db.users[s.user].career) || {}, s.char.career || {}),
      stats: s.char.stats || {},
      settled: !!(s.char.flags && s.char.flags.settled),
      bot: !!s.char.bot,
      // 排名分数（和排行榜/结算用的是同一个 scoreOf）
      score: G.scoreOf(s.char).total,
      // 装备强化等级，后台一眼看出谁在堆强化
      plus: {
        weapon: G.plusOf(s.char.equip && s.char.equip.weapon),
        body: G.plusOf(s.char.equip && s.char.equip.body),
        head: G.plusOf(s.char.equip && s.char.equip.head),
      },
    }));
    const accounts = Object.entries(db.users).map(([u, v]) => ({ username: u, isGM: !!v.isGM, created: v.created }));
    return json(res, 200, {
      ok: true, players, accounts, settings: W.settings(), round: roundInfo(),
      history: W.get().history.slice(0, 10),
      merchants: Object.keys(SHOP.MERCHANTS).length,
    });
  }

  if (route === '/api/admin/settings' && req.method === 'POST') {
    const b = await readBody(req);
    const s = W.settings();
    const clampNum = (v, a, b2) => Math.max(a, Math.min(b2, v));
    if (typeof b.lootRate === 'number') s.lootRate = clampNum(b.lootRate, 0, 10);
    if (typeof b.goldRate === 'number') s.goldRate = clampNum(b.goldRate, 0, 10);
    if (typeof b.bossHp === 'number') s.bossHp = Math.round(clampNum(b.bossHp, 50, 99999));
    if (typeof b.bossAtk === 'number') s.bossAtk = Math.round(clampNum(b.bossAtk, 1, 999));
    if (typeof b.moveCost === 'number') s.moveCost = Math.round(clampNum(b.moveCost, 1, 20));
    if (typeof b.exploreCost === 'number') s.exploreCost = Math.round(clampNum(b.exploreCost, 1, 20));
    if (typeof b.encounterMul === 'number') s.encounterMul = clampNum(b.encounterMul, 0, 5);
    if (typeof b.mineMul === 'number') s.mineMul = clampNum(b.mineMul, 0, 5);
    if (typeof b.shopMul === 'number') s.shopMul = clampNum(b.shopMul, 0.1, 5);
    if (typeof b.startGold === 'number') s.startGold = Math.round(clampNum(b.startGold, 0, 100000));
    if (typeof b.statusMs === 'number') s.statusMs = Math.round(clampNum(b.statusMs, 10000, 3600000));
    if (typeof b.sevenWaChance === 'number') s.sevenWaChance = clampNum(b.sevenWaChance, 0, 100);
    if (typeof b.specialScale === 'number') s.specialScale = clampNum(b.specialScale, 0, 5);
    if (typeof b.onlineAware === 'boolean') s.onlineAware = b.onlineAware;
    if (typeof b.pvpChance === 'number') s.pvpChance = clampNum(b.pvpChance, 0, 100);
    if (typeof b.autoStart === 'boolean') W.setAutoStart(b.autoStart);
    if (typeof b.bossEnabled === 'boolean') s.bossEnabled = b.bossEnabled;
    W.save();
    return json(res, 200, { ok: true, settings: s });
  }



  // ===== 清理旧轮存档（只留当前轮） =====
  // 关键：不能逐个 unlink。本机 772 个存档逐个删要 3 分钟，同步跑会把事件循环堵死，
  // 表现就是「点一下按钮，后台整站打不开」。改成整目录 rename（1ms）+ 后台异步删。
  //
  // 保留规则（防误删）：
  //   1) 属于当前轮次
  //   2) 6 小时内还有动作（轮次刚切换时，上一轮玩家不会被一刀切）
  const KEEP_RECENT_MS = 6 * 3600 * 1000;
  function cleanupKeep(s, roundId, now) {
    if (s.char && s.char.roundId === roundId) return true;
    const ts = (s.char && s.char.updatedAt) || s.updatedAt || 0;
    return ts > 0 && now - ts < KEEP_RECENT_MS;
  }

  if (route === '/api/admin/cleanup' && req.method === 'GET') {
    const r = W.round();
    const now = Date.now();
    const all = listSaves();
    const keep = all.filter(s => cleanupKeep(s, r.id, now)).length;
    const recent = all.filter(s => s.char && s.char.roundId !== r.id && cleanupKeep(s, r.id, now)).length;
    return json(res, 200, {
      ok: true, total: all.length, keep, drop: all.length - keep, recent,
      round: r.id, roundMin: Math.floor((now - (r.startedAt || now)) / 60000),
    });
  }
  if (route === '/api/admin/cleanup' && req.method === 'POST') {
    const r = W.round();
    const now = Date.now();
    const all = listSaves();
    const keep = all.filter(s => cleanupKeep(s, r.id, now));
    const drop = all.filter(s => !cleanupKeep(s, r.id, now));
    if (!drop.length) {
      return json(res, 200, { ok: true, removed: 0, kept: keep.length, ms: 0, msg: '没有需要清理的存档。' });
    }

    const t0 = Date.now();
    // 删除与保存共用串行队列，避免目录置换与正在保存的快照竞态。
    for (const s of drop) deleteSave(s.user);

    const ms = Date.now() - t0;
    rlog('sys', '清理', `清掉 ${drop.length} 个旧轮存档，保留 ${keep.length} 个，耗时 ${ms}ms`);
    return json(res, 200, {
      ok: true, removed: drop.length, kept: keep.length, ms,
      msg: `清掉 ${drop.length} 个旧轮存档，保留 ${keep.length} 个（${ms}ms）`,
    });
  }

  // ===== 单轮控制（当前这一轮的区块级设置） =====
  if (route === '/api/admin/roundcfg' && req.method === 'GET') {
    const r = W.round();
    return json(res, 200, {
      ok: true,
      round: roundInfo(),
      zones: MAPD.MAP.map(z => ({ id: z.id, name: z.name, region: z.region, danger: z.danger, loot: z.loot })),
      overrides: r.zoneOverrides || {},
      bots: listSaves().filter(s => s.char && s.char.bot)
        .map(s => ({ user: s.user, name: s.char.name, pos: s.char.pos, hp: Math.round(s.char.hp) })),
    });
  }
  if (route === '/api/admin/roundcfg' && req.method === 'POST') {
    const b = await readBody(req);
    const r = W.round();
    r.zoneOverrides = r.zoneOverrides || {};
    if (b.clear) {
      if (b.zone) delete r.zoneOverrides[b.zone];
      else r.zoneOverrides = {};
    } else {
      if (!b.zone || !MAPD.BY_ID[b.zone]) return json(res, 400, { ok: false, msg: '区块不存在。' });
      r.zoneOverrides[b.zone] = {
        lootMul: Math.max(0, Math.min(5, Number(b.lootMul) || 1)),
        force: ['box', 'fight', 'hostage', 'npc', 'none'].includes(b.force) ? b.force : '',
        forceChance: Math.max(0, Math.min(100, b.forceChance == null ? 100 : Number(b.forceChance))),
      };
    }
    W.save();
    return json(res, 200, { ok: true, overrides: r.zoneOverrides });
  }

  // ===== 假人 =====
  if (route === '/api/admin/bots' && req.method === 'POST') {
    const b = await readBody(req);
    const r = W.round();
    if (b.action === 'clear') {
      let removed = 0;
      for (const s of listSaves()) {
        if (s.char && s.char.bot) { deleteSave(s.user); removed++; }
      }
      return json(res, 200, { ok: true, removed });
    }
    const exist = listSaves().filter(s => s.char && s.char.bot).length;
    const want = Math.max(0, Math.min(BOT_MAX, Math.round(Number(b.n) || 0)));
    const add = Math.max(0, Math.min(BOT_MAX - exist, want));
    const NAMES = ['独狼', '夜枭', '铁皮', '老K', '麻雀', '灰狗', '断线', '北风', '药罐子', '三只手', '老鸦', '哑巴', '钉子', '石头', '哑火'];
    let made = 0;
    for (let i = 0; i < add; i++) {
      const nm = NAMES[Math.floor(Math.random() * NAMES.length)] + (i + 1);
      const c = G.createChar(nm);
      c.roundId = r.id;
      c.bot = true;
      c.attrs = {
        sta: 10 + Math.floor(Math.random() * 8), str: 10 + Math.floor(Math.random() * 8),
        cha: 10 + Math.floor(Math.random() * 8), int: 10 + Math.floor(Math.random() * 8),
        luk: 10 + Math.floor(Math.random() * 8),
      };
      c.hp = G.hpMax(c); c.ep = 100;
      c.pos = MAPD.MAP[Math.floor(Math.random() * MAPD.MAP.length)].id;
      c.scene = 'map'; c.pending = null;
      const bu = 'bot_' + Date.now().toString(36) + '_' + i + Math.floor(Math.random() * 1000);
      saveChar(bu, c);
      made++;
    }
    return json(res, 200, { ok: true, made, total: exist + made });
  }

  if (route === '/api/admin/player' && req.method === 'POST') {
    const b = await readBody(req);
    const target = b.username;
    const c = getChar(target);
    if (!c) return json(res, 404, { ok: false, msg: '玩家不存在。' });

    if (typeof b.hp === 'number') c.hp = Math.max(0, Math.min(G.hpMax(c), b.hp));
    if (typeof b.ep === 'number') c.ep = Math.max(0, Math.min(G.epMax(c), b.ep));
    if (typeof b.gold === 'number') c.gold = Math.max(0, Math.round(b.gold));
    if (typeof b.invincible === 'boolean') c.invincible = b.invincible;
    if (typeof b.alive === 'boolean') { c.alive = b.alive; if (b.alive && c.scene === 'dead') c.scene = 'map'; }
    if (b.pos && MAPD.BY_ID[b.pos]) c.pos = b.pos;
    if (b.attrs && typeof b.attrs === 'object') {
      for (const k of ['sta', 'str', 'cha', 'int', 'luk']) {
        if (typeof b.attrs[k] === 'number') c.attrs[k] = Math.max(1, Math.min(100, Math.round(b.attrs[k])));
      }
    }
    if (typeof b.name === 'string' && b.name.trim()) c.name = b.name.trim().slice(0, 12);
    if (b.resetScene) { c.scene = 'map'; c.pending = null; }
    saveChar(target, c);
    return json(res, 200, { ok: true, char: { hp: c.hp, ep: c.ep, gold: c.gold, invincible: c.invincible, attrs: c.attrs, pos: c.pos } });
  }

  if (route === '/api/admin/bag' && req.method === 'POST') {
    const b = await readBody(req);
    const target = b.username;
    const c = getChar(target);
    if (!c) return json(res, 404, { ok: false, msg: '玩家不存在。' });

    if (b.action === 'add') {
      const item = ITEMD.ITEMS[b.itemId];
      if (!item) return json(res, 400, { ok: false, msg: '物品不存在。' });
      const r = G.giveItem(c, b.itemId, Math.max(1, Math.min(999, b.n || 1)));
      if (!r.ok) return json(res, 400, { ok: false, msg: '背包放不下。' });
    } else if (b.action === 'remove') {
      G.takeItem(c, b.itemId, Math.max(1, b.n || 1));
    } else if (b.action === 'clear') {
      c.bag = [];
    } else if (b.action === 'clearAll') {
      c.bag = [];
      c.equip = { weapon: null, head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null };
    }
    saveChar(target, c);
    return json(res, 200, { ok: true, bag: c.bag, used: G.usedSlots(c), slots: G.slots(c) });
  }

  if (route === '/api/admin/gm' && req.method === 'POST') {
    const b = await readBody(req);
    const db2 = loadUsers();
    if (!db2.users[b.username]) return json(res, 404, { ok: false, msg: '账号不存在。' });
    db2.users[b.username].isGM = !!b.isGM;
    saveUsers(db2);
    return json(res, 200, { ok: true, isGM: db2.users[b.username].isGM });
  }

  if (route === '/api/admin/round' && req.method === 'POST') {
    const b = await readBody(req);
    if (b.action === 'start') {
      if (W.round().state === 'running') return json(res, 400, { ok: false, msg: '已经在跑。' });
      W.startRound('管理员');
    } else if (b.action === 'end') {
      W.endRound('manual', null);
    } else if (b.action === 'forceEnd') {
      W.round().state = 'running';
      W.endRound('manual', null);
    } else if (b.action === 'supply') {
      // 手动空投：管理员想立刻发一轮，不用等 10 分钟
      if (W.round().state !== 'running') return json(res, 400, { ok: false, msg: '本轮没在跑。' });
      const zone = b.zone ? (MAPD.BY_ID[b.zone] || null) : MAPD.MAP[Math.floor(Math.random() * MAPD.MAP.length)];
      if (!zone) return json(res, 400, { ok: false, msg: '区块不存在。' });
      W.get().supply = { zone: zone.id, until: Date.now() + 8 * 60000, epic: true };
      W.save();
      W.sys(`【空投】补给箱落在「${zone.name}」。`, 'win');
      W.sys(`【空投】重复一遍：补给箱在「${zone.name}」，里面必有一件史诗装备。`, 'win');
      W.sys(`【空投】最后提醒：「${zone.name}」，8 分钟内去探索就能翻到，去晚了就被别人拿走了。`, 'win');
      rlog('sys', '空投', `管理员手动空投 → ${zone.name}`);
      return json(res, 200, { ok: true, round: roundInfo(), zone: zone.name });
    } else if (b.action === 'market') {
      // 手动开黑市：演示 / 测试用，也可以指定区块
      if (W.round().state !== 'running') return json(res, 400, { ok: false, msg: '本轮没在跑。' });
      const zone = b.zone ? (MAPD.BY_ID[b.zone] || null) : MAPD.MAP[Math.floor(Math.random() * MAPD.MAP.length)];
      if (!zone) return json(res, 400, { ok: false, msg: '区块不存在。' });
      W.get().market = { zone: zone.id, until: Date.now() + 8 * 60000 };
      W.save();
      W.sys(`【黑市】有人在「${zone.name}」摆了摊，只收现金，只待 8 分钟。`, 'win');
      W.sys(`【黑市】重复一遍：「${zone.name}」。高级武器三倍价，还能雇人替你打一场。`, 'win');
      rlog('sys', '黑市', `管理员手动开市 → ${zone.name}`);
      return json(res, 200, { ok: true, round: roundInfo(), zone: zone.id, zoneName: zone.name });
    } else if (b.action === 'marketOff') {
      W.get().market = null;
      W.save();
      return json(res, 200, { ok: true });
    }
    return json(res, 200, { ok: true, round: roundInfo() });
  }

  if (route === '/api/admin/broadcast' && req.method === 'POST') {
    const b = await readBody(req);
    const text = sanitize(b.text, 200);
    if (!text) return json(res, 400, { ok: false, msg: '空消息。' });
    W.pushChat({ ch: 'public', from: '系统', text: '[广播] ' + text, kind: 'gm' });
    return json(res, 200, { ok: true });
  }

  if (route === '/api/admin/password' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.password || String(b.password).length < 4) return json(res, 400, { ok: false, msg: '密码至少 4 位。' });
    ADMIN.password = String(b.password);
    writeJSON(ADMIN_FILE, ADMIN);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { ok: false, msg: 'not found' });
}

// 包一层：慢请求、抛错都进运行日志，后台「日志」页能看到
const server = http.createServer((req, res) => {
  const t0 = Date.now();
  handleReq(req, res)
    .catch(e => {
      rlog('error', '请求异常', `${req.method} ${req.url} → ${(e && e.message) || e}`, e && e.stack);
      try { json(res, 500, { ok: false, msg: '服务器内部错误。' }); } catch (e2) { /* 已经发过头了 */ }
    })
    .finally(() => {
      const ms = Date.now() - t0;
      if (ms >= 200) rlog('warn', '慢请求', `${req.method} ${req.url.split('?')[0]} 用了 ${ms}ms`);
    });
});

// 超时参数：默认值在反代后面容易出 502，明确设一下
server.keepAliveTimeout = 65000;   // 要比上游反代（Nginx/OrbStack）长
server.headersTimeout = 66000;
server.requestTimeout = 30000;     // 单个请求最多 30 秒，挡住慢速攻击

// ---------- 启动 ----------
W.load();
bootLog('世界状态载入完成');
// 存储载入内存（一次性，之后所有读写都走内存）
{
  const st = loadAllStorage();
  bootLog(`存储载入完成：${st.saves} 存档 / ${st.users} 账号`);
  rlog('sys', '存储', `载入 ${st.saves} 个存档 / ${st.users} 个账号到内存`);
}
// 每 2 秒把脏数据落盘；没改动就零 IO
const storageTimer = setInterval(() => { flushStorage().catch(e => rlog('error', '落盘', e.code || e.message)); }, 2000);
const BUILD_VERSION = (assetMeta('app.js') || {}).ver || '?';
for (const name of ['index.html', 'style.css', 'pixel.js', 'admin.html']) assetMeta(name);
// 退出前必须刷一次，否则最后 2 秒的操作会丢
function flushAndExit(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(storageTimer);
  W.stopTimer();
  const deadline = setTimeout(() => { console.error('[storage] shutdown timeout'); process.exit(1); }, 15000);
  server.close(async () => {
    try {
      if (sessTimer) { clearTimeout(sessTimer); sessTimer = null; }
      persistSessions();          // 会话也要落盘，否则重启后这批人掉线
      await flushStorage();
      // 接入已关闭；若上一批写盘期间有更新，再保存到所有版本均确认。
      while (DIRTY.size || usersDirty) await flushStorage();
      await DISK.drain(12000);
      clearTimeout(deadline);
      process.exit(0);
    } catch (e) {
      console.error('[storage] shutdown failed', e.code || e.message);
      process.exit(1);
    }
  });
}
process.on('SIGINT', () => flushAndExit('SIGINT'));
process.on('SIGTERM', () => flushAndExit('SIGTERM'));
// SIGINT/SIGTERM 会先停止接入，再等待异步保存；SIGKILL 无法保证未落盘数据。
// 全服广播同时写进运行日志（开局 / 空投 / BOSS / 结束 / 死亡）
W.setLogHook((text, kind) => {
  rlog(kind === 'warn' ? 'warn' : (kind === 'death' ? 'warn' : 'sys'), '全服', text);
});
// 45 分钟到点时判断要不要延长：只数本轮还活着、还没结算的真人（假人不算）
W.setAliveCheck(() => {
  try {
    const rid = W.round().id;
    return listSaves().filter(x =>
      x.char && x.char.roundId === rid && x.char.alive !== false
      && x.char.scene !== 'dead' && x.char.scene !== 'settled' && !x.char.bot
    ).length;
  } catch (e) { return 0; }
});
W.startTimer();


// 假人：每 10 秒动一动、回点血，看起来像真的在跑图
// ---------- 假人 ----------
// 上限 50 个。假人不自己写一套规则，直接调 G.act —— 跟真人走完全相同的逻辑，
// 所以探索、遭遇、战斗、拾取、开箱、升级、掉血全都真实发生。
const BOT_MAX = 50;

function botMed(c) {
  for (const it of c.bag || []) {
    const d = ITEMD.ITEMS[it.id];
    if (d && d.type === 'med') return it.id;
  }
  return null;
}

// 空手时从背包里装一把武器
function botNeedWeapon(c) {
  if (c.equip && c.equip.weapon) return null;
  for (const it of c.bag || []) {
    const d = ITEMD.ITEMS[it.id];
    if (d && d.slot === 'weapon') return it.id;
  }
  return null;
}

// 走一步：朝「更有价值」的相邻区块偏一点，别纯随机乱晃
function botMove(c) {
  const z = MAPD.BY_ID[c.pos];
  if (!z) return null;
  const nb = MAPD.neighbors(z.x, z.y);
  if (!nb.length) return null;
  // 危险越高物资越多，但假人也会怕死：血少时往低危险走
  const hpPct = G.hpMax(c) ? (c.hp || 0) / G.hpMax(c) : 1;
  const scored = nb.map(t => {
    let w = t.loot * 2 + t.danger;
    if (hpPct < 0.5) w -= t.danger * 2;
    return { t, w: Math.max(1, w) };
  });
  const total = scored.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const it of scored) { r -= it.w; if (r <= 0) return G.act(c, 'move', { x: it.t.x, y: it.t.y }); }
  const t = scored[0].t;
  return G.act(c, 'move', { x: t.x, y: t.y });
}

// 一步决策：先把眼前的事处理掉，再考虑探索
function botStep(c) {
  const hpMax = G.hpMax(c) || 1;
  const hpPct = (c.hp || 0) / hpMax;
  const ep = c.ep || 0;

  switch (c.scene) {
    case 'dead': case 'settled': case 'sevenwin': return null;
    case 'encounter':
      return G.act(c, 'encounter', { choice: hpPct > 0.5 ? 'fight' : 'spare' });
    case 'battle': {
      if (hpPct < 0.28) return G.act(c, 'battle', { choice: 'flee' });
      if (hpPct < 0.5) {
        const med = botMed(c);
        if (med) return G.act(c, 'battle', { choice: 'item', itemId: med });
      }
      return G.act(c, 'battle', { choice: 'attack' });
    }
    case 'loot': return G.act(c, 'loot', { all: true });
    case 'box': return G.act(c, 'box', { all: true });
    case 'hostage': return G.act(c, 'hostage', { choice: 'ask' });
    case 'npc': return G.act(c, 'npc', { choice: 'leave' });
    case 'sevenwa': return G.act(c, 'sevenwa', { choice: 'talk' });
    case 'liuying': return G.act(c, 'liuying', { choice: 'talk' });
    case 'map': break;
    default: return G.act(c, 'close');   // 未知场景兜底，防止卡死
  }

  // 血少先想办法活下来
  if (hpPct < 0.45) {
    const med = botMed(c);
    if (med) return G.act(c, 'use', { itemId: med });
    if (ep < 20) return G.act(c, 'rest');
  }
  if (ep < 10) return G.act(c, 'rest');

  // 空手先装武器
  const w = botNeedWeapon(c);
  if (w) return G.act(c, 'equip', { itemId: w });

  // 主要行为：探索为主，偶尔换地方
  if (Math.random() < 0.65) return G.act(c, 'explore');
  return botMove(c) || G.act(c, 'explore');
}

function tickBots() {
  if (shuttingDown) return;
  try {
    const r = W.round();
    if (r.state !== 'running') return;
    for (const s of listSaves()) {
      if (!s.char || !s.char.bot || s.char.roundId !== r.id) continue;
      const c = s.char;
      if (c.alive === false || c.scene === 'dead') continue;
      try {
        botStep(c);
        // 假人打真人时的回写：跟 /api/action 里那段保持一致
        if (c._pvpResult) {
          try { applyPvp(c, c._pvpResult); } catch (e) { /* ignore */ }
          delete c._pvpResult;
        }
        // 死了就别再动了
        if (c.hp <= 0) { c.hp = 0; c.alive = false; c.scene = 'dead'; }
      } catch (e) { /* 单个假人出错不影响其他人 */ }
      writeSave(s.user, s);
    }
  } catch (e) { /* ignore */ }
}

// 每 10 秒刷新一次「本轮在线人数」，用来动态稀释七娃/刘颖事件
function refreshOnline() {
  try {
    const r = W.round();
    const n = listSaves().filter(s => s.char && s.char.roundId === r.id
      && s.char.alive !== false && s.char.scene !== 'dead'
      && !s.char.bot
      && !(s.char.flags && s.char.flags.settled)).length;
    W.setOnline(n);
  } catch (e) { /* ignore */ }
}
refreshOnline();
tickBots();
sampleMem();
setInterval(() => { refreshOnline(); tickBots(); }, 10000);
setInterval(sampleMem, 5000);
// 每小时清一次过期会话 / 管理员 token / 限流记录，防止 Map 无限增长
setInterval(() => {
  const now = Date.now();
  let expired = 0;
  for (const [t, at] of [...sessionAt]) {
    if (now - at > SESSION_TTL) { sessions.delete(t); sessionAt.delete(t); expired++; }
  }
  if (expired) persistSessions();
  for (const [t, at] of adminTokens) if (now - at > ADMIN_TTL) adminTokens.delete(t);
  for (const [k, g] of loginGuard) {
    if ((!g.lockUntil || now > g.lockUntil) && now - g.first > LOGIN_WINDOW) loginGuard.delete(k);
  }
  for (const [u, at] of chatLast) if (now - at > 3600000) chatLast.delete(u);
}, 3600 * 1000);
// 回收站清理：启动先扫一次（上次没删完的），之后每分钟一次，全程异步不阻塞
sweepTrash();
setInterval(sweepTrash, 60000);
rlog('sys', '服务', `启动完成 · 端口 ${PORT} · Node ${process.version} · 存档 ${(() => { try { return listSaves().length; } catch (e) { return '?'; } })()} 个`);

// HOST 默认只听本机；容器里必须设 HOST=0.0.0.0，否则 -p 端口映射进不来
const HOST = process.env.HOST || '127.0.0.1';
bootLog(`开始监听 ${HOST}:${PORT}`);
// 监听失败必须显式退出：否则异常被 uncaughtException 吞掉，
// 表现就是「容器 Up、日志正常、但端口没开」，极难排查
server.on('error', e => {
  console.error(`[boot] ❌ 监听 ${HOST}:${PORT} 失败：${e.code} ${e.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`江汉BR 已启动 → http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`);
  console.log(`后台管理   → http://127.0.0.1:${PORT}/admin.html  （密码见 store/admin.json）`);
  console.log(`数据目录：${STORE}`);
  console.log(`当前轮次：${W.round().state} #${W.round().id}`);
});
