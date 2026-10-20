// 数据与逻辑自检
const path = require('path');
const MAPD = require('./data/map');
const ITEMD = require('./data/items');
const { RECIPES } = require('./data/recipes');
const { ENEMIES, LOOT_TABLE } = require('./data/enemies');
const EV = require('./data/events');
const G = require('./game');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fail++; }
}

console.log('\n=== 地图 ===');
ok(MAPD.MAP.length === 64, `区块总数 64（实际 ${MAPD.MAP.length}）`);
const byRegion = {};
MAPD.MAP.forEach(z => { byRegion[z.region] = (byRegion[z.region] || 0) + 1; });
ok(byRegion.guanghua === 20, `广华 20（实际 ${byRegion.guanghua}）`);
ok(byRegion.xiangyang === 20, `向阳 20（实际 ${byRegion.xiangyang}）`);
ok(byRegion.wuqi === 20, `五七 20（实际 ${byRegion.wuqi}）`);
ok(byRegion.shihao === 4, `十号地 4（实际 ${byRegion.shihao}）`);
ok(MAPD.BY_ID[MAPD.SPAWN_ID].name === '十号地', `出生点为十号地`);
const names = new Set(MAPD.MAP.map(z => z.name));
ok(names.size === 64, `区块名无重复（${names.size}）`);
// 连通性：每格四邻
let isolated = MAPD.MAP.filter(z => MAPD.neighbors(z.x, z.y).length === 0);
ok(isolated.length === 0, '无孤立区块');

console.log('\n=== 物品 ===');
const all = ITEMD.all();
const weapons = all.filter(i => i.type === 'weapon');
const armors = all.filter(i => i.type === 'armor');
const bags = all.filter(i => i.type === 'bag');
ok(weapons.length >= 20, `武器 ≥20 套（实际 ${weapons.length}）`);
ok(armors.length >= 26, `防具 ≥26 件（实际 ${armors.length}）`);
ok(bags.length === 5, `背包 5 种（实际 ${bags.length}）`);
const slots = new Set(armors.map(a => a.slot));
['head', 'body', 'hands', 'legs', 'face', 'feet'].forEach(s => ok(slots.has(s), `防具覆盖部位 ${s}`));
ok(bags[bags.length - 1].bagBonus === 100, '最大背包 +100 格');

// 武器弹药引用有效
let badAmmo = weapons.filter(w => w.ammo && !ITEMD.get(w.ammo));
ok(badAmmo.length === 0, '武器弹药引用全部有效');

console.log('\n=== 配方 ===');
let badMat = [];
RECIPES.forEach(r => {
  r.inp.forEach(([id]) => { if (!ITEMD.get(id)) badMat.push(r.id + ':' + id); });
  if (!ITEMD.get(r.out[0])) badMat.push(r.id + ':out:' + r.out[0]);
});
ok(badMat.length === 0, `配方引用全部有效${badMat.length ? ' —— ' + badMat.join(',') : ''}`);
ok(RECIPES.length >= 30, `配方数量 ${RECIPES.length}`);

console.log('\n=== 掉落表 ===');
let badLoot = [];
for (const t in LOOT_TABLE) {
  LOOT_TABLE[t].forEach(x => { if (!ITEMD.get(x[0])) badLoot.push(t + ':' + x[0]); });
}
ok(badLoot.length === 0, `掉落引用全部有效${badLoot.length ? ' —— ' + badLoot.join(',') : ''}`);
ok(ENEMIES.length >= 20, `敌人 ${ENEMIES.length} 种`);

console.log('\n=== 建角 ===');
const c = G.createChar('测试员');
ok(c.attrs.sta >= 8 && c.attrs.sta <= 18, `初始体力在 20 以内（${c.attrs.sta}）`);
ok(Object.values(c.attrs).every(v => v <= 20), '所有初始属性 ≤ 20');
ok(c.hp === G.hpMax(c), `初始生命满（${c.hp}）`);
ok(c.bag.length > 0, `初始背包 ${c.bag.length} 项`);
ok(c.pos === MAPD.SPAWN_ID, '出生在十号地');

