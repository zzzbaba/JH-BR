// 江汉BR —— 核心游戏逻辑
const MAPD = require('./data/map');
const ITEMD = require('./data/items');
const { RECIPES } = require('./data/recipes');
const { ENEMIES, LOOT_TABLE } = require('./data/enemies');
const EV = require('./data/events');
const { ACHIEVEMENTS } = require('./data/achievements');
const SHOP = require('./data/shop');
const { FINAL_BOSS, BOSS_LOOT } = require('./data/boss');
const { STATUS, STATUS_MS, STATUS_ITEMS, CURE_ITEMS } = require('./data/status');
const { SEVEN_WA, LIUYING, QUIZ } = require('./data/special');
const NPCD = require('./data/npcs');
const W = require('./world');

const ITEMS = ITEMD.ITEMS;
const FIRE_MODES = ITEMD.FIRE_MODES;
const ATTRS = ['sta', 'str', 'cha', 'int', 'luk'];
const ATTR_CN = { sta: '体力', str: '武力', cha: '魅力', int: '智力', luk: '幸运' };
// 属性用途说明：悬停在属性行 / 增益道具上时展示，避免「幸运 +8」但没人知道幸运干嘛
const ATTR_TIPS = {
  sta: '决定血量上限：55 + 体力 × 1.8。',
  str: '决定伤害：每点约 +0.67%（1 + 武力/150）。',
  cha: '决定交涉成功率：放我一马、带走人质。',
  int: '决定合成成功率：30 + 智力×0.7 - 配方难度×8，智力 100 必成。',
  luk: '影响命中、暴击率、逃跑成功率，还会降低遭遇和地雷的概率。',
};
const SLOT_CN = { weapon: '武器', head: '头盔', body: '装甲', hands: '手套', legs: '裤子', face: '面具', feet: '鞋子', bag: '背包' };
const BASE_SLOTS = 32;

// ---------- 随机 ----------
const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rf = (a, b) => Math.random() * (b - a) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 属性 ----------
function attr(c, k) {
  const base = c.attrs[k] || 0;
  const buff = (c.buffs && c.buffs[k]) || 0;
  let tmp = 0;
  const tb = c.tempBuffs && c.tempBuffs[k];
  if (tb && Date.now() < tb.until) tmp = tb.v;
  return clamp(base + buff + tmp, 1, 100);
}
// 装备提供的属性加成
function gearBonus(c, k) {
  let b = 0;
  for (const slot in c.equip) {
    const it = c.equip[slot];
    if (!it) continue;
    // 强化词条：+2 起带的随机属性，只算穿在身上的
    if (it.affix) {
      for (const a of it.affix) if (a.k === k) b += a.v;
    }
    const d = ITEMS[it.id];
    if (!d) continue;
    if (k === 'luk' && d.lukBonus) b += d.lukBonus;
  }
  // 护身符这类「放在背包里就生效」的配件，以前完全没算，写着 +8 幸运实际是 0
  for (const it of (c.bag || [])) {
    const d = ITEMS[it.id];
    if (d && k === 'luk' && d.lukBonus) b += d.lukBonus;
  }
  return b;
}
function effAttr(c, k) { return clamp(attr(c, k) + gearBonus(c, k), 1, 100); }

// 属性增长：任一项到 100 后，其它属性不可再增加
function gainAttr(c, k, n) {
  if (!ATTRS.includes(k) || n <= 0) return { ok: false, msg: '' };
  if (c.attrs[k] >= 100) return { ok: false, msg: `${ATTR_CN[k]}已达上限 100，无法再提升。` };
  const maxed = ATTRS.find(a => a !== k && c.attrs[a] >= 100);
  if (maxed) return { ok: false, msg: `${ATTR_CN[maxed]}已达 100，其他属性无法再增加。` };
  const before = c.attrs[k];
  c.attrs[k] = Math.min(100, before + n);
  const msg = `${ATTR_CN[k]} +${c.attrs[k] - before}（${before} → ${c.attrs[k]}）`;
  return { ok: true, msg };
}

// ---------- 生命 / 精力 ----------
function hpMax(c) { return Math.floor(55 + effAttr(c, 'sta') * 1.8); }
function epMax(c) { return 100; }
function clampVitals(c) {
  c.hp = clamp(Math.round(c.hp), 0, hpMax(c));
  c.ep = clamp(Math.round(c.ep), 0, epMax(c));
}

// ---------- 背包 ----------
function slots(c) {
  const bag = c.equip.bag ? ITEMS[c.equip.bag.id] : null;
  return BASE_SLOTS + (bag && bag.bagBonus ? bag.bagBonus : 0);
}
function usedSlots(c) {
  return c.bag.reduce((s, it) => {
    const d = ITEMS[it.id];
    return s + (d ? d.size : 1);
  }, 0);
}
function addItem(c, id, n = 1) {
  const d = ITEMS[id];
  if (!d) return { ok: false, added: 0 };
  let added = 0;
  // 先堆叠
  for (const it of c.bag) {
    if (it.id === id && it.n < d.stack) {
      const can = Math.min(d.stack - it.n, n - added);
      it.n += can; added += can;
      if (added >= n) break;
    }
  }
  // 再开新格
  while (added < n) {
    if (usedSlots(c) + d.size > slots(c)) break;
    const can = Math.min(d.stack, n - added);
    c.bag.push({ id, n: can });
    added += can;
  }
  return { ok: added > 0, added };
}
function countItem(c, id) {
  return c.bag.filter(i => i.id === id).reduce((s, i) => s + i.n, 0);
}

// 背包还塞得下 n 个 id 吗（算上现有堆叠的空位 + 空格）
// 规则和 addItem 保持一致，别各写一套，否则会「预检说能放、实际放不进」
function canFit(c, id, n = 1) {
  const d = ITEMS[id];
  if (!d) return false;
  let room = 0;
  for (const it of c.bag) {
    if (it.id === id && it.n < d.stack) room += d.stack - it.n;
  }
  const size = d.size || 1;
  const free = Math.max(0, slots(c) - usedSlots(c));
  room += Math.floor(free / size) * d.stack;
  return room >= n;
}
function removeItem(c, id, n = 1) {
  let need = n;
  for (let i = c.bag.length - 1; i >= 0 && need > 0; i--) {
    if (c.bag[i].id !== id) continue;
    const take = Math.min(c.bag[i].n, need);
    c.bag[i].n -= take; need -= take;
    if (c.bag[i].n <= 0) c.bag.splice(i, 1);
  }
  return need === 0;
}

// ---------- 日志 ----------
function log(c, text, kind = 'info') {
  if (!c.log) c.log = [];
  c.log.push({ t: Date.now(), text, kind });
  if (c.log.length > 120) c.log = c.log.slice(-120);
}

// ---------- 创建角色 ----------
function createChar(name) {
  const attrs = {};
  ATTRS.forEach(k => { attrs[k] = ri(8, 18); });
  const cfg = W.settings();
  const c = {
    name: name || '幸存者',
    attrs,
    buffs: {},
    hp: 0, ep: 100,
    gold: (cfg.startGold != null ? cfg.startGold : 100),
    invincible: false,
    status: { type: 'normal', until: 0 },
    frozenUntil: 0,
    career: { sevenWa: 0 },
    equip: { weapon: null, head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null },
    bag: [],
    pos: MAPD.SPAWN_ID,
    turn: 0,
    kills: 0,
    level: 1,
    exp: 0,
    alive: true,
    flags: { mapUnlocked: false, bossDefeated: false },
    achievements: {},
    // 只记「本轮真正拿到的」称号：跨轮成就（careerOnly）不进这里，
    // 否则老兵开局就白拿几十点排名分，新手永远追不上
    roundTitles: {},
    stats: {
      kills: 0, crafts: 0, savedHostages: 0, songs: 0,
      trades: 0, bossKills: 0, bought: 0, sold: 0, goldEarned: 0, moves: 0,
      crits: 0, fistKills: 0, drunk: 0, liuying: 0,
    },
    hostages: [],
    npcFavor: {},
    npcTalkTurn: {},
    npcRewarded: {},
    roundId: null,
    log: [],
    scene: 'map',
    pending: null,
  };
  c.hp = hpMax(c);
  // 初始武器直接装上，避免开局赤手空拳
  c.equip.weapon = { id: 'w05' };
  addItem(c, 'med01', 3);
  addItem(c, 'm_cloth', 3);
  addItem(c, 'm_bottle', 1);
  addItem(c, 'med08', 1);
  log(c, `广播响了。你的编号被念到，然后是一句"祝各位好运"。`, 'sys');
  log(c, `你被投放在${MAPD.BY_ID[c.pos].name}。包里有一把匕首、几卷绷带、一百块钱。`, 'sys');
  // 跨轮次已经达成的称号（带他回家 N 次之类）开局直接标记为已解锁，
  // 不弹「解锁称号」提示——否则新开一局点一下就被刷屏
  syncCareerAchievements(c);
  return c;
}

// 把「靠跨轮数据已经满足」的称号静默标记为已解锁，不写日志、不返回给前端
function syncCareerAchievements(c) {
  if (!c.achievements) c.achievements = {};
  for (const a of ACHIEVEMENTS) {
    if (c.achievements[a.id]) continue;
    let hit = false;
    try { hit = !!a.check(c); } catch (e) { hit = false; }
    if (hit) c.achievements[a.id] = Date.now();
  }
  return c;
}

// 旧存档补齐新字段
function migrateChar(c) {
  if (!c) return c;
  // 老存档没有 roundTitles：按「已有的非跨轮称号」补一份，跨轮的里程碑不算
  if (!c.roundTitles) {
    c.roundTitles = {};
    for (const a of ACHIEVEMENTS) {
      if (a.careerOnly) continue;
      if (c.achievements && c.achievements[a.id]) c.roundTitles[a.id] = c.achievements[a.id];
    }
  }
  // 老存档里强化过的装备没有附魔词条：按「名字+物品+等级」确定性补上，
  // 不能用 Math.random，否则每次刷新词条都不一样
  const fillAffix = e => {
    if (!e || !e.id) return;
    const p = plusOf(e);
    if (p < 2) return;
    if (e.affix && e.affix.length) return;
    const d = ITEMS[e.id];
    if (!d || (d.type !== 'weapon' && d.type !== 'armor')) return;
    const seed = (c.name || '') + '|' + e.id + '|' + p;
    e.affix = seededAffix(seed, p === 2 ? 1 : 2, p === 2 ? 3 : 5, p === 2 ? 6 : 10);
  };
  for (const slot in c.equip) fillAffix(c.equip[slot]);
  if (Array.isArray(c.bag)) c.bag.forEach(fillAffix);
  if (typeof c.gold !== 'number') c.gold = 100;
  if (typeof c.invincible !== 'boolean') c.invincible = false;
  if (!c.achievements) c.achievements = {};
  if (!c.hostages) c.hostages = [];
  if (typeof c.roundId === 'undefined') c.roundId = null;
  const base = { kills: 0, crafts: 0, savedHostages: 0, songs: 0, trades: 0, bossKills: 0, bought: 0, sold: 0, goldEarned: 0, moves: 0, crits: 0, fistKills: 0, drunk: 0, liuying: 0 };
  c.stats = Object.assign(base, c.stats || {});
  if (!c.flags) c.flags = {};
  if (typeof c.flags.bossDefeated !== 'boolean') c.flags.bossDefeated = false;
  if (!c.status) c.status = { type: 'normal', until: 0 };
  if (typeof c.frozenUntil !== 'number') c.frozenUntil = 0;
  if (!c.career) c.career = { sevenWa: 0 };
  if (typeof c.career.sevenWa !== 'number') c.career.sevenWa = 0;
  // 武器实例补齐耐久与改装槽
  if (c.equip && c.equip.weapon && c.equip.weapon.id) {
    const d = ITEMS[c.equip.weapon.id];
    if (d) {
      if (typeof c.equip.weapon.dur !== 'number') c.equip.weapon.dur = d.maxDur || 100;
      if (!c.equip.weapon.mods) c.equip.weapon.mods = { sight: null, muzzle: null, grip: null };
    }
  }
  if (!c.npcFavor) c.npcFavor = {};
  if (!c.npcTalkTurn) c.npcTalkTurn = {};
  if (!c.npcRewarded) c.npcRewarded = {};
  if (typeof c.level !== 'number') c.level = 1;
  if (typeof c.exp !== 'number') c.exp = 0;
  return c;
}

// ---------- 状态 ----------
function currentStatus(c) {
  const s = c.status || { type: 'normal', until: 0 };
  if (!s.type || s.type === 'normal') return STATUS.normal;
  if (Date.now() > (s.until || 0)) {
    c.status = { type: 'normal', until: 0 };
    return STATUS.normal;
  }
  return STATUS[s.type] || STATUS.normal;
}

function setStatus(c, type) {
  if (type === 'normal') { c.status = { type: 'normal', until: 0 }; return STATUS.normal; }
  const ms = W.settings().statusMs || STATUS_MS;
  c.status = { type, until: Date.now() + ms };
  if (type === 'frozen') c.frozenUntil = Date.now() + (STATUS.frozen.freezeMs || 10000);
  return STATUS[type] || STATUS.normal;
}

function clearStatus(c, list) {
  const cur = currentStatus(c);
  if (!list || list.includes(cur.id) || cur.id === 'normal') {
    c.status = { type: 'normal', until: 0 };
    c.frozenUntil = 0;
    return true;
  }
  return false;
}

// 中毒：每次移动/探索扣当前血量与精力的 20%
function applyDrain(c) {
  const st = currentStatus(c);
  if (!st.drainPct) return 0;
  const hpLoss = Math.max(1, Math.round(c.hp * st.drainPct));
  const epLoss = Math.max(1, Math.round(c.ep * st.drainPct));
  c.hp -= hpLoss;
  c.ep = Math.max(0, c.ep - epLoss);
  log(c, `毒性发作，生命 -${hpLoss}，精力 -${epLoss}。`, 'bad');
  checkDeath(c);
  return hpLoss;
}

