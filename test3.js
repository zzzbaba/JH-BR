// 状态系统 / 七娃 / 刘颖 测试
const W = require('./world');
W.load();
const G = require('./game');
const { STATUS } = require('./data/status');
const { SEVEN_WA, LIUYING } = require('./data/special');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

console.log('\n=== 状态道具 ===');
{
  const c = G.createChar('状态');
  c.equip.body = { id: 'a09' };   // 防弹衣 防御 24
  c.attrs.str = 40;
  const baseDef = G.snapshot(c).def;

  // 喝醉
  G.giveItem(c, 'med16', 1);
  G.act(c, 'use', { itemId: 'med16' });
  let st = G.snapshot(c);
  ok(st.char.status.id === 'drunk', `使用二锅头 → ${st.char.status.name}`);
  ok(st.def > baseDef, `醉酒防御提升（${baseDef} → ${st.def}）`);
  ok(st.char.status.leftMs > 0 && st.char.status.leftMs <= 5 * 60 * 1000, '状态时长 5 分钟以内');

  // 醒酒
  G.giveItem(c, 'med21', 1);
  G.act(c, 'use', { itemId: 'med21' });
  ok(G.snapshot(c).char.status.id === 'normal', '醒酒汤解除醉酒');

  // 清醒
  G.giveItem(c, 'med17', 1);
  G.act(c, 'use', { itemId: 'med17' });
  st = G.snapshot(c);
  ok(st.char.status.id === 'clear', `黑咖啡 → ${st.char.status.name}`);
  ok(st.def > baseDef, `清醒防御提升（${baseDef} → ${st.def}）`);

  // 中毒
  G.giveItem(c, 'med18', 1);
  G.act(c, 'use', { itemId: 'med18' });
  ok(G.snapshot(c).char.status.id === 'poisoned', '毒蘑菇 → 中毒');

  const hp0 = c.hp, ep0 = c.ep;
  c.scene = 'map'; c.pending = null;
  const nb = require('./data/map').neighbors(require('./data/map').BY_ID[c.pos].x, require('./data/map').BY_ID[c.pos].y)[0];
  G.act(c, 'move', { x: nb.x, y: nb.y });
  const hp1 = c.hp, ep1 = c.ep;
  ok(hp1 < hp0, `中毒移动掉血（${Math.round(hp0)} → ${Math.round(hp1)}）`);
  ok(ep1 < ep0, `中毒移动掉精力（${Math.round(ep0)} → ${Math.round(ep1)}）`);

  // 解毒
  G.giveItem(c, 'med20', 1);
  c.scene = 'map'; c.pending = null;
  G.act(c, 'use', { itemId: 'med20' });
  ok(G.snapshot(c).char.status.id === 'normal', '解毒剂解除中毒');

  // 液氮罐已经改成「对敌道具」：不再给玩家上 frozen，而是冻住敌人
  // 这里验证它不能再被当成自己的药吃
  G.giveItem(c, 'med19', 1);
  c.scene = 'map'; c.pending = null;
  const selfUse = G.act(c, 'use', { itemId: 'med19' });
  ok(selfUse.ok === false, '液氮罐不能再对自己用：' + selfUse.msg);
  ok(G.snapshot(c).char.status.id === 'normal', '自己没被冻住');

  // 对敌使用：进战斗，冻住对方 2 回合
  const e19 = { id: 'e04', name: '野狗群', tier: 1, kind: 'animal', hp: 30, maxHp: 30, atk: 8, def: 0, dodge: 0, flee: 60, desc: '', w: 1 };
  c.scene = 'battle';
  c.pending = {
    enemy: { ...e19 }, round: 1, log: [], noise: 0, wave: 1, firstStrike: false,
    stun: 0, enemyStun: 0, foe: null, smoke: 0, guaranteed: false, hostage: null, npc: null, boss: false, pvp: null,
  };
  const useOnFoe = G.act(c, 'battle', { choice: 'item', itemId: 'med19', n: 1 });
  ok(useOnFoe.ok, '战斗中能对敌人用液氮罐');
  ok(c.pending.foe && c.pending.foe.freeze > 0, `敌人被冻住 ${c.pending.foe && c.pending.foe.freeze} 回合`);
  const hpBeforeFreeze = c.hp;
  G.act(c, 'battle', { choice: 'defend' });
  ok(c.hp === hpBeforeFreeze, '冻结期间敌人打不出伤害');

  // 万能解药
  G.giveItem(c, 'med22', 1);
  c.scene = 'map'; c.pending = null;
  c.status = { type: 'poisoned', until: Date.now() + 60000 };
  G.act(c, 'use', { itemId: 'med22' });
  const st3 = G.snapshot(c);
  ok(st3.char.status.id === 'normal', '万能解药清除所有状态');
  ok(st3.char.frozenLeftMs === 0, '冻结也一并解除');
}

console.log('\n=== 状态过期 ===');
{
  const c = G.createChar('过期');
  G.setStatus ? null : null;
  G.giveItem(c, 'med16', 1);
  G.act(c, 'use', { itemId: 'med16' });
  ok(G.snapshot(c).char.status.id === 'drunk', '先进入醉酒');
  c.status.until = Date.now() - 1000;   // 手动过期
  ok(G.snapshot(c).char.status.id === 'normal', '过期后自动回到正常');
}