console.log('\n=== 模拟 20 局（带基本策略的 AI） ===');
let survived = 0, totalTurn = 0, totalKills = 0;
const turnList = [];
for (let g = 0; g < 20; g++) {
  const c = G.createChar('bot' + g);
  for (let step = 0; step < 4000 && c.scene !== 'dead'; step++) {
    const sc = c.scene;
    let r;
    if (sc === 'map') {
      if (c.ep < 22) { r = G.act(c, 'rest'); continue; }
      const nb = MAPD.neighbors(MAPD.BY_ID[c.pos].x, MAPD.BY_ID[c.pos].y);
      const roll = Math.random();
      if (roll < 0.5) { const t = nb[Math.floor(Math.random() * nb.length)]; r = G.act(c, 'move', { x: t.x, y: t.y }); }
      else if (roll < 0.88) r = G.act(c, 'explore');
      else r = G.act(c, 'rest');
    } else if (sc === 'encounter') {
      const hpPct = c.hp / G.hpMax(c);
      const med = c.bag.find(i => G.ITEMS[i.id].type === 'med' && G.ITEMS[i.id].hp > 0);
      if (hpPct < 0.5 && med) r = G.act(c, 'encounter', { choice: 'item', itemId: med.id });
      else if (Math.random() < 0.4) r = G.act(c, 'encounter', { choice: 'spare' });
      else r = G.act(c, 'encounter', { choice: 'fight' });
    } else if (sc === 'battle') {
      const hpPct = c.hp / G.hpMax(c);
      const med = c.bag.find(i => G.ITEMS[i.id].type === 'med' && G.ITEMS[i.id].hp > 0);
      if (hpPct < 0.4 && med) r = G.act(c, 'battle', { choice: 'item', itemId: med.id });
      else if (hpPct < 0.35) r = G.act(c, 'battle', { choice: 'flee' });
      else r = G.act(c, 'battle', { choice: 'attack' });
    } else if (sc === 'loot' || sc === 'box') {
      r = G.act(c, sc, { all: true });
      // 背包满了拿不动，玩家会点关闭；模拟里也要关，否则死循环卡在这一幕
      if (r && r.ok === false) r = G.act(c, 'close');
    } else if (sc === 'hostage') {
      r = G.act(c, 'hostage', { choice: 'ask' });
    } else if (sc === 'hostage_result') {
      r = G.act(c, 'hostage_done');
    } else if (sc === 'sevenwa') {
      r = G.act(c, 'sevenwa', { choice: 'talk' });
    } else if (sc === 'liuying') {
      const p = c.pending;
      if (p && p.stage === 'pill') r = G.act(c, 'liuying', { choice: 'red' });
      else if (p && p.stage === 'quiz') r = G.act(c, 'liuying', { answer: 0 });
      else r = G.act(c, 'liuying', {});
    } else break;
    if (r && r.ok === false) { console.log('    行动失败:', r.msg); }
  }
  totalTurn += c.turn;
  totalKills += c.kills;
  turnList.push(c.turn);
  if (c.scene !== 'dead') survived++;
}
turnList.sort((a, b) => a - b);
// 大逃杀里「活到最后」不是常态，衡量的是「能不能撑住一阵」，不是「能不能不死」。
// 旧断言用「没死」计数，结果模拟卡在某个场景不推进也被算成存活（虚报 16/20），别再用它。
const longRuns = turnList.filter(t => t >= 15).length;
console.log(`  活到 4000 步 ${survived}/20 局`);
console.log(`  撑过 15 回合 ${longRuns}/20 局`);
console.log(`  平均回合 ${(totalTurn / 20).toFixed(1)}，中位数 ${turnList[10]}，最长 ${turnList[19]}`);
console.log(`  平均击杀 ${(totalKills / 20).toFixed(1)}`);
ok(longRuns >= 8, `至少 8 局撑过 15 回合（实际 ${longRuns}）`);
ok(turnList[10] >= 10, `中位数回合 ≥ 10（实际 ${turnList[10]}）`);

console.log('\n=== 属性上限规则 ===');
const t2 = G.createChar('上限测试');
['sta', 'str', 'cha', 'int', 'luk'].forEach(k => { t2.attrs[k] = 50; });
t2.attrs.sta = 100;
const g1 = G.act; // noop
const gain = require('./game');
// 直接构造：通过 use 永久药剂验证
t2.bag.push({ id: 'vit_str', n: 3 });
const before = t2.attrs.str;
G.act(t2, 'use', { itemId: 'vit_str' });
ok(t2.attrs.str === before, `体力已满 100 时，力量药剂无法提升武力（${before} → ${t2.attrs.str}）`);

const t3 = G.createChar('智力满值测试');
t3.attrs.int = 100;
t3.bag = [{ id: 'm_cloth', n: 5 }, { id: 'm_alcohol', n: 3 }];
let allOk = true;
for (let i = 0; i < 5; i++) {
  t3.bag = [{ id: 'm_cloth', n: 5 }, { id: 'm_alcohol', n: 3 }];
  const r = G.act(t3, 'craft', { recipeId: 'r01' });
  if (r.msg.includes('失败')) allOk = false;
}
ok(allOk, '智力 100 时合成必定成功');

console.log('\n=== 背包容量 ===');
const t4 = G.createChar('背包测试');
t4.equip.bag = { id: 'b05' };
ok(G.slots(t4) === 132, `战术背囊 +100 → 132 格（实际 ${G.slots(t4)}）`);

console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
process.exit(fail === 0 ? 0 : 1);