// ---------- 掉落 / 宝箱 ----------
// 史诗装备（rarity 5 的武器/防具）：空投箱必出一件
const EPIC_GEAR = Object.values(ITEMS)
  .filter(d => (d.type === 'weapon' || d.type === 'armor') && d.rarity >= 5)
  .map(d => d.id);
function pickEpicGear() {
  return EPIC_GEAR.length ? pick(EPIC_GEAR) : null;
}

// ---------- 排名评分 ----------
// 旧排序是「BOSS > 存活 > 击杀 > 回合」，结果死了的高杀玩家全排到活人后面：
// 41 杀 114 回合的 MVP 排到倒数第二，因为「alive」这一项是 0。
// 改成加权打分，击杀最重、存活时间次之，称号 / BOSS / 胜利 / 孩子再叠加。
// 排名权重（2026-10-20 重做）
// 原则：大逃杀「名次/成长为主，击杀为辅」，同时给新手一条非战斗的得分路。
// 以前击杀×10 是绝对主项（16 杀就占 40% 分），新手一局下来完全没戏。
const RANK_WEIGHT = {
  turn: 0.8,       // 每回合（存活时间），封顶 turnCap
  turnCap: 50,     // 防止挂机无限涨
  level: 8,        // 每级（本轮成长）
  title: 10,       // 每个「本轮拿到的」称号
  kill: 5,         // 每击杀 1 人
  moves: 0.4,      // 每移动一次（必须动起来才有，挂机拿不到）
  craft: 3,        // 每成功合成一次
  gold: 0.02,      // 金币（50 块 = 1 分）
  alive: 30,       // 活到最后
  boss: 150,       // 击杀最终 BOSS
  sevenwa: 400,    // 本轮带七娃回家
  song: 5,         // 每首歌 / 每个故事
  hostage: 6,      // 救下的每个人质
};

function scoreOf(c) {
  const s = c.stats || {};
  const kills = s.kills != null ? s.kills : (c.kills || 0);
  // ⚠️ 只认本轮拿到的称号。用 c.achievements 会把跨轮里程碑（七娃 3/5/10 次）
  // 也算进来，等于老兵开局白拿 30 分，新手永远追不上。
  const titles = Object.keys(c.roundTitles || {}).length;
  const parts = {
    turn: Math.round(Math.min(RANK_WEIGHT.turnCap, (c.turn || 0) * RANK_WEIGHT.turn)),
    level: (c.level || 1) * RANK_WEIGHT.level,
    title: titles * RANK_WEIGHT.title,
    kill: kills * RANK_WEIGHT.kill,
    moves: Math.round((s.moves || 0) * RANK_WEIGHT.moves),
    craft: (s.crafts || 0) * RANK_WEIGHT.craft,
    gold: Math.round((c.gold || 0) * RANK_WEIGHT.gold),
    alive: (c.alive !== false && c.scene !== 'dead') ? RANK_WEIGHT.alive : 0,
    boss: (s.bossKills || 0) * RANK_WEIGHT.boss,
    sevenwa: (c.flags && c.flags.sevenWaHome) ? RANK_WEIGHT.sevenwa : 0,
    song: (s.songs || 0) * RANK_WEIGHT.song,
    hostage: (s.savedHostages || 0) * RANK_WEIGHT.hostage,
  };
  let total = 0;
  for (const k in parts) total += parts[k];
  return { total, parts };
}

function rollLoot(tier, luck, count) {
  const rate = W.settings().lootRate != null ? W.settings().lootRate : 1;
  count = Math.max(0, Math.round(count * rate));
  const pool = (LOOT_TABLE[tier] || LOOT_TABLE[1]).filter(x => ITEMS[x[0]] && x[1] > 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    // 幸运：有机会从更高一档池子里抽
    let useTier = tier;
    if (Math.random() < luck / 140) useTier = Math.min(5, tier + 1);
    const p = useTier === tier ? pool : (LOOT_TABLE[useTier] || pool).filter(x => ITEMS[x[0]] && x[1] > 0);
    const total = p.reduce((s, x) => s + x[1], 0);
    let r = Math.random() * total, chosen = p[0];
    for (const x of p) { r -= x[1]; if (r <= 0) { chosen = x; break; } }
    const n = ri(chosen[2], chosen[3]);
    if (n > 0) out.push({ id: chosen[0], n });
  }
  // 合并同类
  const merged = [];
  for (const it of out) {
    const f = merged.find(m => m.id === it.id);
    if (f) f.n += it.n; else merged.push({ ...it });
  }
  return merged;
}

// ---------- 敌人 ----------
function makeEnemy(tier, luck) {
  // 只出当前危险度及低一档的敌人，避免新手区直接刷出高阶怪
  const pool = ENEMIES.filter(e => e.tier <= tier && e.tier >= Math.max(1, tier - 1));
  const base = pick(pool.length ? pool : ENEMIES.filter(e => e.tier === 1));
  const scale = 1 + Math.max(0, tier - base.tier) * 0.1;
  return {
    id: base.id, name: base.name, kind: base.kind, tier: base.tier,
    hp: Math.round(base.hp * scale), maxHp: Math.round(base.hp * scale),
    atk: Math.max(3, Math.round(base.atk * scale * 0.82)), def: base.def, dodge: base.dodge,
    flee: base.flee, desc: base.desc, w: base.w,
  };
}

// 把一个真人玩家变成「敌人」——只借属性和血量，真正结算在 server 里
function enemyFromPlayer(t) {
  const tier = clamp(1 + Math.floor((t.level || 1) / 6), 1, 5);
  return {
    id: 'pvp', name: t.name, kind: 'human', tier,
    hp: Math.max(20, t.hp), maxHp: Math.max(20, t.hpMax),
    atk: Math.max(4, t.atk || 8), def: Math.max(0, t.def || 0),
    dodge: Math.max(0, t.dodge || 6), flee: 50,
    desc: '也是被扔进来的。他先看见了你。', w: 2, pvp: true,
  };
}

// ---------- 场景切换 ----------
function toMap(c) { c.scene = 'map'; c.pending = null; }

function checkDeath(c) {
  // 只有血量归零才算死。精力见底只是「动不了」，不是出局
  if (c.hp <= 0) { c.hp = 0; c.alive = false; c.scene = 'dead'; c.pending = { reason: 'hp' }; log(c, '你的血耗尽了。视野从边缘开始变黑。', 'bad'); return true; }
  if (c.ep < 0) c.ep = 0;
  return false;
}

// ---------- 事件判定 ----------
function rollEvent(c, zone, mode) {
  // 单轮控制：这一格被管理员指定了强制事件就直接给
  const ovr = (W.round().zoneOverrides || {})[zone.id];
  if (ovr && ovr.force && Math.random() * 100 < (ovr.forceChance != null ? ovr.forceChance : 100)) return ovr.force;
  const danger = zone.danger;
  const luck = effAttr(c, 'luk');
  const cfg = W.settings();
  const wx = W.weatherNow();
  const encMul = cfg.encounterMul != null ? cfg.encounterMul : 1;
  let wFight = (18 + danger * 4 - luck * 0.1) * encMul * (wx.encMul || 1);
  let wBox = mode === 'explore' ? 22 : 10;
  let wMine = 4 + danger * 1.0 - luck * 0.05;
  let wNpc = 12;
  let wHostage = 7;                     // 人质事件：敌人 + 被绑的人
  let wSeven = 0, wLiuying = 0;
  // 七娃 / 刘颖：按在线人数动态稀释——人多时一场里不该频繁撞见，人少时也别绝迹
  const online = W.online ? W.online() : 1;
  const specScale = cfg.specialScale != null ? cfg.specialScale : 1;
  const dyn = cfg.onlineAware === false ? 1 : clamp(2.5 / (online + 1.5), 0.12, 0.55);
  if (Date.now() > (c.flags.sevenWaCooldown || 0)) wSeven = 3 * dyn * specScale;
  if (Date.now() > (c.flags.liuyingUntil || 0)) wLiuying = 4 * dyn * specScale;
  if (mode === 'explore') { wFight += 6; wNpc -= 4; wHostage += 3; wSeven += 1; wLiuying += 1; }
  const total = wFight + wHostage + wSeven + wLiuying + wBox + Math.max(0, wMine) + wNpc + 25;
  let r = Math.random() * total;
  r -= Math.max(0, wFight);
  if (r <= 0) return 'fight';
  r -= wHostage;
  if (r <= 0) return 'hostage';
  r -= wSeven;
  if (r <= 0) return 'seven';
  r -= wLiuying;
  if (r <= 0) return 'liuying';
  r -= wBox;
  if (r <= 0) return 'box';
  r -= Math.max(0, wMine);
  if (r <= 0) return 'mine';
  r -= wNpc;
  if (r <= 0) return 'npc';
  return 'none';
}

// 人质名字池（00 后风格）
const HOSTAGE_NAMES = [
  '林知夏', '苏念安', '陈见月', '沈听雨', '顾清越', '许南栀',
  '江晚意', '温以宁', '叶书瑶', '白露微', '程星野', '宋栖迟',
  '张子涵', '李欣怡', '王梓萱', '刘雨桐', '陈思彤', '杨佳琪',
];

function makeHostage() {
  return { name: pick(HOSTAGE_NAMES), taken: false };
}

function startEncounter(c, zone, enemy, source) {
  c.scene = 'encounter';
  c.pending = { enemy, source, zoneName: zone.name, noise: 0, wave: 1 };
  log(c, `遭遇：${enemy.name}。${enemy.desc}`, 'warn');
  // 之前在这个区块埋过对敌道具：对方开局就带着负面状态
  if (c.trap && c.trap.zone === c.pos) {
    const td = ITEMS[c.trap.itemId];
    if (td && td.foe) {
      applyFoeDebuff(c.pending, td);
      log(c, `你布下的${td.name}生效了——${enemy.name}一上来就${describeFoeDebuff(c.pending.foe)}。`, 'good');
    }
    c.trap = null;
  }
}

// 最终 BOSS：进入广华寺即触发
function startBoss(c, zone) {
  const s = W.settings();
  const hp = s.bossHp || FINAL_BOSS.hp;
  const enemy = {
    id: FINAL_BOSS.id,
    name: FINAL_BOSS.name,
    kind: 'armed',
    tier: 6,
    hp, maxHp: hp,
    atk: s.bossAtk || FINAL_BOSS.atk,
    def: FINAL_BOSS.def,
    dodge: FINAL_BOSS.dodge,
    flee: 0,
    desc: FINAL_BOSS.desc,
    w: 6,
  };
  c.scene = 'encounter';
  c.pending = {
    enemy, source: 'boss', zoneName: zone.name, noise: 0, wave: 1,
    boss: true, intro: FINAL_BOSS.intro, taunt: FINAL_BOSS.taunt,
  };
  log(c, FINAL_BOSS.intro, 'warn');
  return { ok: true, msg: '' };
}

function startBattle(c, enemy, firstStrike) {
  c.scene = 'battle';
  const p = c.pending || {};
  c.pending = {
    enemy,
    round: 1,
    zoneName: p.zoneName || MAPD.BY_ID[c.pos].name,
    noise: p.noise || 0,
    wave: p.wave || 1,
    log: p.battleLog || [],
    firstStrike: !!firstStrike,
    stun: 0,
    enemyStun: 0,
    foe: p.foe || null,     // 对敌道具造成的负面状态
    smoke: 0,
    guaranteed: false,
    hostage: p.hostage || null,
    npc: p.npc || null,
    boss: !!p.boss,
    pvp: p.pvp || null,   // 玩家遭遇：进战斗时必须带着，否则结算时不知道打的是谁
  };
  if (firstStrike) {
    c.pending.log.push('对方先动了手。');
    enemyTurn(c);
  }
}

// ---------- 战斗计算 ----------
function weaponOf(c) {
  const w = c.equip.weapon ? ITEMS[c.equip.weapon.id] : null;
  return w || null;
}

// ---------- 等级 ----------
const MAX_LEVEL = 30;
const EXP_BY_TIER = { 1: 15, 2: 30, 3: 50, 4: 75, 5: 110, 6: 500 };
// 玩家对玩家：经验 2.5 倍（打真人比打 NPC 风险高得多）
const PVP_EXP_MUL = 2.5;
// 金币：击杀和开箱都按难度分档，越危险给得越多（受 settings.goldRate 影响）
const GOLD_BY_TIER = { 1: [8, 22], 2: [18, 45], 3: [35, 80], 4: [60, 150], 5: [100, 300], 6: [300, 600] };
function rollGold(tier) {
  const r = GOLD_BY_TIER[clamp(tier || 1, 1, 6)] || GOLD_BY_TIER[1];
  const mul = W.settings().goldRate != null ? W.settings().goldRate : 1;
  return Math.max(1, Math.round(ri(r[0], r[1]) * mul));
}

function expNeed(level) {
  if (level >= MAX_LEVEL) return Infinity;
  // 30 级封顶，原来的曲线太陡（满级要 8400+ 经验），整体砍一半
  return 20 + (level - 1) * 9;
}