console.log('\n=== 七娃 ===');
{
  let home = 0;
  for (let i = 0; i < 200; i++) {
    const c = G.createChar('找娃' + i);
    c.scene = 'sevenwa';
    c.pending = { zoneName: '十号地' };
    G.act(c, 'sevenwa', { choice: 'talk' });
    if (c.flags.sevenWaHome) home++;
  }
  const pct = Math.round(home / 200 * 100);
  console.log(`  200 次尝试，带走 ${home} 次（${pct}%）`);
  ok(pct >= 12 && pct <= 28, `成功率接近 20%（实际 ${pct}%）`);

  const c2 = G.createChar('带走');
  c2.scene = 'sevenwa';
  c2.pending = { zoneName: '十号地' };
  c2.career.sevenWa = 9;
  // 强制成功
  const orig = Math.random;
  Math.random = () => 0.01;
  G.act(c2, 'sevenwa', { choice: 'talk' });
  Math.random = orig;
  ok(c2.flags.sevenWaHome === true, '成功后标记 sevenWaHome');
  ok(c2.career.sevenWa === 10, `累计次数 ${c2.career.sevenWa}`);
  ok(c2.scene === 'sevenwin', '进入胜利场景');
  ok(!!c2.achievements.good_dad, '第 10 次解锁「好爸爸」');
}

console.log('\n=== 刘颖 ===');
{
  const c = G.createChar('吃药');
  c.scene = 'liuying';
  c.pending = { stage: 'pill', color: null, question: { q: '一加一', opts: ['1', '2', '3'], correct: 1 }, correct: false, zoneName: '十号地' };

  G.act(c, 'liuying', { choice: 'red' });
  ok(c.pending.stage === 'quiz', '选红药丸后进入答题');

  G.act(c, 'liuying', { answer: 1 });   // 答对
  ok(c.pending.stage === 'result', '答题后进入结果');
  ok(c.pending.correct === true, '判定为答对');
  ok(c.pending.effects.length >= 1 && c.pending.effects.length <= 3, `影响 ${c.pending.effects.length} 个属性（1-3）`);
  const keys = c.pending.effects.map(e => e.k);
  ok(keys.every(k => ['sta', 'str', 'cha'].includes(k)), '红药丸只影响体魄类属性：' + keys.join(','));
  ok(c.pending.until > Date.now() + 9 * 60 * 1000, '药效约 10 分钟');
  ok(c.flags.liuyingUntil > 0, '记录冷却，期间不会再遇到');

  const snap = G.snapshot(c);
  ok(Object.keys(snap.char.tempBuffs).length > 0, '临时属性已写入快照');

  // 蓝药丸
  const c2 = G.createChar('吃药2');
  c2.scene = 'liuying';
  c2.pending = { stage: 'pill', color: null, question: { q: 'x', opts: ['a', 'b', 'c'], correct: 0 }, correct: false, zoneName: '十号地' };
  G.act(c2, 'liuying', { choice: 'blue' });
  G.act(c2, 'liuying', { answer: 2 });  // 答错
  ok(c2.pending.correct === false, '判定为答错');
  const keys2 = c2.pending.effects.map(e => e.k);
  ok(keys2.every(k => ['cha', 'int', 'luk'].includes(k)), '蓝药丸只影响心智类属性：' + keys2.join(','));

  // 概率验证
  let negRight = 0, negWrong = 0;
  for (let i = 0; i < 300; i++) {
    const t1 = G.createChar('r');
    t1.scene = 'liuying';
    t1.pending = { stage: 'quiz', color: 'red', question: { q: 'x', opts: ['a', 'b', 'c'], correct: 0 }, correct: false, zoneName: 'z' };
    G.act(t1, 'liuying', { answer: 0 });
    if (t1.pending.negative) negRight++;

    const t2 = G.createChar('w');
    t2.scene = 'liuying';
    t2.pending = { stage: 'quiz', color: 'red', question: { q: 'x', opts: ['a', 'b', 'c'], correct: 0 }, correct: false, zoneName: 'z' };
    G.act(t2, 'liuying', { answer: 2 });
    if (t2.pending.negative) negWrong++;
  }
  console.log(`  答对 300 次：负向 ${negRight}（${Math.round(negRight / 3)}%）`);
  console.log(`  答错 300 次：负向 ${negWrong}（${Math.round(negWrong / 3)}%）`);
  ok(negRight / 300 < 0.45, '答对时负向概率明显更低');
  ok(negWrong / 300 > 0.65, '答错时负向概率明显更高');
}

console.log('\n=== 掉落表引用 ===');
{
  const ITEMD = require('./data/items');
  const { LOOT_TABLE } = require('./data/enemies');
  const SHOP = require('./data/shop');
  let bad = [];
  for (const t in LOOT_TABLE) LOOT_TABLE[t].forEach(x => { if (!ITEMD.ITEMS[x[0]]) bad.push(t + ':' + x[0]); });
  SHOP.GOODS.forEach(g => { if (!ITEMD.ITEMS[g[0]]) bad.push('shop:' + g[0]); });
  ok(bad.length === 0, `掉落/商店引用有效${bad.length ? ' —— ' + bad.join(',') : ''}`);
  ok(!!ITEMD.ITEMS.med22, '状态类道具已加入物品表');
}

console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
process.exit(fail ? 1 : 0);
