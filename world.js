// 江汉BR —— 世界状态：轮次、聊天、全局设置
const fs = require('fs');
const path = require('path');
const WEATHERD = require('./data/weather');
const MAPD = require('./data/map');

const STORE = path.join(__dirname, 'store');
const WORLD_FILE = path.join(STORE, 'world.json');

const ROUND_MS = 45 * 60 * 1000;   // 标准时长 45 分钟
const HARD_MS = 60 * 60 * 1000;    // 45 分钟到了还有人活着，延长到 60 分钟
const CHAT_MAX = 400;

let W = null;
let endHandler = null;
let aliveCheck = null;   // 由 server 注入：本轮还有几个活人
let timer = null;

function defaults() {
  return {
    round: {
      id: 0,
      state: 'idle',            // idle | running | ended
      startedAt: null,
      endsAt: null,
      hardEndsAt: null,
      extended: false,
      winner: null,             // { username, name, reason }
      endReason: null,          // boss | sevenwa | wiped | timeout | manual
      bossKilled: false,
      bossSpawned: false,       // 30 分钟后 BOSS 才登场
    },
    weather: { type: 'clear', until: 0 },
    supply: null,               // { zone, until } 空投补给箱
    nextSupplyAt: 0,
    settings: {
      lootRate: 1,              // 掉落倍率
      goldRate: 1,              // 金币收益倍率
      bossHp: 420,              // 最终 BOSS 血量
      bossAtk: 34,
      autoStart: true,          // 玩家主动点开局时是否允许开新轮（后台可关）
      moveCost: 4,              // 移动精力消耗
      exploreCost: 3,           // 探索精力消耗
      encounterMul: 1,          // 遭遇概率倍率（0.5 = 一半，2 = 翻倍）
      mineMul: 1,               // 地雷伤害倍率
      shopMul: 1,               // 商人价格倍率
      startGold: 100,           // 初始金币
      statusMs: 300000,         // 状态持续时间（毫秒）
      bossEnabled: true,        // 是否启用最终 BOSS
      sevenWaChance: 20,        // 七娃跟随概率（%）
      specialScale: 1,          // 七娃/刘颖事件权重倍率（全局）
      onlineAware: true,        // 按在线人数自动稀释七娃/刘颖事件
      pvpChance: 45,            // 同区块有真人时，遭遇战变成玩家对战的概率（%）
    },
    chat: [],
    nextChatId: 1,
    history: [],
  };
}

function load() {
  fs.mkdirSync(STORE, { recursive: true });
  try {
    W = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
    const d = defaults();
    W.round = Object.assign(d.round, W.round || {});
    W.settings = Object.assign(d.settings, W.settings || {});
    W.chat = W.chat || [];
    W.history = W.history || [];
    W.nextChatId = W.nextChatId || 1;
    W.weather = Object.assign({ type: 'clear', until: 0 }, W.weather || {});
    W.supply = W.supply || null;
    W.nextSupplyAt = W.nextSupplyAt || 0;
  } catch (e) {
    W = defaults();
  }
  // 服务重启后，如果上一轮还在跑，按时间重新判定
  if (W.round.state === 'running') {
    const now = Date.now();
    if (now >= W.round.hardEndsAt) {
      W.round.state = 'ended';
      W.round.endReason = 'timeout';
    }
  }
  return W;
}

function save() {
  try { fs.writeFileSync(WORLD_FILE, JSON.stringify(W, null, 2), 'utf8'); } catch (e) { console.error('world save fail', e.message); }
}

function ensure() { if (!W) load(); return W; }
function get() { return ensure(); }
function settings() { return ensure().settings; }
// 当前在线人数（由 server 每 10 秒刷新一次，用于动态稀释特殊事件）
function setOnline(n) { ensure().online = Math.max(1, n | 0); }
function online() { return Math.max(1, ensure().online || 1); }
function round() { return ensure().round; }

// ---------- 聊天 ----------
function pushChat(msg) {
  const m = {
    id: W.nextChatId++,
    ch: msg.ch || 'public',      // public | zone | private
    from: msg.from || '系统',
    to: msg.to || null,
    text: String(msg.text || '').slice(0, 300),
    zone: msg.zone || null,
    kind: msg.kind || 'say',     // say | sys | gm | death | win
    at: Date.now(),
  };
  W.chat.push(m);
  if (W.chat.length > CHAT_MAX) W.chat = W.chat.slice(-CHAT_MAX);
  save();
  return m;
}

// 所有全服广播都从这里出去。server 注入一个 hook，把广播同时写进运行日志，
// 这样后台「日志」页能看到开局 / 空投 / BOSS / 结束这些关键事件。
let logHook = null;
function setLogHook(fn) { logHook = fn; }

function sys(text, kind) {
  if (logHook) { try { logHook(text, kind || 'sys'); } catch (e) { /* 日志失败不能影响游戏 */ } }
  return pushChat({ ch: 'public', from: '系统', text, kind: kind || 'sys' });
}

// 取消息：公共 + 自己的区块 + 自己的私聊
function getChat(since, username, zoneId) {
  const out = W.chat.filter(m => {
    if (m.id <= since) return false;
    if (m.ch === 'public') return true;
    if (m.ch === 'zone') return m.zone === zoneId;
    if (m.ch === 'private') return m.from === username || m.to === username;
    return false;
  });
  return out.slice(-120);
}