// 升级：五维按当前值 +2%（至少 +1），但不突破 100，也遵守"一项满百其他不再涨"
function gainExp(c, n) {
  if (!n || n <= 0) return 0;
  c.level = c.level || 1;
  c.exp = (c.exp || 0) + n;
  let ups = 0;
  while (c.level < MAX_LEVEL && c.exp >= expNeed(c.level)) {
    c.exp -= expNeed(c.level);
    c.level++;
    ups++;
    for (const k of ATTRS) {
      if (c.attrs[k] >= 100) continue;
      const maxed = ATTRS.find(a => a !== k && c.attrs[a] >= 100);
      if (maxed) continue;
      const inc = Math.max(1, Math.round(c.attrs[k] * 0.02));
      c.attrs[k] = Math.min(100, c.attrs[k] + inc);
    }
    c.hp = Math.min(hpMax(c), c.hp + 15);
    c.ep = Math.min(epMax(c), c.ep + 10);
    log(c, `升到 ${c.level} 级。身体比刚才更听使唤了。`, 'sys');
  }
  if (c.level >= MAX_LEVEL) c.exp = 0;
  return ups;
}

// ---------- 武器实例 ----------
// equip.weapon = { id, dur, mods: { sight, muzzle, grip } }
function weaponInstance(c) {
  const inst = c.equip.weapon;
  if (!inst) return null;
  const d = ITEMS[inst.id];
  if (!d) return null;
  if (typeof inst.dur !== 'number') inst.dur = d.maxDur || 100;
  if (!inst.mods) inst.mods = { sight: null, muzzle: null, grip: null };
  return inst;
}

function weaponMods(c) {
  const inst = weaponInstance(c);
  return (inst && inst.mods) || {};
}

const MOD_SLOT_CN = { sight: '瞄具', muzzle: '枪口', grip: '握把' };
function playerDef(c) {
  let d = 0;
  for (const s of ['head', 'body', 'hands', 'legs', 'face', 'feet']) {
    const it = c.equip[s];
    if (it) d += entryDef(it);   // 已算上强化 +N 的 10% / 20% / 30%
  }
  // 配件
  for (const it of c.bag) {
    if (it.id === 'buff_plate') d += 10;
  }
  const st = currentStatus(c);
  return Math.round(d * (st.defMul || 1));
}
function hasBuff(c, id) { return c.bag.some(i => i.id === id); }

function playerAttack(c, useWeapon) {
  const p = c.pending, e = p.enemy;
  let w = useWeapon ? weaponOf(c) : null;
  const inst = weaponInstance(c);
  const pLog = [];
  let noAmmo = false, broken = false;

  // 耐久耗尽：武器废了，只能徒手
  if (w && inst && inst.dur <= 0) {
    broken = true;
    w = null;
  }
  // 弹药不足时自动改为徒手，避免卡死
  if (w && w.ammo && countItem(c, w.ammo) <= 0) {
    noAmmo = true;
    w = null;
  }
  const mods = weaponMods(c);
  const wx = W.weatherNow();
  const str = effAttr(c, 'str'), luk = effAttr(c, 'luk');

  // 火器射击模式：半自动单发满伤，全自动三发但单发只有 45%
  const fm = (w && w.fire) ? (FIRE_MODES[w.fire] || null) : null;
  const per = fm ? fm.per : 1;
  const durMul = fm ? fm.durMul : 1;
  let shots = fm ? fm.shots : 1;
  // 弹药只够两发就别硬打三发
  if (w && w.ammo) shots = Math.max(1, Math.min(shots, countItem(c, w.ammo)));

  // 强化 +N：伤害按 10% / 20% / 30% 递增
  let dmgBase = (w ? entryDmg(inst) * (mods.grip ? 1.08 : 1) : 5) * wx.atkMul * per;
  let noise = Math.max(1, (w ? Math.max(1, w.noise - (mods.muzzle ? 6 : 0) + (fm ? fm.noise : 0)) : 1) + wx.noiseMod);
  if (broken) pLog.push('武器已经打废了，你只能用拳头。');
  else if (noAmmo) pLog.push('弹药打空了，你只能徒手。');

  // 命中
  const st = currentStatus(c);
  let acc = 82 + luk * 0.12 + (mods.sight ? 12 : 0) - e.dodge
    + (st.hitBonus || 0) - (st.hitPenalty || 0) + (wx.accMod || 0) + (fm ? fm.acc : 0);
  if (p.guaranteed) { acc = 100; p.guaranteed = false; }
  if (p.smoke > 0) acc -= 25;
  acc = clamp(acc, 15, 98);

  if (w && w.ammo) {
    pLog.push(`你用${w.name}开火${shots > 1 ? `，打出一组 ${shots} 发` : ''}。`);
  } else if (w) {
    pLog.push(`你挥起${w.name}。`);
  } else {
    pLog.push('你赤手空拳扑了上去。');
  }

  // 扣耐久（不管中没中，打出去就磨损）
  if (w && inst) {
    inst.dur = Math.max(0, inst.dur - Math.round((w.durCost || 1) * durMul));
    if (inst.dur === 0) pLog.push(`${w.name}发出一声闷响，彻底打废了。`);
    else if (inst.dur <= (w.maxDur || 100) * 0.2) pLog.push(`${w.name}已经不太行了。`);
  }

  // 逐发结算：一次打几发就掷几次命中
  let hits = 0, total = 0, critAny = false, shotsFired = 0;
  const ammoSave = hasBuff(c, 'buff_bandolier') ? 20 : 0;   // 弹链：放背包就生效
  let saved = 0;
  for (let i = 0; i < shots; i++) {
    if (w && w.ammo) {
      if (countItem(c, w.ammo) <= 0) break;   // 中途没弹了
      if (ammoSave && Math.random() * 100 < ammoSave) saved++;
      else removeItem(c, w.ammo, 1);
      shotsFired++;
    }
    if (Math.random() * 100 > acc) continue;
    let raw = dmgBase * (1 + str / 150) * rf(0.85, 1.15) * (st.atkMul || 1);
    // 防御按递减方式减伤，避免高防敌人完全免疫
    let dmg = raw * (100 / (100 + e.def * 2.5));
    const crit = Math.random() * 100 < 8 + luk * 0.25;
    if (crit) { dmg *= 1.8; critAny = true; c.stats.crits = (c.stats.crits || 0) + 1; }
    dmg = Math.max(1, Math.round(dmg));
    total += dmg;
    hits++;
  }

  p.noise += noise;
  if (saved > 0) pLog.push(`弹链省下 ${saved} 发弹药。`);
  if (hits === 0) {
    pLog.push(shots > 1 && shotsFired > 1 ? `${shotsFired} 发全打偏了。` : '没打中。');
    return { ok: true, hit: false, msg: pLog.join(''), noise };
  }

  e.hp -= total;
  p.lastFist = !w;   // 这一击是空手打的，击杀时算徒手杀
  if (shots > 1) {
    pLog.push(`${shotsFired} 发中 ${hits} 发，合计造成 ${total} 点伤害${critAny ? '（有要害命中）' : ''}。`);
  } else {
    pLog.push(`造成 ${total} 点伤害${critAny ? '（要害命中！）' : ''}。`);
  }
  if (w && noise >= 8) pLog.push('枪声在楼群之间炸开，传得很远。');
  return { ok: true, hit: true, dmg: total, crit: critAny, msg: pLog.join(''), noise };
}

function enemyTurn(c) {
  const p = c.pending, e = p.enemy;
  const pLog = [];
  if (e.hp <= 0) return pLog;
  if (p.enemyStun > 0) { p.enemyStun--; pLog.push(`${e.name}还没缓过来。`); return pLog; }

  // 对敌道具留下的负面状态：先结算持续伤害，再看这回合能不能动
  let blindPen = 0, atkMul = 1;
  const f = p.foe;
  if (f && f.turns > 0) {
    if (f.dotPct) {
      const dot = Math.max(1, Math.round((e.maxHp || e.hp) * f.dotPct));
      e.hp -= dot;
      pLog.push(`${e.name}中了${f.name}，损失 ${dot} 点生命。`);
      if (e.hp <= 0) { p.foe = null; return pLog; }
    }
    f.turns--;
    if (f.freeze > 0) {
      f.freeze--;
      pLog.push(`${e.name}冻得动不了，这一回合没能还手。`);
      if (f.turns <= 0) p.foe = null;
      return pLog;
    }
    blindPen = f.blindPen || 0;
    atkMul = f.atkMul || 1;
    if (f.turns <= 0) p.foe = null;
  }

  const def = playerDef(c);
  let acc = 70 - effAttr(c, 'luk') * 0.15 - (p.smoke > 0 ? 20 : 0) - blindPen;
  acc = clamp(acc, 5, 90);
  if (Math.random() * 100 > acc) {
    pLog.push(blindPen ? `${e.name}眼睛还没缓过来，打了个空。` : `${e.name}的攻击落空了。`);
    return pLog;
  }
  let raw = e.atk * rf(0.85, 1.15) * atkMul;
  let dmg = Math.max(1, Math.round(raw * (100 / (100 + def * 2.5))));
  if (c.invincible) {
    pLog.push(`${e.name}击中了你——子弹像穿过空气一样飞过去。`);
    return pLog;
  }
  c.hp -= dmg;
  pLog.push(`${e.name}击中你，损失 ${dmg} 点生命${atkMul < 1 ? '（手脚发软，力道轻了不少）' : ''}。`);
  return pLog;
}

// ---------- 对敌道具 ----------
// 同时只保留一个负面状态，新的覆盖旧的（和玩家状态的设计一致）
function applyFoeDebuff(p, d) {
  const f = d.foe || {};
  p.foe = {
    name: d.name,
    turns: f.turns || 1,
    freeze: f.freeze || 0,
    blindPen: f.blindPen || 0,
    atkMul: f.atkMul || 1,
    dotPct: f.dotPct || 0,
  };
  return p.foe;
}
function describeFoeDebuff(f) {
  if (!f) return '';
  const parts = [];
  if (f.freeze) parts.push(`冻住 ${f.freeze} 回合`);
  if (f.blindPen) parts.push(`命中 -${f.blindPen}`);
  if (f.atkMul < 1) parts.push(`攻击 -${Math.round((1 - f.atkMul) * 100)}%`);
  if (f.dotPct) parts.push(`每回合掉 ${Math.round(f.dotPct * 100)}% 生命`);
  return parts.join('，') + `（${f.turns} 回合）`;
}

// 地图上埋设：下一次在这个区块打起来，对方开局就带着这个负面状态
function doTrap(c, { itemId }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const d = ITEMS[itemId];
  if (!d || d.type !== 'hostile') return { ok: false, msg: '这个埋不了。' };
  if (countItem(c, itemId) <= 0) return { ok: false, msg: '背包里没有这个。' };
  const zone = MAPD.BY_ID[c.pos];
  removeItem(c, itemId, 1);
  c.trap = { itemId, zone: c.pos, zoneName: zone ? zone.name : '' };
  log(c, `你在「${c.trap.zoneName}」布下了${d.name}。谁在这里动手，都会先吃这一下。`, 'good');
  return { ok: true, msg: `已在${c.trap.zoneName}埋设${d.name}` };
}

function finishBattle(c, victory) {
  const p = c.pending, e = p.enemy;
  if (!victory) return;
  c.kills++;
  c.stats.kills++;
  if (p.lastFist) c.stats.fistKills++;   // 赤手空拳打死人（成就用）
  // 真人比 NPC 值钱：打人风险高得多，经验给到 2.5 倍
  let expGain = EXP_BY_TIER[e.tier] || 15;
  if (p.pvp) expGain = Math.round(expGain * PVP_EXP_MUL);
  gainExp(c, expGain);
  log(c, `你击败了${e.name}（+${expGain} 经验${p.pvp ? '，真人对手 2.5 倍' : ''}）。`, 'battle');
  // 敌人身上有钱：按难度分档
  const goldGain = rollGold(e.tier);
  c.gold = (c.gold || 0) + goldGain;
  c.stats.goldEarned = (c.stats.goldEarned || 0) + goldGain;
  log(c, `从他身上翻出 ¥${goldGain}。`, 'loot');

  if (p.pvp) c._pvpResult = { user: p.pvp.user, name: p.pvp.name, win: true };

  // 最终 BOSS：击杀即全服胜利
  if (p.boss) {
    c.flags.bossDefeated = true;
    c.stats.bossKills++;
    c.scene = 'loot';
    c.pending = {
      items: BOSS_LOOT.map(([id, n]) => ({ id, n })),
      enemyName: e.name,
      chain: false, wave: 1, zoneName: p.zoneName, bossWin: true,
    };
    log(c, '话筒掉在地上，滚了两圈。广播停了。', 'sys');
    return;
  }

  // 连续遭遇：噪音过大引来更多人
  const loud = p.noise >= 10;
  const chainChance = loud ? 50 : (p.noise >= 6 ? 22 : 0);
  const canChain = p.wave < 3 && Math.random() * 100 < chainChance;

  const drops = rollLoot(e.tier, effAttr(c, 'luk'), ri(1, 3));

  // 有人质：先处理人质，再捡东西
  if (p.hostage && !p.hostage.done) {
    c.scene = 'hostage';
    c.pending = {
      hostage: p.hostage, drops, enemyName: e.name,
      chain: canChain, wave: p.wave, zoneName: p.zoneName,
    };
    return;
  }

  c.scene = 'loot';
  c.pending = {
    items: drops,
    enemyName: e.name,
    chain: canChain,
    wave: p.wave,
    zoneName: p.zoneName,
  };
  if (canChain) log(c, '远处传来脚步声——不止一个人。', 'warn');
}

// ---------- 行动分发 ----------
function act(c, action, payload = {}) {
  if (c.scene === 'dead') return { ok: false, msg: '你已经出局了。' };
  tickHostageMood(c);
  let r;
  switch (action) {
    case 'move': r = doMove(c, payload); break;
    case 'explore': r = doExplore(c, payload); break;
    case 'rest': r = doRest(c); break;
    case 'encounter': r = doEncounter(c, payload); break;
    case 'battle': r = doBattle(c, payload); break;
    case 'loot': r = doLoot(c, payload); break;
    case 'box': r = doBox(c, payload); break;
    case 'hostage': r = doHostage(c, payload); break;
    case 'hostage_done': r = doHostageDone(c); break;
    case 'sevenwa': r = doSevenWa(c, payload); break;
    case 'liuying': r = doLiuying(c, payload); break;
    case 'equip': r = doEquip(c, payload); break;
    case 'unequip': r = doUnequip(c, payload); break;
    case 'mod': r = doMod(c, payload); break;
    case 'sort_bag': r = doSortBag(c); break;
    case 'use': r = doUse(c, payload); break;
    case 'craft': r = doCraft(c, payload); break;
    case 'trap': r = doTrap(c, payload); break;
    case 'enhance': r = doEnhance(c, payload); break;
    case 'drop': r = doDrop(c, payload); break;
    case 'shop_buy': r = doShopBuy(c, payload); break;
    case 'shop_sell': r = doShopSell(c, payload); break;
    case 'npc': r = doNpc(c, payload); break;
    case 'close': r = doClose(c); break;
    case 'settle': r = doSettle(c); break;
    case 'tease': r = doTease(c, payload); break;
    case 'restart': r = { ok: false, msg: '请在主菜单重新开始。' }; break;
    default: r = { ok: false, msg: '未知行动。' };
  }
  // 每次行动后统一判定成就
  const unlocked = checkAchievements(c);
  if (unlocked.length) r.achievements = unlocked;
  return r;
}

function doMove(c, { x, y }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  // 冷冻麻痹：10 秒内不能换图
  if (c.frozenUntil && Date.now() < c.frozenUntil) {
    const left = Math.ceil((c.frozenUntil - Date.now()) / 1000);
    return { ok: false, msg: `关节还没缓过来，还要等 ${left} 秒。` };
  }
  const cur = MAPD.BY_ID[c.pos];
  const nb = MAPD.neighbors(cur.x, cur.y);
  const target = nb.find(z => z.x === x && z.y === y);
  if (!target) return { ok: false, msg: '只能移动到相邻区块。' };
  const wx = W.weatherNow();
  const cost = Math.max(1, Math.round((W.settings().moveCost || 4) * (wx.epMul || 1)));
  // 精力见底只是走不动，不会死
  if (c.ep < cost) return { ok: false, msg: `精力只剩 ${c.ep}，走不动了。先「原地休息」回点精力。` };
  c.ep -= cost; c.turn++;
  c.pos = target.id;
  c.stats.moves++;
  log(c, `你进入${target.name}。`, 'move');
  if (Math.random() < 0.55) log(c, pick(EV.FLAVOR[target.type] || EV.FLAVOR.street), 'flavor');

  // 中毒：每次换场景掉血掉精力
  applyDrain(c);
  if (c.scene === 'dead') return { ok: true, msg: '' };

  // 广华寺：最终 BOSS（30 分钟后才登场）
  if (target.id === FINAL_BOSS.zone && !c.flags.bossDefeated && W.settings().bossEnabled !== false) {
    if (W.round().bossSpawned) return startBoss(c, target);
    log(c, '钟楼是空的。只有风穿过铁架的声音。', 'flavor');
    log(c, '（广播里说，30 分钟后这里会有东西出现）', 'info');
  }

  const ev = rollEvent(c, target, 'move');
  return resolveEvent(c, target, ev, 'move');
}

function doExplore(c) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const cost = Math.max(1, W.settings().exploreCost || 3);
  // 精力见底只是搜不动，不会死
  if (c.ep < cost) return { ok: false, msg: `精力只剩 ${c.ep}，翻不动了。先「原地休息」。` };
  c.ep -= cost; c.turn++;
  const zone = MAPD.BY_ID[c.pos];
  log(c, `你在${zone.name}搜寻。`, 'move');
  applyDrain(c);
  if (c.scene === 'dead') return { ok: true, msg: '' };

  // 空投补给箱：本区块一次性，必出一件史诗装备
  const sp = W.get().supply;
  if (sp && sp.zone === c.pos && Date.now() < sp.until) {
    W.get().supply = null;
    W.save();
    c._fromSupply = true;
    log(c, '补给箱就放在那儿，锁扣已经被人撬开了。', 'good');
    return resolveEvent(c, zone, 'box', 'explore');
  }

  const ev = rollEvent(c, zone, 'explore');
  return resolveEvent(c, zone, ev, 'explore');
}

function resolveEvent(c, zone, ev, mode) {
  const luck = effAttr(c, 'luk');
  if (ev === 'fight') {
    // 同区块有真人（GM 不在列表里）：有概率撞上人而不是野怪
    const near = c._nearby || [];
    const pvpChance = W.settings().pvpChance != null ? W.settings().pvpChance : 45;
    if (near.length && Math.random() * 100 < pvpChance) {
      const t = pick(near);
      const e = enemyFromPlayer(t);
      startEncounter(c, zone, e, mode);
      c.pending.pvp = { user: t.user, name: t.name, bot: !!t.bot };
      log(c, `${t.name} 也在这片地方，你们撞上了。`, 'warn');
      return { ok: true, msg: '' };
    }
    const e = makeEnemy(zone.danger, luck);
    startEncounter(c, zone, e, mode);
    return { ok: true, msg: '' };
  }
  if (ev === 'hostage') {
    const e = makeEnemy(zone.danger, luck);
    const h = makeHostage();
    c.scene = 'encounter';
    c.pending = { enemy: e, source: 'hostage', zoneName: zone.name, noise: 0, wave: 1, hostage: h };
    log(c, `你听见了哭声。${e.name}守着一个人，那人的手被绑在身后。`, 'warn');
    return { ok: true, msg: '' };
  }
  if (ev === 'seven') {
    c.scene = 'sevenwa';
    c.pending = { zoneName: zone.name };
    log(c, `墙角蹲着一个小男孩。书包放在脚边，校服袖口磨破了。`, 'warn');
    return { ok: true, msg: '' };
  }
  if (ev === 'liuying') {
    const q = pick(QUIZ);
    c.scene = 'liuying';
    c.pending = { stage: 'pill', color: null, question: q, correct: false, zoneName: zone.name };
    log(c, `一个女人站在路中间，掌心躺着两颗药丸。`, 'warn');
    return { ok: true, msg: '' };
  }
  if (ev === 'npc') {
    const npc = pick(EV.NPC_EVENTS);
    const e = ENEMIES.find(x => x.id === npc.enemy) || ENEMIES[4];
    // 谈崩后的对手必须是剧情里的那个人，不能沿用随机敌人的名字
    const enemy = { ...e, name: npc.foeName || e.name, desc: npc.foeDesc || e.desc, hp: e.hp, maxHp: e.hp };
    c.scene = 'encounter';
    c.pending = { enemy, source: 'npc', zoneName: zone.name, noise: 0, wave: 1, npc };
    log(c, `剧情：${npc.title}`, 'warn');
    return { ok: true, msg: '' };
  }
  if (ev === 'box') {
    const ovrBox = (W.round().zoneOverrides || {})[zone.id] || {};
    const n = Math.max(1, Math.round(ri(2, 4) * (ovrBox.lootMul || 1)));
    const items = rollLoot(clamp(zone.loot + (Math.random() < luck / 100 ? 1 : 0), 1, 5), luck, n);
    // 空投箱：必带一件史诗装备，这是它值得跑一趟的理由
    const fromSupply = !!c._fromSupply;
    if (fromSupply) {
      c._fromSupply = false;
      const epic = pickEpicGear();
      if (epic) {
        const same = items.find(x => x.id === epic);
        if (same) same.n += 1; else items.push({ id: epic, n: 1 });
      }
    }
    // 箱子里有现金：按区块危险度分档，越高级越多（顶级 100~300）
    const boxGold = rollGold(clamp(zone.danger, 1, 5));
    c.gold = (c.gold || 0) + boxGold;
    c.stats.goldEarned = (c.stats.goldEarned || 0) + boxGold;
    c.scene = 'box';
    c.pending = {
      items, gold: boxGold, zoneName: zone.name,
      text: fromSupply ? '空投箱砸进泥里，箱体还带着降落伞的碎布。' : pick(EV.BOX_TEXTS),
      supply: fromSupply,
    };
    log(c, c.pending.text, 'good');
    if (fromSupply) log(c, '这是空投箱——里面必有一件史诗装备。', 'warn');
    log(c, `箱底压着 ¥${boxGold} 现金，你顺手揣进兜里。`, 'loot');
    return { ok: true, msg: '' };
  }
  if (ev === 'mine') {
    const mul = W.settings().mineMul != null ? W.settings().mineMul : 1;
    const dmg = Math.round(ri(12, 28) * (1 - Math.min(0.4, luck / 250)) * mul);
    if (c.invincible) {
      log(c, `${pick(EV.MINE_TEXTS)}火光把你整个人吞了进去——然后你从烟里走了出来，衣服都没破。`, 'warn');
    } else {
      c.hp -= dmg;
      log(c, `${pick(EV.MINE_TEXTS)}你被炸飞出去，损失 ${dmg} 点生命。`, 'bad');
      checkDeath(c);
    }
    return { ok: true, msg: '' };
  }
  // none
  if (mode === 'explore') {
    const got = rollLoot(clamp(zone.loot, 1, 5), luck, 1);
    if (got.length) {
      const r = addItem(c, got[0].id, got[0].n);
      if (r.ok) log(c, `你在角落里翻到了 ${ITEMS[got[0].id].name} x${r.added}。`, 'good');
      else log(c, `你找到了${ITEMS[got[0].id].name}，但背包放不下了。`, 'warn');
    } else {
      log(c, '什么都没找到，只有灰。', 'info');
    }
  } else {
    log(c, '这一带暂时是空的。', 'info');
  }
  return { ok: true, msg: '' };
}

function doRest(c) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  c.turn++;
  const gain = ri(10, 18);
  c.ep = Math.min(epMax(c), c.ep + gain);
  log(c, `你靠着墙喘了一会儿，精力 +${gain}。`, 'good');

  // 身边有人：夜里可能发生的事（只在有人心情好的时候）
  const happyHostages = (c.hostages || []).filter(h => h.mood === 'happy');
  if (happyHostages.length > 0 && Math.random() * 100 < 5 + c.hostages.length * 1.5) {
    const pal = happyHostages[happyHostages.length - 1];
    pal.songs = (pal.songs || 0) + 1;
    c.stats.songs = (c.stats.songs || 0) + 1;
    log(c, `夜里很冷，${pal.name}把外套分了一半给你。`, 'good');
    log(c, `她靠着墙，很小声地哼起一支歌。你听着听着就睡着了。`, 'story');
  }

  // 休息有风险
  const zone = MAPD.BY_ID[c.pos];
  if (Math.random() * 100 < 18 + zone.danger * 3) {
    log(c, '你听见了脚步声。', 'warn');
    const e = makeEnemy(zone.danger, effAttr(c, 'luk'));
    startEncounter(c, zone, e, 'rest');
  }
  return { ok: true, msg: '' };
}

// ---------- 遭遇阶段 ----------
function doEncounter(c, { choice, itemId, n }) {
  const p = c.pending;
  if (!p || !p.enemy) return { ok: false, msg: '没有遭遇。' };
  const e = p.enemy;

  if (choice === 'fight') {
    startBattle(c, e, false);
    log(c, `你选择迎战${e.name}。`, 'warn');
    return { ok: true, msg: '' };
  }

  if (choice === 'spare') {
    if (e.kind === 'animal') {
      log(c, '它不会听人话。', 'warn');
      startBattle(c, e, true);
      return { ok: true, msg: '' };
    }
    const cha = effAttr(c, 'cha');
    const chance = clamp(35 + cha * 0.65 - e.tier * 3, 8, 100);
    // 剧情事件：用剧情文案
    if (p.npc) {
      const npc = p.npc;
      if (Math.random() * 100 < chance) {
        log(c, npc.talkOk, 'good');
        // 以物换物：先记「失去」，再记「获得」，别让玩家莫名其妙少东西
        if (npc.trade) {
          const lost = takeOneForTrade(c);
          if (lost) log(c, `失去 ${ITEMS[lost].name} x1。`, 'bad');
          else log(c, '他翻了翻你的包，没看上什么，摆摆手算了。', 'info');
        }
        (npc.reward.items || []).forEach(([id, n]) => {
          const r = addItem(c, id, n);
          if (r.ok) log(c, `获得 ${ITEMS[id].name} x${r.added}。`, 'good');
        });
        for (const k in (npc.reward.attr || {})) {
          const g = gainAttr(c, k, npc.reward.attr[k]);
          if (g.ok) log(c, g.msg, 'good');
          else if (g.msg) log(c, g.msg, 'warn');
        }
        toMap(c);
        return { ok: true, msg: '' };
      }
      log(c, npc.talkFail, 'bad');
      startBattle(c, e, true);
      return { ok: true, msg: '' };
    }
    if (Math.random() * 100 < chance) {
      log(c, `你举起双手："别动手，我这就走。"${e.name}盯了你几秒，退开了。`, 'good');
      toMap(c);
      return { ok: true, msg: '' };
    }
    log(c, `交涉失败。${e.name}先动了手。`, 'bad');
    startBattle(c, e, true);
    return { ok: true, msg: '' };
  }

  if (choice === 'item') {
    const r = useItemInternal(c, itemId, 'encounter', n);
    return r;
  }
  return { ok: false, msg: '无效选择。' };
}

// ---------- 战斗阶段 ----------
// 敌人回合 + 收尾检查。对敌道具的持续伤害可能把对方耗死，统一在这里处理
function runEnemyTurn(c) {
  const p = c.pending;
  if (!p.log) p.log = [];
  const el = enemyTurn(c);
  p.log.push(...el);
  if (p.enemy && p.enemy.hp <= 0) { finishBattle(c, true); return true; }
  return false;
}