// ---------- 轮次 ----------
function startRound(by) {
  const now = Date.now();
  W.round = {
    id: W.round.id + 1,
    state: 'running',
    startedAt: now,
    endsAt: now + ROUND_MS,
    hardEndsAt: now + HARD_MS,
    extended: false,
    winner: null,
    endReason: null,
    bossKilled: false,
    bossSpawned: false,
    warned5: false,      // 结束前 5 分钟是否已经预警过
    zoneOverrides: {},   // 本轮单区块控制：{ zid: { lootMul, force, forceChance } }
  };
  // 开局定一个天气，并安排第一次空投
  const w = WEATHERD.rollWeather(null);
  W.weather = { type: w.id, until: now + (7 + Math.random() * 3) * 60000 };
  W.supply = null;
  W.nextSupplyAt = now + 10 * 60000;   // 开局 10 分钟后第一次空投
  W.chat = [];            // 新一轮清空聊天
  W.nextChatId = 1;
  save();
  sys(`第 ${W.round.id} 轮开始。${by ? '（由 ' + by + ' 启动）' : ''}45 分钟内结束，还有人就延长到 60 分钟。`, 'sys');
  sys(`天气：${w.name}。${w.desc}${w.tip ? '（' + w.tip + '）' : ''}`, 'sys');
  sys('十号地集合。广华寺方向有东西在等着你们。', 'sys');
  return W.round;
}

function weatherNow() { return WEATHERD.get(W.weather.type); }

function endRound(reason, winner) {
  if (W.round.state !== 'running') return W.round;
  W.round.state = 'ended';
  W.round.endReason = reason;
  W.round.winner = winner || null;
  save();

  const label = {
    boss: '最终 BOSS 被击杀',
    sevenwa: '有人带着七娃离开了油田',
    wiped: '所有参与者都已出局',
    timeout: '时间到',
    manual: '被管理员提前结束',
  }[reason] || reason;

  sys(`第 ${W.round.id} 轮结束：${label}。`, 'win');
  if (winner) sys(`本轮胜者：${winner.name || winner.username}。`, 'win');

  if (endHandler) { try { endHandler(W.round, reason); } catch (e) { console.error('end handler', e); } }
  return W.round;
}

function onEnd(fn) { endHandler = fn; }
// server 注入：本轮还有几个活人（45 分钟到点时决定延不延长）
function setAliveCheck(fn) { aliveCheck = fn; }

function tick() {
  if (W.round.state !== 'running') return;
  const now = Date.now();

  // ===== 天气切换 =====
  if (now >= (W.weather.until || 0)) {
    const w = WEATHERD.rollWeather(W.weather.type);
    W.weather = { type: w.id, until: now + (7 + Math.random() * 3) * 60000 };
    save();
    sys(`天气转为「${w.name}」。${w.desc}${w.tip ? '（' + w.tip + '）' : ''}`, 'sys');
  }

  // ===== 空投补给：每 10 分钟一轮，公屏连发三遍，地点随机 =====
  if (now >= (W.nextSupplyAt || 0)) {
    W.nextSupplyAt = now + 10 * 60000;
    const zone = MAPD.MAP[Math.floor(Math.random() * MAPD.MAP.length)];
    W.supply = { zone: zone.id, until: now + 8 * 60000, epic: true };
    save();
    // 连发三遍：公屏滚得快，一条容易被人漏掉
    sys(`【空投】补给箱落在「${zone.name}」。`, 'win');
    sys(`【空投】重复一遍：补给箱在「${zone.name}」，里面必有一件史诗装备。`, 'win');
    sys(`【空投】最后提醒：「${zone.name}」，8 分钟内去探索就能翻到，去晚了就被别人拿走了。`, 'win');
  }
  if (W.supply && now >= W.supply.until) {
    const z = MAPD.BY_ID[W.supply.zone];
    W.supply = null;
    save();
    if (z) sys(`「${z.name}」的补给箱没人动，已经被收走了。`, 'sys');
  }

  // ===== 结束前 5 分钟预警 =====
  // 结算画面会盖住公屏，所以必须提前喊一嗓子
  if (!W.round.warned5) {
    const endAt = W.round.extended ? W.round.hardEndsAt : W.round.endsAt;
    if (now >= endAt - 5 * 60000 && now < endAt) {
      W.round.warned5 = true;
      save();
      sys('【倒计时】还有 5 分钟，这一轮就要结束了。没做完的事抓紧。', 'warn');
    }
  }

  // ===== 30 分钟：BOSS 登场 =====
  if (!W.round.bossSpawned && now >= W.round.startedAt + 30 * 60000) {
    W.round.bossSpawned = true;
    save();
    sys('广播响了。这一次不是念编号。', 'win');
    sys('「广播员」出现在「广华寺」的钟楼。谁先杀了他，这一轮就结束。', 'win');
  }

  if (!W.round.extended && now >= W.round.endsAt) {
    // 45 分钟到：还有人活着才延长，没人了就直接结束，别让空局白跑 15 分钟
    const alive = aliveCheck ? aliveCheck() : 0;
    if (alive > 0) {
      W.round.extended = true;
      W.round.warned5 = false;   // 延长后重新计 5 分钟预警
      save();
      sys(`45 分钟到。地图里还有 ${alive} 个人活着，延长到 60 分钟。`, 'sys');
    } else {
      sys('45 分钟到。地图里已经没有人了。', 'sys');
      endRound('timeout', null);
      return;
    }
  }
  if (now >= W.round.hardEndsAt) {
    endRound('timeout', null);
  }
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 5000);
}

// ---------- 排行榜 ----------
function pushHistory(entry) {
  W.history.unshift(entry);
  if (W.history.length > 50) W.history = W.history.slice(0, 50);
  save();
}

module.exports = {
  load, save, get, settings, round,
  pushChat, sys, getChat,
  startRound, endRound, onEnd, setAliveCheck, setLogHook, startTimer, tick, setOnline, online,
  pushHistory, weatherNow,
  ROUND_MS, HARD_MS,
};