function doBattle(c, { choice, itemId, n, plus }) {
  const p = c.pending;
  if (!p || !p.enemy) return { ok: false, msg: '没有战斗。' };
  const e = p.enemy;

  if (choice === 'attack') {
    if (c.ep < 2) {
      return { ok: false, msg: '精力见底，手抬不起来了。可以「防御」「逃跑」或用道具。' };
    }
    if (p.stun > 0) {
      p.stun--; p.log.push('你还没站稳，这一下打偏了。');
    } else {
      const r = playerAttack(c, true);
      if (!r.ok) { p.log.push(r.msg); return { ok: false, msg: r.msg }; }
      p.log.push(r.msg);
    }
    if (e.hp <= 0) { finishBattle(c, true); return { ok: true, msg: '' }; }
    if (runEnemyTurn(c)) return { ok: true, msg: '' };
    c.ep = Math.max(0, c.ep - 2);
    p.round++;
    if (checkDeath(c)) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  if (choice === 'item') {
    const r = useItemInternal(c, itemId, 'battle', n);
    if (!r.ok) return r;
    if (e.hp <= 0) { finishBattle(c, true); return { ok: true, msg: '' }; }
    if (runEnemyTurn(c)) return { ok: true, msg: '' };
    p.round++;
    c.ep = Math.max(0, c.ep - 2);
    if (checkDeath(c)) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  if (choice === 'defend') {
    p.log.push('你稳住重心，护住要害。');
    p.defending = true;
    if (runEnemyTurn(c)) return { ok: true, msg: '' };
    p.round++; c.ep = Math.max(0, c.ep - 1);
    p.defending = false;
    if (checkDeath(c)) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  if (choice === 'swap') {
    const r = doEquip(c, { itemId, plus });
    if (!r.ok) return r;
    p.log.push(`你换上了${ITEMS[itemId].name}。`);
    if (runEnemyTurn(c)) return { ok: true, msg: '' };
    p.round++; c.ep = Math.max(0, c.ep - 2);
    if (checkDeath(c)) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  if (choice === 'flee') {
    const chance = p.boss ? 8 : clamp(45 + effAttr(c, 'luk') * 0.45 - e.tier * 3 + (p.smoke > 0 ? 30 : 0), 10, 95);
    if (Math.random() * 100 < chance) {
      log(c, `你转身就跑，${e.name}没有追上来。`, 'good');
      if (p.pvp) c._pvpResult = { user: p.pvp.user, name: p.pvp.name, win: false };
      toMap(c);
      return { ok: true, msg: '' };
    }
    p.log.push('逃跑失败，你被拦了回来。');
    if (runEnemyTurn(c)) return { ok: true, msg: '' };
    p.round++; c.ep = Math.max(0, c.ep - 2);
    if (checkDeath(c)) return { ok: true, msg: '' };
    return { ok: true, msg: '' };
  }

  return { ok: false, msg: '无效选择。' };
}

// ---------- 使用物品 ----------
// 判断一件物品能不能一次用多个
function isBatchable(d) {
  if (!d || d.type !== 'med') return false;
  // 状态类、解除类、修理类用多个没意义
  return !d.setStatus && !d.cureStatus && !d.repair;
}

function useItemInternal(c, itemId, ctx, n) {
  const d = ITEMS[itemId];
  if (!d) return { ok: false, msg: '没有这个物品。' };
  if (countItem(c, itemId) <= 0) return { ok: false, msg: '背包里没有这件东西。' };

  const want = isBatchable(d) ? Math.max(1, Math.min(99, parseInt(n, 10) || 1)) : 1;
  if (want <= 1) return useOne(c, itemId, ctx);

  let used = 0, last = null;
  for (let i = 0; i < want; i++) {
    if (countItem(c, itemId) <= 0) break;
    const r = useOne(c, itemId, ctx);
    if (!r.ok) { last = r; break; }
    used++;
    last = r;
  }
  if (used === 0) return last || { ok: false, msg: '没用成。' };
  const txt = `连续用了 ${used} 个${d.name}。`;
  log(c, txt, 'good');
  if (c.pending && c.pending.log) c.pending.log.push(txt);
  return { ok: true, msg: txt, used };
}

function useOne(c, itemId, ctx) {
  const d = ITEMS[itemId];
  if (!d) return { ok: false, msg: '没有这个物品。' };
  if (countItem(c, itemId) <= 0) return { ok: false, msg: '背包里没有这件东西。' };

  // 药物
  if (d.type === 'med') {
    const hpBefore = Math.round(c.hp), epBefore = Math.round(c.ep);
    const hpCap = hpMax(c), epCap = epMax(c);
    // 注意：med 的 buff/perm 常是空对象 {}，空对象是 truthy，不能直接 !d.buff
    const hasBuff = !!(d.buff && Object.keys(d.buff).length);
    const hasPerm = !!(d.perm && Object.keys(d.perm).length);
    // 只有回复效果且已经满了 → 不消耗，直接拒绝（旧版会白扔一个）
    const pureHeal = d.hp > 0 && !d.ep && !hasBuff && !hasPerm && !d.setStatus && !d.cureStatus;
    if (pureHeal && hpBefore >= hpCap) {
      return { ok: false, msg: `生命已经满了（${hpBefore}/${hpCap}），${d.name}先留着。` };
    }
    const pureEp = d.ep > 0 && !d.hp && !hasBuff && !hasPerm && !d.setStatus && !d.cureStatus;
    if (pureEp && epBefore >= epCap) {
      return { ok: false, msg: `精力已经满了（${epBefore}/${epCap}），${d.name}先留着。` };
    }
    // 纯解毒类：状态不对就别浪费
    const pureCure = d.cureStatus && !d.hp && !d.ep && !hasBuff && !hasPerm && !d.setStatus;
    if (pureCure && !d.cureStatus.includes(currentStatus(c).id)) {
      return { ok: false, msg: `你现在没中这个状态，${d.name}先留着。` };
    }

    removeItem(c, itemId, 1);
    const msgs = [];
    if (d.hp) {
      c.hp = Math.min(hpCap, c.hp + d.hp);
      const got = Math.round(c.hp) - hpBefore;
      msgs.push(got > 0
        ? `生命 +${got}（${hpBefore} → ${Math.round(c.hp)}/${hpCap}）`
        : `生命已满，${d.hp} 点回复没吃上`);
    }
    if (d.ep) {
      c.ep = clamp(c.ep + d.ep, 0, epCap);
      const got = Math.round(c.ep) - epBefore;
      msgs.push(`精力 ${got >= 0 ? '+' : ''}${got}（${epBefore} → ${Math.round(c.ep)}/${epCap}）`);
    }
    if (d.buff) {
      c.buffs = c.buffs || {};
      for (const k in d.buff) {
        const b0 = effAttr(c, k);
        c.buffs[k] = (c.buffs[k] || 0) + d.buff[k];
        const b1 = effAttr(c, k);
        msgs.push(`${ATTR_CN[k]} ${d.buff[k] > 0 ? '+' : ''}${d.buff[k]}（本局，${b0} → ${b1}）`);
      }
    }
    if (d.perm) {
      for (const k in d.perm) {
        const g = gainAttr(c, k, d.perm[k]);
        if (g.ok) msgs.push(g.msg); else if (g.msg) msgs.push(g.msg);
      }
    }
    if (d.setStatus) {
      const st = setStatus(c, d.setStatus);
      if (d.setStatus === 'drunk') c.stats.drunk = (c.stats.drunk || 0) + 1;
      msgs.push(`进入「${st.name}」状态（5 分钟）`);
    }
    if (d.cureStatus) {
      const cur = currentStatus(c);
      const hit = d.cureStatus.includes(cur.id);
      if (hit) { clearStatus(c, d.cureStatus); msgs.push('状态已解除'); }
      else msgs.push('当前状态不受这个影响');
    }
    clampVitals(c);
    const txt = `使用${d.name}：${msgs.join('，') || '没什么效果'}。`;
    log(c, txt, 'good');
    if (c.pending && c.pending.log) c.pending.log.push(txt);
    if (ctx === 'battle') { /* 敌人回合由上层处理 */ }
    return { ok: true, msg: txt };
  }

  // 对敌道具：战斗里扔到敌人身上；地图上用不了，得先「埋设」
  if (d.type === 'hostile') {
    const p = c.pending;
    if (!p || !p.enemy) return { ok: false, msg: '这里没有可以对它用的目标。战斗中再用，或者先「埋设」。' };
    removeItem(c, itemId, 1);
    const e = p.enemy;
    applyFoeDebuff(p, d);
    const txt = `你对${e.name}用了${d.name}：${describeFoeDebuff(p.foe)}。`;
    log(c, txt, 'good');
    if (p.log) p.log.push(txt);
    return { ok: true, msg: txt };
  }

  // 投掷物
  if (d.type === 'throwable') {
    const p = c.pending;
    if (!p || !p.enemy) return { ok: false, msg: '这里没有可以投掷的目标。' };
    removeItem(c, itemId, 1);
    const e = p.enemy;
    const str = effAttr(c, 'str');
    let txt = '';
    if (itemId === 't06') { p.smoke = 3; txt = '烟雾弥漫开来，对方的视线被挡住了。'; }
    else if (itemId === 't07') { p.guaranteed = true; p.enemyStun = 1; txt = '白光炸开，对方捂住了眼睛。下一击必中。'; }
    else if (itemId === 't09') { p.mine = true; txt = '你把地雷放在了脚下。'; }
    else {
      const dmg = Math.max(1, Math.round(d.dmg * (1 + str / 200) * rf(0.9, 1.1) - e.def * 0.5));
      e.hp -= dmg;
      txt = `你扔出${d.name}，造成 ${dmg} 点伤害。`;
      p.noise += d.noise || 5;
      if (itemId === 't01' || itemId === 't02' || itemId === 't03') p.noise -= 3;
    }
    log(c, txt, 'good');
    if (p.log) p.log.push(txt);
    return { ok: true, msg: txt };
  }

  // 修理包
  if (d.repair) {
    const w = weaponOf(c);
    const inst = weaponInstance(c);
    if (!w || !inst) return { ok: false, msg: '你手上没有武器。' };
    if (inst.dur >= (w.maxDur || 100)) return { ok: false, msg: '武器还是好的，不用修。' };
    removeItem(c, itemId, 1);
    const before = inst.dur;
    inst.dur = Math.min(w.maxDur || 100, inst.dur + d.repair);
    log(c, `修好了${w.name}，耐久 ${before} → ${inst.dur}。`, 'good');
    return { ok: true, msg: `耐久 +${inst.dur - before}` };
  }

  // 特殊
  if (itemId === 'sp_map') {
    c.flags.mapUnlocked = true;
    log(c, '你展开油田地图，把每个区块的位置记了下来。', 'good');
    return { ok: true, msg: '地图已解锁。' };
  }
  if (itemId === 'sp_radio') {
    const zone = MAPD.BY_ID[c.pos];
    const nbs = MAPD.neighbors(zone.x, zone.y);
    const danger = nbs.map(n => `${n.name}(${n.danger})`).join('、');
    log(c, `对讲机里传来电流声，你大概判断出周边：${danger}。`, 'info');
    return { ok: true, msg: '收到情报。' };
  }
  return { ok: false, msg: '这件东西不能这样用。' };
}

function doUse(c, { itemId, n }) {
  return useItemInternal(c, itemId, c.scene, n);
}

// ---------- 战利品 ----------
function doLoot(c, { index, all }) {
  const p = c.pending;
  if (!p || !p.items) return { ok: false, msg: '没有可拾取的东西。' };
  if (all) {
    const taken = [];
    for (const it of [...p.items]) {
      if (!ITEMS[it.id]) { it.n = 0; continue; }
      const r = addItem(c, it.id, it.n);
      if (r.ok) { taken.push(`${ITEMS[it.id].name} x${r.added}`); it.n -= r.added; }
    }
    p.items = p.items.filter(i => i.n > 0);
    if (taken.length) {
      log(c, `拾取：${taken.join('、')}。`, 'loot');
      if (p.items.length) log(c, `背包满了，还剩 ${p.items.length} 样没拿走。`, 'warn');
    } else log(c, '背包满了，什么都拿不了。', 'warn');
  } else {
    const it = p.items[index];
    if (!it) return { ok: false, msg: '没有这件东西。' };
    if (!ITEMS[it.id]) return { ok: false, msg: '这东西已经不存在了。' };
    const r = addItem(c, it.id, it.n);
    if (!r.ok) return { ok: false, msg: '背包放不下，先丢点东西。' };
    log(c, `拾取 ${ITEMS[it.id].name} x${r.added}。`, 'loot');
    it.n -= r.added;
    p.items = p.items.filter(i => i.n > 0);
  }
  if (p.items.length === 0) {
    if (p.chain) {
      const zone = MAPD.BY_ID[c.pos];
      const e = makeEnemy(clamp(zone.danger, 1, 5), effAttr(c, 'luk'));
      c.pending = { enemy: e, source: 'chain', zoneName: p.zoneName, noise: 0, wave: (p.wave || 1) + 1 };
      c.scene = 'encounter';
      log(c, `又有人来了——${e.name}。这是第 ${c.pending.wave} 波。`, 'warn');
    } else {
      toMap(c);
    }
    return { ok: true, msg: '' };
  }
  // 东西没拿完：必须给前端一句话，否则玩家会以为按钮坏了
  return { ok: false, msg: `背包满了，还剩 ${p.items.length} 样没拿走——先丢掉或用掉点东西。` };
}

// ---------- 宝箱 ----------
function doBox(c, { index, all }) {
  const p = c.pending;
  if (!p || !p.items) return { ok: false, msg: '没有箱子。' };
  if (all) {
    const taken = [];
    for (const it of [...p.items]) {
      const r = addItem(c, it.id, it.n);
      if (r.ok) { taken.push(`${ITEMS[it.id].name} x${r.added}`); it.n -= r.added; }
    }
    p.items = p.items.filter(i => i.n > 0);
    if (taken.length) {
      log(c, `从箱子里拿走：${taken.join('、')}。`, 'loot');
      if (p.items.length) log(c, `背包满了，还剩 ${p.items.length} 样。`, 'warn');
    } else log(c, '背包满了。', 'warn');
  } else {
    const it = p.items[index];
    if (!it) return { ok: false, msg: '没有这件东西。' };
    const r = addItem(c, it.id, it.n);
    if (!r.ok) return { ok: false, msg: '背包放不下，先丢点东西。' };
    log(c, `拿走 ${ITEMS[it.id].name} x${r.added}。`, 'loot');
    it.n -= r.added;
    p.items = p.items.filter(i => i.n > 0);
  }
  if (p.items.length === 0) { toMap(c); return { ok: true, msg: '' }; }
  return { ok: false, msg: `背包满了，还剩 ${p.items.length} 样——先丢掉或用掉点东西。` };
}

// ---------- 装备 ----------
function doEquip(c, { itemId, index, plus }) {
  let idx = -1;
  if (typeof index === 'number' && c.bag[index] && c.bag[index].id === itemId) idx = index;
  else if (plus != null) idx = c.bag.findIndex(i => i.id === itemId && plusOf(i) === plusOf({ plus }));
  else idx = c.bag.findIndex(i => i.id === itemId);
  if (idx < 0) return { ok: false, msg: '背包里没有这件装备。' };
  const d = ITEMS[c.bag[idx].id];
  if (!['weapon', 'armor', 'bag'].includes(d.type)) return { ok: false, msg: '这不是可装备的物品。' };
  const slot = d.slot;
  const old = c.equip[slot];
  // 取出
  const entry = c.bag[idx];
  const keepPlus = plusOf(entry);
  if (entry.n > 1) entry.n -= 1; else c.bag.splice(idx, 1);

  const keepAffix = entry.affix && entry.affix.length ? entry.affix.map(a => ({ k: a.k, v: a.v })) : null;
  if (slot === 'weapon') {
    // 武器是实例，带耐久和改装槽；强化等级和附魔要一起带过去
    c.equip.weapon = { id: d.id, dur: d.maxDur || 100, mods: { sight: null, muzzle: null, grip: null } };
    if (keepPlus) c.equip.weapon.plus = keepPlus;
    if (keepAffix) c.equip.weapon.affix = keepAffix;
  } else {
    c.equip[slot] = { id: d.id };
    if (keepPlus) c.equip[slot].plus = keepPlus;
    if (keepAffix) c.equip[slot].affix = keepAffix;
  }

  if (old) {
    // 旧武器上的改装件先拆回背包，避免丢失
    if (old.mods) {
      for (const k in old.mods) {
        if (old.mods[k]) addItem(c, old.mods[k], 1);
      }
    }
    // 用 addEntry 而不是 addItem：旧装备的 +N 不能丢
    const r = addEntry(c, old);
    if (!r.ok) { c.bag.push({ id: old.id, n: 1, ...(plusOf(old) ? { plus: plusOf(old) } : {}) }); }
  }
  clampVitals(c);
  log(c, `装备了${d.name}${keepPlus ? ' +' + keepPlus : ''}。`, 'info');
  return { ok: true, msg: `已装备${d.name}` };
}

function doUnequip(c, { slot }) {
  const it = c.equip[slot];
  if (!it) return { ok: false, msg: '这个位置没有装备。' };
  const d = ITEMS[it.id];
  if (slot === 'weapon' && it.mods) {
    for (const k in it.mods) {
      if (it.mods[k]) addItem(c, it.mods[k], 1);
    }
  }
  const r = addEntry(c, it);   // 保留 +N，别用 addItem
  if (!r.ok) return { ok: false, msg: '背包放不下。' };
  c.equip[slot] = null;
  clampVitals(c);
  log(c, `卸下了${d.name}${plusOf(it) ? ' +' + plusOf(it) : ''}。`, 'info');
  return { ok: true, msg: '已卸下' };
}

// ---------- 强化 ----------
// 同种装备两件合一件：+0 → +1 → +2 → +3，属性按 10% / 20% / 30% 递增
const MAX_PLUS = 3;

// ---------- 强化词条 ----------
// 装备强化到 +2 时随机附一条人物属性，+3 时再补一条（共 2 条），单条上限 +10。
// 只对「装备中」的那件生效 —— 背包里的词条不叠加，避免靠塞背包白嫖属性。
const AFFIX_ATTRS = ['sta', 'str', 'cha', 'int', 'luk'];
const AFFIX_MAX = 10;
function rollAffix(existing, minV, maxV) {
  const out = (existing || []).map(a => ({ k: a.k, v: a.v }));
  const used = new Set(out.map(a => a.k));
  const pool = AFFIX_ATTRS.filter(k => !used.has(k));
  if (!pool.length) return out;
  const k = pool[Math.floor(Math.random() * pool.length)];
  out.push({ k, v: Math.min(AFFIX_MAX, ri(minV, maxV)) });
  return out;
}
// 确定性词条：同样的 seed 永远生成同一组，用于给老存档补词条（刷新不会变）
function seededAffix(seed, count, minV, maxV) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const pool = AFFIX_ATTRS.slice();
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const k = pool.splice(h % pool.length, 1)[0];
    h = (h * 1103515245 + 12345) >>> 0;
    out.push({ k, v: Math.min(AFFIX_MAX, minV + (h % (maxV - minV + 1))) });
  }
  return out;
}

// 词条文案：「幸运 +5 · 魅力 +10」
function affixText(entry) {
  const a = (entry && entry.affix) || [];
  if (!a.length) return '';
  return a.map(x => `${ATTR_CN[x.k] || x.k} +${x.v}`).join(' · ');
}

function plusOf(entry) { return clamp((entry && entry.plus) || 0, 0, MAX_PLUS); }
function plusMul(entry) { return 1 + plusOf(entry) * 0.1; }
// 强化后的数值：按 10% / 20% / 30% 算，但**至少 +N 点**。
// 不这么兜底的话，安全帽（基础防御 3）+1 后还是 3，玩家会觉得「强化了个寂寞」。
function plusValue(base, entry) {
  const b = base || 0;
  const p = plusOf(entry);
  if (!p) return b;
  return Math.max(b + p, Math.round(b * plusMul(entry)));
}
function entryDmg(entry) {
  const d = ITEMS[entry && entry.id];
  return d ? plusValue(d.dmg, entry) : 0;
}
function entryDef(entry) {
  const d = ITEMS[entry && entry.id];
  return d ? plusValue(d.defense, entry) : 0;
}
// 往背包里塞一件「带强化等级」的实例。不能用 addItem —— 那个只认 id，会把 +N 抹掉
function addEntry(c, entry) {
  const d = ITEMS[entry && entry.id];
  if (!d) return { ok: false, added: 0 };
  if (usedSlots(c) + (d.size || 1) > slots(c)) return { ok: false, added: 0 };
  const e = { id: entry.id, n: 1 };
  if (plusOf(entry)) e.plus = plusOf(entry);
  // 附魔词条也要跟着实例走，不然一卸装备就洗掉了
  if (entry.affix && entry.affix.length) e.affix = entry.affix.map(a => ({ k: a.k, v: a.v }));
  c.bag.push(e);
  return { ok: true, added: 1 };
}

// 找同 id 同强化等级的实例（装备位 + 背包），返回 [{kind, entry, idx}]
function findCopies(c, itemId, plus) {
  const d = ITEMS[itemId];
  if (!d) return [];
  const slot = d.type === 'weapon' ? 'weapon' : d.slot;
  const out = [];
  const eq = c.equip[slot];
  if (eq && eq.id === itemId && plusOf(eq) === plus) out.push({ kind: 'equip', entry: eq, slot });
  c.bag.forEach((it, idx) => {
    if (it.id === itemId && plusOf(it) === plus) out.push({ kind: 'bag', entry: it, idx });
  });
  return out;
}

function doEnhance(c, { itemId, plus }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const d = ITEMS[itemId];
  if (!d || (d.type !== 'weapon' && d.type !== 'armor')) return { ok: false, msg: '只有武器和防具能强化。' };
  const cur = clamp(parseInt(plus, 10) || 0, 0, MAX_PLUS);
  if (cur >= MAX_PLUS) return { ok: false, msg: `已经是 +${MAX_PLUS} 了，强化到头了。` };

  const copies = findCopies(c, itemId, cur);
  if (copies.length < 2) {
    return { ok: false, msg: `需要两件 ${d.name}${cur ? ' +' + cur : ''} 才能合成 +${cur + 1}。` };
  }
  // 装备中的那件优先当底，保住耐久和已装的改装件
  copies.sort((a, b) => (a.kind === 'equip' ? 0 : 1) - (b.kind === 'equip' ? 0 : 1));
  const base = copies[0], other = copies[1];

  if (other.kind === 'bag') c.bag.splice(other.idx, 1);
  else c.equip[other.slot] = null;

  const next = cur + 1;
  base.entry.plus = next;
  // +2 附 1 条词条，+3 再补 1 条（保留 +2 那条）
  let newAffix = '';
  if (next === 2) {
    base.entry.affix = rollAffix(null, 3, 6);
    newAffix = affixText(base.entry);
  } else if (next === 3) {
    base.entry.affix = rollAffix(base.entry.affix, 5, 10);
    newAffix = affixText(base.entry);
  }
  if (base.kind === 'equip' && d.type === 'weapon') {
    // 装备中的武器要保证实例字段齐全
    const inst = weaponInstance(c);
    if (inst) {
      inst.plus = next;
      if (base.entry.affix) inst.affix = base.entry.affix;
    }
  }
  clampVitals(c);
  const where = base.kind === 'equip' ? 'equip' : 'bag';
  const whereCn = where === 'equip' ? '装备中' : '背包里';
  log(c, `强化成功：${d.name} ${cur ? '+' + cur : ''} ×2 → +${next}（${whereCn}，属性 +${next * 10}%）${newAffix ? `，附魔：${newAffix}` : ''}。`, 'good');
  if (newAffix) log(c, `装备上浮现出新的纹路：${newAffix}。`, 'good');
  return { ok: true, msg: `强化到 +${next}${newAffix ? `（${newAffix}）` : ''}`, plus: next, where, affix: base.entry.affix || null };
}

// ---------- 武器改装 ----------
function doMod(c, { action, slot, itemId }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const w = weaponOf(c);
  const inst = weaponInstance(c);
  if (!w || !inst) return { ok: false, msg: '你手上没有武器。' };
  if (!w.moddable) return { ok: false, msg: `${w.name}没有改装槽位，只有火器能改。` };

  if (action === 'install') {
    const d = ITEMS[itemId];
    if (!d || !d.modSlot) return { ok: false, msg: '这个装不上去。' };
    if (countItem(c, itemId) <= 0) return { ok: false, msg: '背包里没有这个配件。' };
    if (inst.mods[d.modSlot]) {
      // 先拆旧的
      addItem(c, inst.mods[d.modSlot], 1);
    }
    removeItem(c, itemId, 1);
    inst.mods[d.modSlot] = itemId;
    log(c, `给${w.name}装上了${d.name}。`, 'good');
    return { ok: true, msg: `装上${d.name}` };
  }

  if (action === 'remove') {
    if (!inst.mods[slot]) return { ok: false, msg: '这个槽位是空的。' };
    const old = inst.mods[slot];
    const r = addItem(c, old, 1);
    if (!r.ok) return { ok: false, msg: '背包放不下。' };
    inst.mods[slot] = null;
    log(c, `从${w.name}上拆下了${ITEMS[old].name}。`, 'info');
    return { ok: true, msg: '已拆下' };
  }

  return { ok: false, msg: '未知操作。' };
}

// ---------- 合成 ----------
function doCraft(c, { recipeId }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r) return { ok: false, msg: '没有这个配方。' };
  const int = effAttr(c, 'int');
  if (int < r.reqInt) return { ok: false, msg: `智力不足（需要 ${r.reqInt}）。` };
  if (r.reqLv && (c.level || 1) < r.reqLv) return { ok: false, msg: `等级不够（需要 Lv.${r.reqLv}）。` };
  // 材料检查
  for (const [id, n] of r.inp) {
    if (countItem(c, id) < n) return { ok: false, msg: `材料不足：${ITEMS[id].name} 需要 ${n} 个。` };
  }
  // 扣材料
  for (const [id, n] of r.inp) removeItem(c, id, n);

  // 空间检查放在扣材料之后：材料腾出来的格子也算可用空间。
  // 放不下就把材料还回去——绝不能出现「材料没了、成品也没了」。
  const [oid, on] = r.out;
  if (!canFit(c, oid, on)) {
    for (const [id, n] of r.inp) addItem(c, id, n);
    return { ok: false, msg: `背包放不下 ${ITEMS[oid].name}，先腾出一格再来。` };
  }

  c.turn++;
  c.ep = Math.max(0, c.ep - 2);

  const succ = clamp(30 + int * 0.7 - r.diff * 8, 5, 100);
  const ok = int >= 100 ? true : Math.random() * 100 < succ;
  if (ok) {
    const add = addItem(c, oid, on);
    // 兜底：canFit 已经挡过一层，这里再确认一次，避免再出现「合成成功 x0」
    if (add.added < on) {
      if (add.added > 0) removeItem(c, oid, add.added);
      for (const [id, n] of r.inp) addItem(c, id, n);
      log(c, '背包放不下，合成取消，材料已退回。', 'bad');
      return { ok: false, msg: '背包放不下成品，材料已退回。' };
    }
    log(c, `合成成功：${ITEMS[oid].name} x${add.added}。`, 'good');
    // crafts 以前只声明从来没累加过，导致「手艺人」成就永远解不了，排名也拿不到手艺分
    c.stats.crafts = (c.stats.crafts || 0) + 1;
    checkDeath(c);
    return { ok: true, msg: `成功制作 ${ITEMS[oid].name} x${add.added}` };
  }
  log(c, `合成失败，材料全毁了。`, 'bad');
  checkDeath(c);
  return { ok: true, msg: '合成失败，材料损失。' };
}

// ---------- 人质心情 ----------
// 心情会自己波动：开心时才愿意搭理你（挑逗），一般/不开心就拒绝
const MOODS = {
  happy: { id: 'happy', name: '开心', color: '#6fa84f' },
  normal: { id: 'normal', name: '一般', color: '#c8a03a' },
  sad: { id: 'sad', name: '不开心', color: '#c8453a' },
};
function rollMood() {
  const r = Math.random() * 100;
  if (r < 32) return 'happy';
  if (r < 78) return 'normal';
  return 'sad';
}
function tickHostageMood(c) {
  if (!c || !c.hostages) return;
  const now = Date.now();
  for (const h of c.hostages) {
    if (typeof h.songs !== 'number') h.songs = 0;
    if (!h.mood || now >= (h.moodUntil || 0)) {
      h.mood = rollMood();
      h.moodUntil = now + ri(90, 240) * 1000;
    }
  }
}

// 挑逗：只有心情开心才行，20% 成功。成功了她就给你唱首歌或者讲个故事
function doTease(c, { index }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  tickHostageMood(c);
  const h = (c.hostages || [])[index];
  if (!h) return { ok: false, msg: '没有这个人。' };
  const m = MOODS[h.mood] || MOODS.normal;
  if (h.mood !== 'happy') return { ok: false, msg: `${h.name}现在心情${m.name}，不想理你。` };
  if (Math.random() < 0.2) {
    h.songs = (h.songs || 0) + 1;
    c.stats.songs = (c.stats.songs || 0) + 1;
    const isSong = Math.random() < 0.5;
    if (isSong) {
      log(c, `你逗了她两句，她笑了，小声哼起一支老歌。调子跑得厉害，但在这地方听着挺好。`, 'story');
    } else {
      log(c, `你逗了她两句，她话匣子打开了，讲起小时候在油田家属院的事。讲了很久。`, 'story');
    }
    h.mood = 'happy';
    h.moodUntil = Date.now() + ri(120, 300) * 1000;
    return { ok: true, msg: isSong ? `${h.name}给你唱了首歌。` : `${h.name}给你讲了个故事。` };
  }
  log(c, `${h.name}白了你一眼，没接话。`, 'story');
  h.mood = 'normal';
  h.moodUntil = Date.now() + ri(90, 180) * 1000;
  return { ok: true, msg: '没成。' };
}

// ---------- 以物换物 ----------
// 摊主这类剧情会真的拿走一件东西：只挑背包里最不值钱的，
// 不碰装备、不碰特殊道具（钥匙/地图）、不碰改装件，避免玩家被坑到没法继续
function takeOneForTrade(c) {
  const cands = [];
  for (const it of c.bag) {
    const d = ITEMS[it.id];
    if (!d) continue;
    if (d.type === 'special') continue;
    if (d.modSlot) continue;
    cands.push({ id: it.id, rarity: d.rarity || 1 });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.rarity - b.rarity);
  const pickOne = cands[0];
  removeItem(c, pickOne.id, 1);
  return pickOne.id;
}

// ---------- 人质 ----------
function doHostage(c, { choice }) {
  const p = c.pending;
  if (!p || !p.hostage) return { ok: false, msg: '这里没有人质。' };
  const h = p.hostage;
  h.done = true;

  let taken = false;
  const asked = choice === 'ask';

  if (asked) {
    const cha = effAttr(c, 'cha'), luk = effAttr(c, 'luk');
    const chance = clamp(30 + cha * 0.55 + luk * 0.15, 5, 95);
    taken = Math.random() * 100 < chance;
    if (taken) {
      c.stats.savedHostages++;
      c.hostages.push({ name: h.name, at: Date.now(), mood: 'normal', moodUntil: Date.now() + ri(60, 150) * 1000, songs: 0 });
      log(c, `你割断绳子。${h.name}站起来，看了你很久，然后跟在你身后。`, 'good');
      if (Math.random() < 0.4) {
        const gifts = [['med01', 1], ['med04', 1], ['m_cloth', 2], ['m_rope', 1], ['med08', 1]];
        const [gid, gn] = pick(gifts);
        const r = addItem(c, gid, gn);
        if (r.ok) log(c, `她塞给你 ${ITEMS[gid].name} x${r.added}。`, 'good');
      }
    } else {
      log(c, `你割断绳子。${h.name}摇头，往后退了两步，转身跑进了巷子。`, 'warn');
    }
  } else {
    log(c, '你割断绳子，什么也没说，转身走了。', 'info');
  }

  // 不直接跳战利品，先交给前端播表情反馈
  c.scene = 'hostage_result';
  c.pending = {
    hostage: h, taken, asked,
    drops: p.drops || [], enemyName: p.enemyName,
    chain: p.chain, wave: p.wave, zoneName: p.zoneName,
  };
  return { ok: true, msg: '' };
}

// 表情播完，进入战利品
function doHostageDone(c) {
  const p = c.pending;
  if (!p || c.scene !== 'hostage_result') return { ok: false, msg: '' };
  c.scene = 'loot';
  c.pending = {
    items: p.drops || [], enemyName: p.enemyName,
    chain: p.chain, wave: p.wave, zoneName: p.zoneName,
  };
  return { ok: true, msg: '' };
}

// ---------- 七娃 ----------
function doSevenWa(c, { choice }) {
  const p = c.pending;
  if (!p) return { ok: false, msg: '这里没有谁。' };

  if (choice === 'talk') {
    const chance = W.settings().sevenWaChance != null ? W.settings().sevenWaChance : SEVEN_WA.chance;
    if (Math.random() * 100 < chance) {
      c.career.sevenWa = (c.career.sevenWa || 0) + 1;
      c.flags.sevenWaHome = true;
      c.scene = 'sevenwin';
      c.pending = { total: c.career.sevenWa, name: SEVEN_WA.name };
      log(c, SEVEN_WA.success, 'story');
      log(c, '你牵着他往油田外面走。身后的广播还在响，但已经跟你没关系了。', 'sys');
      return { ok: true, msg: '你带走了七娃。' };
    }
    c.flags.sevenWaCooldown = Date.now() + 60 * 1000;
    log(c, SEVEN_WA.fail, 'story');
    log(c, SEVEN_WA.moveAway, 'info');
    toMap(c);
    return { ok: true, msg: '' };
  }

  c.flags.sevenWaCooldown = Date.now() + 30 * 1000;
  log(c, '你没停下，继续往前走。', 'info');
  toMap(c);
  return { ok: true, msg: '' };
}

// ---------- 刘颖 ----------
function doLiuying(c, { choice, answer }) {
  const p = c.pending;
  if (!p) return { ok: false, msg: '这里没有人。' };

  if (p.stage === 'pill') {
    if (choice !== 'red' && choice !== 'blue') return { ok: false, msg: '选一颗药丸。' };
    c.stats.liuying = (c.stats.liuying || 0) + 1;
    p.color = choice;
    p.stage = 'quiz';
    log(c, LIUYING.quizIntro, 'story');
    return { ok: true, msg: '' };
  }

  if (p.stage === 'quiz') {
    const q = p.question;
    const correct = parseInt(answer, 10) === q.correct;
    p.correct = correct;
    const negChance = correct ? LIUYING.negChanceRight : LIUYING.negChanceWrong;
    const negative = Math.random() * 100 < negChance;
    log(c, correct ? LIUYING.right : LIUYING.wrong, 'story');

    // 红药丸偏体魄，蓝药丸偏心智
    const pool = p.color === 'red' ? ['sta', 'str', 'cha'] : ['cha', 'int', 'luk'];
    const n = ri(1, Math.min(3, pool.length));
    const copy = [...pool];
    const picked = [];
    for (let i = 0; i < n && copy.length; i++) {
      picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    if (!c.tempBuffs) c.tempBuffs = {};
    const until = Date.now() + LIUYING.durationMs;
    const effects = picked.map(k => {
      const mag = ri(5, 20);
      const v = negative ? -mag : mag;
      c.tempBuffs[k] = { v, until };
      return { k, v };
    });
    p.stage = 'result';
    p.negative = negative;
    p.effects = effects;
    p.until = until;
    c.flags.liuyingUntil = until;
    log(c, negative ? '药丸下肚。有什么东西在往下沉。' : '药丸下肚。身体轻了一点。', negative ? 'bad' : 'good');
    return { ok: true, msg: '' };
  }

  if (p.stage === 'result') {
    toMap(c);
    return { ok: true, msg: '' };
  }
  return { ok: false, msg: '' };
}

// ---------- 常驻 NPC ----------
function grantFavor(c, npc) {
  if (!c.npcRewarded) c.npcRewarded = {};
  const favor = c.npcFavor[npc.id] || 0;
  const got = c.npcRewarded[npc.id] || [];
  const out = [];
  for (const r of (npc.favorRewards || [])) {
    if (favor >= r.favor && !got.includes(r.favor)) {
      const res = addItem(c, r.item, r.n);
      if (res.ok) {
        got.push(r.favor);
        out.push({ text: r.text, item: ITEMS[r.item].name, n: res.added });
        log(c, r.text, 'good');
      }
    }
  }
  c.npcRewarded[npc.id] = got;
  return out;
}

function doNpc(c, { npcId, choice, itemId }) {
  const npc = NPCD.BY_ID[npcId];
  if (!npc) return { ok: false, msg: '没有这个人。' };

  if (choice === 'open') {
    if (c.pos !== npc.zone) return { ok: false, msg: '他不在这里。' };
    if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
    c.scene = 'npc';
    c.pending = { npcId, log: [] };
    return { ok: true, msg: '' };
  }

  if (c.scene !== 'npc' || !c.pending || c.pending.npcId !== npcId) {
    return { ok: false, msg: '你现在不在他面前。' };
  }
  if (!c.pending.log) c.pending.log = [];

  if (choice === 'talk') {
    const last = c.npcTalkTurn[npcId];
    const cd = npc.cooldown || 3;
    if (last != null && c.turn - last < cd) {
      return { ok: false, msg: `他不想再多说了，过 ${cd - (c.turn - last)} 回合再来。` };
    }
    c.npcTalkTurn[npcId] = c.turn;
    c.npcFavor[npcId] = Math.min(npc.maxFavor || 6, (c.npcFavor[npcId] || 0) + 1);
    const line = pick(npc.talks);
    c.pending.log.push(line);
    log(c, `${npc.name}：${line}`, 'npc');
    const rewards = grantFavor(c, npc);
    rewards.forEach(r => c.pending.log.push(r.text));
    return { ok: true, msg: rewards.length ? '他给了你点东西' : '' };
  }

  if (choice === 'buy') {
    const entry = (npc.shop || []).find(s => s[0] === itemId);
    if (!entry) return { ok: false, msg: '他不卖这个。' };
    const price = entry[1];
    if ((c.gold || 0) < price) return { ok: false, msg: `钱不够，要 ${price}，你有 ${c.gold || 0}。` };
    const r = addItem(c, itemId, 1);
    if (!r.ok) return { ok: false, msg: '背包放不下。' };
    c.gold -= price;
    c.stats.bought++;
    const t = `你花 ${price} 买下 ${ITEMS[itemId].name}。`;
    c.pending.log.push(t);
    log(c, `向${npc.name}买了${ITEMS[itemId].name}，花 ${price}。`, 'good');
    return { ok: true, msg: `买下 ${ITEMS[itemId].name}` };
  }

  if (choice === 'repair') {
    if (npc.special !== 'repair') return { ok: false, msg: '他不会修。' };
    const w = weaponOf(c), inst = weaponInstance(c);
    if (!w || !inst) return { ok: false, msg: '你手上没有武器。' };
    if (inst.dur >= (w.maxDur || 100)) return { ok: false, msg: '你的武器还是好的。' };
    const cost = 40;
    if ((c.gold || 0) < cost) return { ok: false, msg: `修一次 ${cost} 块，你钱不够。` };
    c.gold -= cost;
    const before = inst.dur;
    inst.dur = w.maxDur || 100;
    const t = `他把${w.name}拆开又装上，收了你 ${cost} 块。`;
    c.pending.log.push(t);
    log(c, `${npc.name}把${w.name}修好了，耐久 ${before} → ${inst.dur}。`, 'good');
    return { ok: true, msg: '修好了' };
  }

  if (choice === 'leave') {
    toMap(c);
    return { ok: true, msg: '' };
  }

  return { ok: false, msg: '未知操作。' };
}

// ---------- 商店 ----------
function doShopBuy(c, { itemId, n }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const m = SHOP.merchantAt(c.pos);
  if (!m) return { ok: false, msg: '这个区块没有商人。' };
  const basePrice = SHOP.priceOf(itemId, m.markup);
  if (basePrice == null) return { ok: false, msg: '他不卖这个。' };
  const shopMul = W.settings().shopMul != null ? W.settings().shopMul : 1;
  const price = Math.max(1, Math.round(basePrice * shopMul));
  const cnt = clamp(parseInt(n, 10) || 1, 1, 99);
  const cost = price * cnt;
  if (c.gold < cost) return { ok: false, msg: `钱不够，要 ${cost}，你身上只有 ${c.gold}。` };
  const r = addItem(c, itemId, cnt);
  if (!r.ok) return { ok: false, msg: '背包放不下。' };
  c.gold -= cost;
  c.stats.bought += r.added;
  log(c, `花 ${price * r.added} 块买下 ${ITEMS[itemId].name} x${r.added}，还剩 ${c.gold}。`, 'good');
  return { ok: true, msg: `买下 ${ITEMS[itemId].name} x${r.added}` };
}

function doShopSell(c, { itemId, n }) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const m = SHOP.merchantAt(c.pos);
  if (!m) return { ok: false, msg: '这个区块没有商人。' };
  const price = SHOP.sellPrice(itemId);
  if (price == null) return { ok: false, msg: '他不收这个。' };
  const cnt = clamp(parseInt(n, 10) || 1, 1, 99);
  if (countItem(c, itemId) < cnt) return { ok: false, msg: '你没有这么多。' };
  removeItem(c, itemId, cnt);
  const goldRate = W.settings().goldRate != null ? W.settings().goldRate : 1;
  const gain = Math.max(1, Math.round(price * cnt * goldRate));
  c.gold += gain;
  c.stats.sold += cnt;
  c.stats.goldEarned += gain;
  log(c, `卖掉 ${ITEMS[itemId].name} x${cnt}，拿到 ${gain} 块。`, 'good');
  return { ok: true, msg: `卖出 ${ITEMS[itemId].name} x${cnt}` };
}

// ---------- 成就 ----------
function checkAchievements(c) {
  if (!c.achievements) c.achievements = {};
  if (!c.roundTitles) c.roundTitles = {};
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    let hit = false;
    try { hit = !!a.check(c); } catch (e) { hit = false; }
    if (!hit) continue;
    if (!c.achievements[a.id]) {
      c.achievements[a.id] = Date.now();
      unlocked.push({ id: a.id, title: a.title, icon: a.icon, desc: a.desc, tier: a.tier });
      log(c, `解锁称号：${a.title} —— ${a.desc}`, 'sys');
    }
    // 本轮排名只认「本轮达成的」：careerOnly 的跨轮里程碑永远不计分，
    // 其它成就用 roundCheck（有就优先用）判断本轮是否真的做到了
    if (!a.careerOnly && !c.roundTitles[a.id]) {
      let rh = hit;
      if (a.roundCheck) { try { rh = !!a.roundCheck(c); } catch (e) { rh = false; } }
      if (rh) c.roundTitles[a.id] = Date.now();
    }
  }
  return unlocked;
}

// ---------- 整理背包 ----------
// 按类别聚在一起，同类里稀有度高的在前
const BAG_TYPE_ORDER = ['weapon', 'armor', 'bag', 'med', 'throwable', 'ammo', 'material', 'buff', 'special'];

function doSortBag(c) {
  if (c.scene !== 'map') return { ok: false, msg: '先处理眼前的事。' };
  const before = c.bag.map(i => i.id).join(',');
  c.bag.sort((a, b) => {
    const da = ITEMS[a.id], db = ITEMS[b.id];
    if (!da || !db) return 0;
    const ia = BAG_TYPE_ORDER.indexOf(da.type);
    const ib = BAG_TYPE_ORDER.indexOf(db.type);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    if (da.rarity !== db.rarity) return (db.rarity || 1) - (da.rarity || 1);
    return String(da.name).localeCompare(String(db.name), 'zh');
  });
  const after = c.bag.map(i => i.id).join(',');
  if (before === after) return { ok: true, msg: '背包本来就是整整齐齐的。' };
  log(c, '你把背包重新归置了一遍，同类的东西都挨在一起了。', 'info');
  return { ok: true, msg: '背包已整理' };
}

// ---------- 丢弃 ----------
function doDrop(c, { itemId, n, plus, ids }) {
  // 批量：背包勾选后一键丢弃。ids = [{ id, plus, n }]
  if (Array.isArray(ids)) {
    const lost = [];
    for (const spec of ids) {
      const d = ITEMS[spec.id];
      if (!d) continue;
      const want = Math.max(1, parseInt(spec.n, 10) || 1);
      if (spec.plus != null) {
        // 精确丢掉某个强化等级的那一件，别把 +3 当成 +0 丢了
        let left = want;
        for (let i = c.bag.length - 1; i >= 0 && left > 0; i--) {
          if (c.bag[i].id !== spec.id || plusOf(c.bag[i]) !== plusOf({ plus: spec.plus })) continue;
          c.bag.splice(i, 1); left--;
        }
        if (left === want) continue;
        lost.push(`${d.name}${spec.plus ? ' +' + spec.plus : ''}`);
      } else {
        if (countItem(c, spec.id) < want) continue;
        removeItem(c, spec.id, want);
        lost.push(`${d.name} x${want}`);
      }
    }
    if (!lost.length) return { ok: false, msg: '没丢掉任何东西。' };
    log(c, `一口气丢掉了：${lost.join('、')}。`, 'info');
    return { ok: true, msg: `丢掉 ${lost.length} 样` };
  }

  // 单件、指定强化等级（同一等级可能有好几件，n 要照做）
  if (plus != null) {
    let left = Math.max(1, parseInt(n, 10) || 1);
    let removed = 0;
    for (let i = c.bag.length - 1; i >= 0 && left > 0; i--) {
      if (c.bag[i].id !== itemId || plusOf(c.bag[i]) !== plusOf({ plus })) continue;
      c.bag.splice(i, 1); left--; removed++;
    }
    if (!removed) return { ok: false, msg: '背包里没有这件。' };
    log(c, `丢掉了 ${ITEMS[itemId].name}${plus ? ' +' + plus : ''} x${removed}。`, 'info');
    return { ok: true, msg: '已丢弃' };
  }

  if (countItem(c, itemId) < (n || 1)) return { ok: false, msg: '数量不对。' };
  removeItem(c, itemId, n || 1);
  log(c, `丢掉了 ${ITEMS[itemId].name} x${n || 1}。`, 'info');
  return { ok: true, msg: '已丢弃' };
}

// 结算：胜利画面点「结算」后落库，/api/state 不再返回这个角色，前端回到下一轮等待区
function doSettle(c) {
  c.flags.settled = true;
  c.scene = 'settled';
  c.pending = null;
  return { ok: true, msg: '' };
}

function doClose(c) {
  if (c.scene === 'loot' || c.scene === 'box') {
    const p = c.pending;
    if (p && p.items && p.items.length) {
      log(c, '你留下了剩下的东西。', 'info');
    }
    if (p && p.chain) {
      const zone = MAPD.BY_ID[c.pos];
      const e = makeEnemy(clamp(zone.danger, 1, 5), effAttr(c, 'luk'));
      c.pending = { enemy: e, source: 'chain', zoneName: p.zoneName, noise: 0, wave: (p.wave || 1) + 1 };
      c.scene = 'encounter';
      log(c, `又有人来了——${e.name}。`, 'warn');
      return { ok: true, msg: '' };
    }
    toMap(c);
    return { ok: true, msg: '' };
  }
  if (c.scene === 'encounter') return { ok: false, msg: '必须做出选择。' };
  if (c.scene === 'hostage') return { ok: false, msg: '先决定她的去留。' };
  if (c.scene === 'hostage_result') return { ok: false, msg: '等她说完。' };
  return { ok: true, msg: '' };
}

// ---------- 前端快照 ----------
function snapshot(c) {
  tickHostageMood(c);
  const zone = MAPD.BY_ID[c.pos];
  const w = weaponOf(c);
  const inst = weaponInstance(c);
  const merchant = SHOP.merchantAt(c.pos);
  const npcHere = NPCD.at(c.pos);
  const st = currentStatus(c);
  const now = Date.now();
  const tempBuffs = {};
  if (c.tempBuffs) {
    for (const k in c.tempBuffs) {
      const tb = c.tempBuffs[k];
      if (tb && now < tb.until) tempBuffs[k] = tb;
    }
  }

  // 实战数值：全部按当前装备和状态算好，前端直接显示
  const str = effAttr(c, 'str'), cha = effAttr(c, 'cha'), int = effAttr(c, 'int'), luk = effAttr(c, 'luk');
  const modsNow = (inst && inst.mods) || {};
  // 面板上的「攻击」是单发伤害（不含连发加成），强化 +N 已经算进去
  const weaponDmg = w ? entryDmg(inst) * (modsNow.grip ? 1.08 : 1) : 5;
  const wxNow = W.weatherNow();
  const attack = Math.round(weaponDmg * (1 + str / 150) * (st.atkMul || 1) * (wxNow.atkMul || 1));
  const defense = playerDef(c);
  const hit = Math.round(clamp(82 + luk * 0.12 + (modsNow.sight ? 12 : 0) + (st.hitBonus || 0) - (st.hitPenalty || 0) + (wxNow.accMod || 0), 15, 98));
  const crit = Math.round(clamp(8 + luk * 0.25, 0, 60));
  const spare = Math.round(clamp(35 + cha * 0.65, 5, 100));
  const craft = Math.round(clamp(30 + int * 0.7, 5, 100));

  return {
    scene: c.scene,
    char: {
      name: c.name,
      attrs: c.attrs,
      buffs: c.buffs || {},
      tempBuffs,
      eff: Object.fromEntries(ATTRS.map(k => [k, effAttr(c, k)])),
      hp: Math.round(c.hp), hpMax: hpMax(c),
      ep: Math.round(c.ep), epMax: epMax(c),
      gold: c.gold || 0,
      invincible: !!c.invincible,
      status: {
        id: st.id, name: st.name, color: st.color, desc: st.desc,
        until: (c.status && c.status.type !== 'normal') ? c.status.until : 0,
        leftMs: (c.status && c.status.type !== 'normal') ? Math.max(0, c.status.until - now) : 0,
      },
      frozenLeftMs: Math.max(0, (c.frozenUntil || 0) - now),
      combat: { attack, defense, hit, crit, spare, craft, weaponDmg },
      equip: c.equip,
      bag: c.bag,
      slots: slots(c), used: usedSlots(c),
      pos: c.pos, turn: c.turn, kills: c.kills,
      level: c.level || 1,
      exp: c.exp || 0,
      expNext: expNeed(c.level || 1),
      maxLevel: MAX_LEVEL,
      alive: c.alive,
      flags: c.flags,
      achievements: c.achievements || {},
      stats: c.stats || {},
      career: c.career || {},
      hostages: c.hostages || [],
      roundId: c.roundId,
    },
    zone: { id: zone.id, name: zone.name, x: zone.x, y: zone.y, region: zone.region, danger: zone.danger, loot: zone.loot, type: zone.type, desc: zone.desc },
    neighbors: MAPD.neighbors(zone.x, zone.y).map(z => ({ id: z.id, name: z.name, x: z.x, y: z.y, region: z.region, danger: z.danger })),
    pending: c.pending,
    log: (c.log || []).slice(-40),
    weapon: w ? {
      id: w.id, name: w.name, dmg: entryDmg(inst), baseDmg: w.dmg, noise: w.noise, ammo: w.ammo,
      dur: inst && inst.dur != null ? inst.dur : (w.maxDur || 0),
      maxDur: w.maxDur || 0,
      mods: (inst && inst.mods) || {},
      moddable: !!w.moddable,
      plus: plusOf(inst),
      fire: w.fire || null,
      fireName: w.fire && FIRE_MODES[w.fire] ? FIRE_MODES[w.fire].name : '',
      shots: w.fire && FIRE_MODES[w.fire] ? FIRE_MODES[w.fire].shots : 1,
    } : null,
    def: playerDef(c),
    mapUnlocked: !!c.flags.mapUnlocked,
    merchant: merchant ? {
      name: merchant.name, greet: merchant.greet, markup: merchant.markup,
      shopMul: W.settings().shopMul != null ? W.settings().shopMul : 1,
    } : null,
    npc: npcHere ? (() => {
      const favor = c.npcFavor[npcHere.id] || 0;
      const last = c.npcTalkTurn[npcHere.id];
      const cd = npcHere.cooldown || 3;
      const cdLeft = last != null ? Math.max(0, cd - (c.turn - last)) : 0;
      return {
        id: npcHere.id, name: npcHere.name, title: npcHere.title,
        greet: npcHere.greet[0],
        favor, maxFavor: npcHere.maxFavor || 6,
        shop: npcHere.shop || [],
        special: npcHere.special || null,
        canTalk: cdLeft === 0,
        cdLeft,
      };
    })() : null,
    bossHere: zone.id === FINAL_BOSS.zone && !c.flags.bossDefeated,
    bossSpawned: !!W.round().bossSpawned,
    weather: (() => {
      const wx = W.weatherNow();
      return { id: wx.id, name: wx.name, icon: wx.icon, color: wx.color, desc: wx.desc, tip: wx.tip || '' };
    })(),
    supplyHere: !!(W.get().supply && W.get().supply.zone === c.pos),
    // 空投位置做成全局可见，不然只有站在那个区块的人知道箱子在哪
    supplyZone: (W.get().supply && (MAPD.BY_ID[W.get().supply.zone] || {}).name) || '',
    supplyLeftMs: W.get().supply ? Math.max(0, W.get().supply.until - Date.now()) : 0,
  };
}

// 供 GM / 后台调用的底层工具
function giveItem(c, itemId, n) { return addItem(c, itemId, n || 1); }
function takeItem(c, itemId, n) { return removeItem(c, itemId, n || 1); }
function addGold(c, n) { c.gold = Math.max(0, (c.gold || 0) + n); return c.gold; }

module.exports = {
  createChar, migrateChar, act, snapshot, hpMax, epMax, effAttr, usedSlots, slots,
  playerDef, checkAchievements, syncCareerAchievements, giveItem, takeItem, addGold, gainExp, expNeed,
  ATTRS, ATTR_CN, ATTR_TIPS, SLOT_CN, BASE_SLOTS, ITEMS, MAX_LEVEL, MOODS,
  MAX_PLUS, plusOf, plusMul, entryDmg, entryDef, findCopies, FIRE_MODES,
  AFFIX_ATTRS, AFFIX_MAX, affixText, seededAffix,
  scoreOf, RANK_WEIGHT,
};
