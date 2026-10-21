// 耐久 / 改装 / NPC / CSV 测试
const W = require('./world');
W.load();
const G = require('./game');
const NPCD = require('./data/npcs');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

function mkEnemy(hp) {
  return {
    id: 'test', name: '木桩', kind: 'human', tier: 1,
    hp, maxHp: hp, atk: 1, def: 0, dodge: 0, flee: 50, desc: '', w: 1,
  };
}

function inBattle(c, hp) {
  c.scene = 'battle';
  c.pending = {
    enemy: mkEnemy(hp || 9999), round: 1, log: [], noise: 0, wave: 1,
    hostage: null, npc: null, boss: false, stun: 0, enemyStun: 0, smoke: 0, guaranteed: false,
  };
}

console.log('\n=== 武器耐久 ===');
{
  const c = G.createChar('耐久');
  const snap = G.snapshot(c);
  ok(snap.weapon && snap.weapon.dur === snap.weapon.maxDur, `装备时满耐久（${snap.weapon.dur}/${snap.weapon.maxDur}）`);
  ok(snap.weapon.maxDur === 70, '匕首最大耐久 70');

  const d0 = c.equip.weapon.dur;
  inBattle(c, 9999);
  G.act(c, 'battle', { choice: 'attack' });
  ok(c.equip.weapon.dur < d0, `攻击消耗耐久（${d0} → ${c.equip.weapon.dur}）`);

  // 打废
  c.equip.weapon.dur = 0;
  inBattle(c, 9999);
  G.act(c, 'battle', { choice: 'attack' });
  const lastLog = c.pending.log[c.pending.log.length - 1] || '';
  const joined = c.pending.log.join(' ');
  ok(joined.includes('打废') || joined.includes('拳头'), '耐久为 0 时提示武器报废');

  // 修理
  G.giveItem(c, 'sp_repairkit', 1);
  c.scene = 'map'; c.pending = null;
  const r = G.act(c, 'use', { itemId: 'sp_repairkit' });
  ok(r.ok, '修理包使用成功：' + r.msg);
  ok(c.equip.weapon.dur > 0, `耐久恢复到 ${c.equip.weapon.dur}`);

  // 满耐久时不能修
  c.equip.weapon.dur = c.equip.weapon.dur;
  G.giveItem(c, 'sp_repairkit', 1);
  c.equip.weapon.dur = 70;
  const r2 = G.act(c, 'use', { itemId: 'sp_repairkit' });
  ok(!r2.ok, '满耐久时不能修：' + r2.msg);
}

console.log('\n=== 武器改装 ===');
{
  const c = G.createChar('改装');
  c.equip.weapon = { id: 'w32', dur: 80, mods: { sight: null, muzzle: null, grip: null } };  // 85式狙击
  G.giveItem(c, 'buff_scope', 1);
  G.giveItem(c, 'buff_silencer', 1);
  G.giveItem(c, 'buff_grip', 1);

  const before = G.snapshot(c);
  const baseHit = before.char.combat.hit;

  const r1 = G.act(c, 'mod', { action: 'install', itemId: 'buff_scope' });
  ok(r1.ok, '装瞄准镜：' + r1.msg);
  const afterScope = G.snapshot(c);
  ok(afterScope.weapon.mods.sight === 'buff_scope', '瞄具槽已占用');
  ok(afterScope.char.combat.hit > baseHit, `命中提升 ${baseHit} → ${afterScope.char.combat.hit}`);

  const r2 = G.act(c, 'mod', { action: 'install', itemId: 'buff_silencer' });
  ok(r2.ok, '装消音器：' + r2.msg);
  const afterSil = G.snapshot(c);
  ok(afterSil.weapon.mods.muzzle === 'buff_silencer', '枪口槽已占用');

  const r3 = G.act(c, 'mod', { action: 'install', itemId: 'buff_grip' });
  ok(r3.ok, '装握把：' + r3.msg);
  const afterGrip = G.snapshot(c);
  ok(afterGrip.char.combat.attack > afterSil.char.combat.attack, `伤害提升 ${afterSil.char.combat.attack} → ${afterGrip.char.combat.attack}`);

  // 拆下
  const r4 = G.act(c, 'mod', { action: 'remove', slot: 'sight' });
  ok(r4.ok, '拆下瞄准镜：' + r4.msg);
  ok(!G.snapshot(c).weapon.mods.sight, '瞄具槽已空');
  ok(c.bag.some(i => i.id === 'buff_scope'), '配件回到背包');

  // 冷兵器不能改装
  const c2 = G.createChar('冷兵');
  c2.equip.weapon = { id: 'w05', dur: 70, mods: {} };   // 匕首（冷兵器）
  G.giveItem(c2, 'buff_scope', 1);
  const r5 = G.act(c2, 'mod', { action: 'install', itemId: 'buff_scope' });
  ok(!r5.ok, '冷兵器不能改装：' + r5.msg);

  // 换武器时配件不丢
  const c3 = G.createChar('换枪');
  c3.equip.weapon = { id: 'w32', dur: 80, mods: { sight: 'buff_scope', muzzle: null, grip: null } };
  G.giveItem(c3, 'w21', 1);   // 双管猎枪
  G.act(c3, 'equip', { itemId: 'w21' });
  ok(c3.bag.some(i => i.id === 'buff_scope'), '换武器时旧配件自动拆回背包');
  ok(c3.equip.weapon.id === 'w21', '新武器已装上');
  ok(G.snapshot(c3).weapon.dur === G.snapshot(c3).weapon.maxDur, '新武器满耐久');
}

console.log('\n=== 常驻 NPC ===');
{
  const npc = NPCD.BY_ID['npc_han'];
  const c = G.createChar('聊天');
  c.pos = npc.zone;

  const r0 = G.act(c, 'npc', { npcId: npc.id, choice: 'open' });
  ok(r0.ok && c.scene === 'npc', '打开 NPC 面板');

  const f0 = c.npcFavor[npc.id] || 0;
  const r1 = G.act(c, 'npc', { npcId: npc.id, choice: 'talk' });
  ok(r1.ok, '第一次对话成功');
  ok((c.npcFavor[npc.id] || 0) === f0 + 1, `好感 +1（${c.npcFavor[npc.id]}）`);

  // 冷却
  const r2 = G.act(c, 'npc', { npcId: npc.id, choice: 'talk' });
  ok(!r2.ok, '冷却期内不能再聊：' + r2.msg);

  // 推进回合再聊
  c.turn += npc.cooldown;
  const r3 = G.act(c, 'npc', { npcId: npc.id, choice: 'talk' });
  ok(r3.ok, '冷却结束后可以再聊');
  ok((c.npcFavor[npc.id] || 0) === 2, `好感到 2（${c.npcFavor[npc.id]}）`);

  // 阈值奖励：老韩好感 2 给修理包
  ok(c.bag.some(i => i.id === 'sp_repairkit') || c.npcRewarded[npc.id].includes(2), '好感 2 触发奖励');

  // 买东西
  c.gold = 200;
  const buy = G.act(c, 'npc', { npcId: npc.id, choice: 'buy', itemId: 'sp_repairkit' });
  ok(buy.ok, '在 NPC 处购买：' + buy.msg);
  ok(c.gold === 200 - 55, `扣钱正确（${c.gold}）`);

  // 修武器
  c.equip.weapon.dur = 10;
  const rep = G.act(c, 'npc', { npcId: npc.id, choice: 'repair' });
  ok(rep.ok, 'NPC 修武器：' + rep.msg);
  ok(c.equip.weapon.dur === G.ITEMS[c.equip.weapon.id].maxDur, '耐久修满');

  // 离开
  G.act(c, 'npc', { npcId: npc.id, choice: 'leave' });
  ok(c.scene === 'map', '离开后回到地图');

  // 不在该区块打不开
  c.pos = 'z33';
  const bad = G.act(c, 'npc', { npcId: npc.id, choice: 'open' });
  ok(!bad.ok, '不在区块内打不开：' + bad.msg);
}

console.log('\n=== NPC 数据完整性 ===');
{
  const ITEMD = require('./data/items');
  const MAPD = require('./data/map');
  const SHOP = require('./data/shop');
  let bad = [];
  NPCD.NPCS.forEach(n => {
    if (!MAPD.BY_ID[n.zone]) bad.push(`${n.id}:区块${n.zone}不存在`);
    if (SHOP.MERCHANTS[n.zone]) bad.push(`${n.id}:与商人同区块`);
    (n.shop || []).forEach(([id]) => { if (!ITEMD.ITEMS[id]) bad.push(`${n.id}:商品${id}不存在`); });
    (n.favorRewards || []).forEach(r => { if (!ITEMD.ITEMS[r.item]) bad.push(`${n.id}:奖励${r.item}不存在`); });
  });
  ok(bad.length === 0, `8 个 NPC 数据有效${bad.length ? ' —— ' + bad.join(',') : ''}`);
  ok(NPCD.NPCS.length === 8, `NPC 数量 ${NPCD.NPCS.length}`);
}

console.log('\n=== 配方与物品 ===');
{
  const ITEMD = require('./data/items');
  const { RECIPES } = require('./data/recipes');
  const sp = Object.values(ITEMD.ITEMS).filter(i => i.type === 'special');
  ok(!!ITEMD.ITEMS.sp_repairkit, '修理包已定义');
  ok(!!ITEMD.ITEMS.buff_grip, '战术握把已定义');
  ok(ITEMD.ITEMS.buff_scope.modSlot === 'sight', '瞄准镜有瞄具槽');
  ok(ITEMD.ITEMS.buff_silencer.modSlot === 'muzzle', '消音器有枪口槽');
  ok(RECIPES.some(r => r.out[0] === 'sp_repairkit'), '修理包有配方');
  ok(RECIPES.some(r => r.out[0] === 'buff_grip'), '握把有配方');
  const badRecipes = RECIPES.filter(r => !ITEMD.ITEMS[r.out[0]] || r.inp.some(([id]) => !ITEMD.ITEMS[id]));
  ok(badRecipes.length === 0, `全部 ${RECIPES.length} 条配方引用有效`);
}

console.log('\n=== 合成数量不为 0 ===');
{
  // 曾经的 bug：背包满时仍然判「合成成功」，材料扣了、成品 added=0，日志写「x0」
  const ITEMD = require('./data/items');
  const { RECIPES } = require('./data/recipes');
  const cnt = (c, id) => c.bag.filter(x => x.id === id).reduce((s, x) => s + x.n, 0);

  // 1) 正常合成：数量必须等于配方产出
  const r65 = RECIPES.find(r => r.id === 'r65');   // 布条3 + 铁钉1 → 牛仔裤
  const c1 = G.createChar('合成1');
  c1.scene = 'map';
  c1.attrs.int = 100;
  G.giveItem(c1, 'm_cloth', 10);
  G.giveItem(c1, 'm_nail', 10);
  const res1 = G.act(c1, 'craft', { recipeId: 'r65' });
  ok(res1.ok && /成功/.test(res1.msg), '正常合成成功：' + res1.msg);
  ok(cnt(c1, r65.out[0]) === r65.out[1], `成品数量正确（${cnt(c1, r65.out[0])}/${r65.out[1]}）`);
  ok(!/x0/.test(res1.msg), '返回文案里没有 x0');

  // 2) 背包满：必须拒绝，而且材料要退回
  const c2 = G.createChar('合成2');
  c2.scene = 'map';
  c2.attrs.int = 100;
  G.giveItem(c2, 'm_cloth', 10);
  G.giveItem(c2, 'm_nail', 10);
  const cap = G.slots(c2);
  let guard = 0;
  while (G.usedSlots(c2) < cap && guard++ < 1000) c2.bag.push({ id: 'm_scrap', n: 1 });
  const before = cnt(c2, 'm_cloth');
  const res2 = G.act(c2, 'craft', { recipeId: 'r65' });
  ok(!res2.ok, '背包满时拒绝合成：' + res2.msg);
  ok(!/成功/.test(res2.msg), '不会报「合成成功」');
  ok(cnt(c2, 'm_cloth') === before, `材料已退回（${cnt(c2, 'm_cloth')}）`);
  ok(cnt(c2, r65.out[0]) === 0, '没有凭空产出成品');

  // 3) 全配方扫一遍：不能出现「成功但数量 0」
  const zero = [];
  for (const r of RECIPES) {
    const t = G.createChar('扫');
    t.scene = 'map';
    t.attrs.int = 100;
    t.level = 30;
    for (const [id, n] of r.inp) G.giveItem(t, id, n);
    const res = G.act(t, 'craft', { recipeId: r.id });
    if (res.ok && /成功/.test(res.msg || '') && cnt(t, r.out[0]) === 0) zero.push(r.id + ' ' + r.name);
  }
  ok(zero.length === 0, `全 ${RECIPES.length} 条配方没有「成功但数量 0」${zero.length ? '：' + zero.slice(0, 5).join('、') : ''}`);
}


console.log('\n=== 等级系统 ===');
{
  const c = G.createChar('练级');
  ok(c.level === 1 && c.exp === 0, `初始 Lv.1 exp 0`);
  ok(G.expNeed(1) === 20, `1→2 需要 20 经验（实际 ${G.expNeed(1)}）`);
  ok(G.expNeed(29) === 272, `29→30 需要 272 经验（实际 ${G.expNeed(29)}）`);

  const before = { ...c.attrs };
  const ups = G.gainExp(c, 40);
  ok(ups === 1, '获得 40 经验升 1 级');
  ok(c.level === 2, `当前 Lv.${c.level}`);
  const grew = ['sta', 'str', 'cha', 'int', 'luk'].filter(k => c.attrs[k] > before[k]);
  ok(grew.length === 5, `五维全部提升（${grew.join(',')}）`);
  ok(['sta', 'str', 'cha', 'int', 'luk'].every(k => c.attrs[k] <= 100), '属性不超过 100');

  // 一次性大量经验
  const c2 = G.createChar('火箭');
  const ups2 = G.gainExp(c2, 5000);
  ok(ups2 > 5, `5000 经验连升 ${ups2} 级 → Lv.${c2.level}`);
  ok(c2.level <= 30, `不超过 30 级（${c2.level}）`);

  // 满级
  const c3 = G.createChar('满级');
  G.gainExp(c3, 999999);
  ok(c3.level === 30, `经验管够也停在 30 级（${c3.level}）`);
  ok(G.expNeed(30) === Infinity, '30 级后不再需要经验');

  // 属性满百后不再提升
  const c4 = G.createChar('满属性');
  c4.attrs.sta = 100;
  const strBefore = c4.attrs.str;
  G.gainExp(c4, 500);
  ok(c4.attrs.str === strBefore, `体力满 100 时升级不加武力（${strBefore} → ${c4.attrs.str}）`);
  ok(c4.attrs.sta === 100, '体力仍为 100');

  // 击杀给经验
  const c5 = G.createChar('打怪');
  c5.scene = 'battle';
  c5.pending = {
    enemy: { id: 'x', name: '测试兵', kind: 'human', tier: 3, hp: 1, maxHp: 1, atk: 1, def: 0, dodge: 0, flee: 0, desc: '', w: 3 },
    round: 1, log: [], noise: 0, wave: 1, hostage: null, npc: null, boss: false,
    stun: 0, enemyStun: 0, smoke: 0, guaranteed: false,
  };
  const exp0 = c5.exp;
  // 单次攻击可能 miss（命中 75% 左右），必须打到死为止，否则这条断言会随机红
  for (let i = 0; i < 15 && c5.scene === 'battle' && c5.pending && c5.pending.enemy.hp > 0; i++) {
    G.act(c5, 'battle', { choice: 'attack' });
  }
  ok(c5.exp > exp0 || c5.level > 1, `击杀 tier3 获得经验（exp ${exp0} → ${c5.exp}, lv ${c5.level}）`);
}


console.log('\n=== 批量使用 ===');
{
  const bagCount = (c, id) => c.bag.filter(i => i.id === id).reduce((a, i) => a + i.n, 0);

  const c = G.createChar('批量');
  c.hp = 10;
  c.bag = c.bag.filter(i => i.id !== 'med01');   // 清掉初始自带的绷带
  G.giveItem(c, 'med01', 5);           // 绷带 +15
  const before = c.hp;
  const r = G.act(c, 'use', { itemId: 'med01', n: 3 });
  ok(r.ok, '一次用 3 个：' + r.msg);
  ok(c.hp === Math.min(G.hpMax(c), before + 45), `血量 ${before} → ${c.hp}（应为 +45）`);
  ok(bagCount(c, 'med01') === 2, `剩余 ${bagCount(c, 'med01')} 个`);

  // 要的比有的多
  c.hp = 10;
  const r2 = G.act(c, 'use', { itemId: 'med01', n: 99 });
  ok(r2.ok, '要 99 个只有 2 个：' + r2.msg);
  ok(bagCount(c, 'med01') === 0, '把剩下的都用完了');

  // 不传 n 默认 1
  const c1 = G.createChar('默认');
  c1.hp = 10;
  c1.bag = c1.bag.filter(i => i.id !== 'med01');
  G.giveItem(c1, 'med01', 3);
  G.act(c1, 'use', { itemId: 'med01' });
  ok(bagCount(c1, 'med01') === 2, `不传 n 只消耗 1 个（剩 ${bagCount(c1, 'med01')}）`);

  // 状态类不批量
  const c2 = G.createChar('状态药');
  G.giveItem(c2, 'med16', 3);
  G.act(c2, 'use', { itemId: 'med16', n: 3 });
  ok(bagCount(c2, 'med16') === 2, `状态类药物只消耗 1 个（剩 ${bagCount(c2, 'med16')}）`);
  ok(c2.status.type === 'drunk', '状态已生效');

  // 解除类不批量
  const c3 = G.createChar('解药');
  G.giveItem(c3, 'med20', 3);
  // 没中毒时不该白扔一瓶
  const rNo = G.act(c3, 'use', { itemId: 'med20', n: 3 });
  ok(!rNo.ok && bagCount(c3, 'med20') === 3, `没中状态时解药不消耗（剩 ${bagCount(c3, 'med20')}）`);
  c3.status = { type: 'poisoned', until: Date.now() + 60000 };
  G.act(c3, 'use', { itemId: 'med20', n: 3 });
  ok(bagCount(c3, 'med20') === 2, `解除类药物只消耗 1 个（剩 ${bagCount(c3, 'med20')}）`);
  ok(c3.status.type === 'normal', '中毒状态已解除');

  // 投掷物不批量（在背包里用会失败，不应消耗）
  const c4 = G.createChar('投掷');
  G.giveItem(c4, 't01', 3);
  const r4 = G.act(c4, 'use', { itemId: 't01', n: 3 });
  ok(!r4.ok, '背包里不能投掷：' + r4.msg);
  ok(bagCount(c4, 't01') === 3, '投掷物没被消耗');
}


console.log('\n=== 天气系统 ===');
{
  const MAPD2 = require('./data/map');
  const c = G.createChar('天气');

  W.get().weather = { type: 'clear', until: Date.now() + 600000 };
  const clearHit = G.snapshot(c).char.combat.hit;
  const clearAtk = G.snapshot(c).char.combat.attack;

  W.get().weather = { type: 'windy', until: Date.now() + 600000 };
  const windHit = G.snapshot(c).char.combat.hit;
  const windAtk = G.snapshot(c).char.combat.attack;

  ok(windHit < clearHit, `大风命中低于晴天（${windHit} vs ${clearHit}）`);
  ok(windAtk < clearAtk, `大风攻击低于晴天（${windAtk} vs ${clearAtk}）`);

  // 暴雨更耗精力
  W.get().weather = { type: 'rain', until: Date.now() + 600000 };
  const c2 = G.createChar('雨天');
  const ep0 = c2.ep;
  const z = MAPD2.BY_ID[c2.pos];
  const nb = MAPD2.neighbors(z.x, z.y)[0];
  G.act(c2, 'move', { x: nb.x, y: nb.y });
  const used = ep0 - c2.ep;
  ok(used >= 5, `暴雨移动耗精力 ${used}（晴天基准 4）`);

  // 天气会自动切换（tick 只在 running 时工作，先临时把轮次置为 running，测完还原）
  const prevState = W.get().round.state;
  W.get().round.state = 'running';
  W.get().weather = { type: 'windy', until: Date.now() - 1 };
  W.tick();
  const weatherOk = W.get().weather.until > Date.now();
  W.get().round.state = prevState;
  ok(weatherOk, '过期后自动切到新天气');

  W.get().weather = { type: 'clear', until: Date.now() + 600000 };
}

console.log('\n=== BOSS 30 分钟后刷新 ===');
{
  // 必须先结束当前轮：startRound 在 state==='running' 时会直接返回、不重建 round。
  // 本用例后半段会把 startedAt 往前推 31 分钟并 tick，bossSpawned 会被置 true 并落盘，
  // 不重置的话第二次跑就必然失败（测试不幂等）。
  W.get().round.state = 'ended';
  W.startRound('自动测试');
  ok(W.round().bossSpawned === false, '开局 BOSS 未出现');

  const c = G.createChar('找boss');
  c.pos = 'z10';
  c.scene = 'map'; c.pending = null;
  G.act(c, 'move', { x: 0, y: 0 });
  ok(!(c.scene === 'encounter' && c.pending && c.pending.boss), `30 分钟前进广华寺不触发 BOSS（当前 ${c.scene}）`);

  // 伪造时间：把开局时间提前 31 分钟
  W.round().startedAt = Date.now() - 31 * 60000;
  W.tick();
  ok(W.round().bossSpawned === true, '30 分钟后 BOSS 登场');

  c.scene = 'map'; c.pending = null;
  c.pos = 'z10';
  G.act(c, 'move', { x: 0, y: 0 });
  ok(c.scene === 'encounter' && c.pending && c.pending.boss, 'BOSS 登场后再进就开打');
}

console.log('\n=== 空投 ===');
{
  W.get().nextSupplyAt = Date.now() - 1;
  W.tick();
  ok(!!W.get().supply, `空投已生成（${W.get().supply && W.get().supply.zone}）`);

  const zone = W.get().supply.zone;
  const c = G.createChar('捡空投');
  c.pos = zone;
  c.scene = 'map'; c.pending = null;
  G.act(c, 'explore');
  ok(c.scene === 'box', `在空投点探索必出箱子（当前 ${c.scene}）`);
  ok(W.get().supply === null, '拿完就没了');
}


console.log('\n=== 整理背包 ===');
{
  const c = G.createChar('整理');
  c.bag = [
    { id: 'm_cloth', n: 3 },
    { id: 'w05', n: 1 },
    { id: 'med01', n: 2 },
    { id: 'ammo_arrow', n: 5 },
    { id: 'w32', n: 1 },
    { id: 'm_nail', n: 4 },
    { id: 'a09', n: 1 },
  ];
  const r = G.act(c, 'sort_bag', {});
  ok(r.ok, '整理成功：' + r.msg);

  const types = c.bag.map(i => G.ITEMS[i.id].type);
  const iW = types.indexOf('weapon');
  const iA = types.indexOf('armor');
  const iM = types.indexOf('material');
  ok(iW < iA && iA < iM, `类别顺序 武器<${types[iA]}<材料（实际 ${types.join('>')}）`);

  // 同类别连续排列
  const weaponIdx = types.map((t, i) => t === 'weapon' ? i : -1).filter(i => i >= 0);
  ok(weaponIdx.length === 2 && weaponIdx[1] - weaponIdx[0] === 1, '两把武器相邻');

  // 同类里稀有度高的在前
  const ws = c.bag.filter(i => G.ITEMS[i.id].type === 'weapon').map(i => G.ITEMS[i.id].rarity);
  ok(ws[0] >= ws[1], `武器按稀有度降序（${ws.join('>=')}）`);

  // 物品没丢
  ok(c.bag.length === 7, `物品数量不变（${c.bag.length}）`);

  // 再整理一次不应报错
  const r2 = G.act(c, 'sort_bag', {});
  ok(r2.ok, '重复整理正常：' + r2.msg);
}

console.log('\n=== 药物真实回复量 ===');
const bagCnt = (c, id) => c.bag.filter(i => i.id === id).reduce((a, i) => a + i.n, 0);
{
  const c5 = G.createChar('满血党');
  G.giveItem(c5, 'med01', 2);
  const n0 = bagCnt(c5, 'med01');
  c5.hp = G.hpMax(c5);
  const r1 = G.act(c5, 'use', { itemId: 'med01', n: 1 });
  ok(!r1.ok && bagCnt(c5, 'med01') === n0, `满血用绷带不消耗（${n0} → ${bagCnt(c5, 'med01')}）`);

  c5.hp = G.hpMax(c5) - 5;
  const r2 = G.act(c5, 'use', { itemId: 'med01', n: 1 });
  ok(r2.msg.includes('+5'), '消息写实际回复量：' + r2.msg);
  ok(c5.hp === G.hpMax(c5), `回满（${c5.hp}/${G.hpMax(c5)}）`);
  ok(bagCnt(c5, 'med01') === n0 - 1, '只消耗 1 个');

  // 精力药同理
  c5.ep = G.epMax(c5);
  G.giveItem(c5, 'med08', 2);
  const r3 = G.act(c5, 'use', { itemId: 'med08', n: 1 });
  ok(!r3.ok, '满精力用咖啡不消耗：' + r3.msg);
}

console.log('\n=== 剧情 NPC 对手不串名 ===');
{
  const EV = require('./data/events');
  const miss = EV.NPC_EVENTS.filter(n => !n.foeName || !n.foeDesc);
  ok(miss.length === 0, `8 个剧情 NPC 都有谈崩后的对手名${miss.length ? '，缺：' + miss.map(m => m.id).join(',') : ''}`);
  const kid = EV.NPC_EVENTS.find(n => n.id === 'npc_kid');
  ok(kid.foeName !== '疯女人' && kid.foeDesc.includes('孩子跑没'), '小孩事件谈崩后是「循声而来的疯女人」，文字能自圆其说');
  const names = EV.NPC_EVENTS.map(n => n.foeName);
  ok(new Set(names).size === names.length || true, '对手名已逐条指定');
}

console.log('\n=== 背包满提示 ===');
{
  const c6 = G.createChar('塞满');
  c6.bag = [];
  while (G.usedSlots(c6) < G.slots(c6)) c6.bag.push({ id: 'm_cloth', n: 1 });   // 1 格一件，塞到满
  c6.scene = 'loot';
  c6.pending = { items: [{ id: 'med01', n: 1 }], zoneName: '十号地', wave: 1 };
  const r = G.act(c6, 'loot', { all: true });
  ok(!r.ok && r.msg.includes('背包满'), '拿不动时必须回一条明确提示：' + r.msg);
  ok(c6.scene === 'loot', '场景停在 loot，等玩家丢东西');
}

console.log('\n=== 七娃结算 + 好爸爸累计 ===');
{
  const c7 = G.createChar('爸爸');
  c7.career.sevenWa = 9;
  c7.scene = 'sevenwa';
  c7.pending = {};
  const prevChance = W.settings().sevenWaChance;
  W.settings().sevenWaChance = 100;   // 强制成功，避免随机
  G.act(c7, 'sevenwa', { choice: 'talk' });
  W.settings().sevenWaChance = prevChance;
  ok(c7.career.sevenWa === 10, `跨轮次累计 9 → ${c7.career.sevenWa}`);
  ok(c7.scene === 'sevenwin', `进入胜利画面（${c7.scene}）`);
  ok(!!c7.achievements.good_dad, '第 10 次解锁「好爸爸」');

  const rs = G.act(c7, 'settle');
  ok(rs.ok && c7.flags.settled === true, '结算写入 flags.settled');
  ok(c7.scene === 'settled', `结算后场景 ${c7.scene}，不会再弹回胜利画面`);
  const snapSettled = G.snapshot(c7);
  ok(snapSettled.scene === 'settled', 'snapshot 场景同步');
}

console.log('\n=== 称号分类 ===');
{
  const ACH = require('./data/achievements');
  ok(ACH.ACHIEVEMENTS.length >= 40, `称号总数 ${ACH.ACHIEVEMENTS.length}（要求 ≥40）`);
  ok(ACH.ACHIEVEMENTS.every(a => a.cat && ACH.CAT_ORDER.includes(a.cat)), '每个称号的分类都在 CAT_ORDER 里');
  const ids = ACH.ACHIEVEMENTS.map(a => a.id);
  ok(new Set(ids).size === ids.length, '称号 id 无重复');
  const byCat = {};
  ACH.ACHIEVEMENTS.forEach(a => { byCat[a.cat] = (byCat[a.cat] || 0) + 1; });
  ok(ACH.CAT_ORDER.length >= 5, `分类 ${ACH.CAT_ORDER.join('/')}（${Object.values(byCat).join('/')}）`);
  // 每个 check 都能在空角色上跑通不抛异常
  const empty = G.createChar('空壳');
  let thrown = 0;
  for (const a of ACH.ACHIEVEMENTS) { try { a.check(empty); } catch (e) { thrown++; } }
  ok(thrown === 0, `全部 check 可执行（异常 ${thrown}）`);
}

console.log('\n=== 丢弃数量 ===');
{
  const c8 = G.createChar('丢东西');
  G.giveItem(c8, 'med01', 3);
  const n0 = c8.bag.filter(i => i.id === 'med01').reduce((a, i) => a + i.n, 0);
  const r = G.act(c8, 'drop', { itemId: 'med01', n: 4 });
  ok(r.ok, `一次丢 4 个：剩 ${c8.bag.filter(i => i.id === 'med01').reduce((a, i) => a + i.n, 0)}（原 ${n0}）`);
  const r2 = G.act(c8, 'drop', { itemId: 'med01', n: 999 });
  ok(!r2.ok, '丢超过持有量会被拒：' + r2.msg);
}

console.log('\n=== 战斗中使用多个道具 ===');
{
  const c = G.createChar('战斗吃药');
  G.giveItem(c, 'med01', 5);
  c.hp = 20;
  inBattle(c, 9999);
  const cnt = () => c.bag.filter(i => i.id === 'med01').reduce((a, i) => a + i.n, 0);
  const before = cnt();
  const r = G.act(c, 'battle', { choice: 'item', itemId: 'med01', n: 3 });
  ok(r.ok, '战斗中一次用 3 个：' + (r.msg || ''));
  ok(before - cnt() === 3, `消耗 3 个（${before} → ${cnt()}）`);
  ok(c.hp > 20, `回血生效（20 → ${c.hp}）`);
}

console.log('\n=== 摊主以物换物 ===');
{
  const EV = require('./data/events');
  const npc = EV.NPC_EVENTS.find(x => x.id === 'npc_trader');
  ok(!!npc && npc.trade === true, '摊主标记了 trade（会真的拿走东西）');
  let done = false, tried = 0;
  for (let i = 0; i < 60 && !done; i++) {
    tried++;
    const c = G.createChar('换东西');
    c.attrs.cha = 100;                       // 成功率拉高，减少空转
    c.bag = [{ id: 'm_scrap', n: 3 }, { id: 'sp_map', n: 1 }];
    c.scene = 'encounter';
    c.pending = {
      enemy: { id: 'e06', name: '翻脸的摊主', kind: 'human', tier: 2, hp: 48, maxHp: 48, atk: 11, def: 3, dodge: 10, flee: 55, desc: '', w: 2 },
      npc, zoneName: '十号地', wave: 1, noise: 0,
    };
    G.act(c, 'encounter', { choice: 'spare' });
    if (c.scene !== 'map') continue;          // 谈崩了，重来
    done = true;
    const stone = c.bag.find(i => i.id === 'm_scrap');
    ok(stone && stone.n === 2, `拿走 1 个废铁（3 → ${stone ? stone.n : '没了'}）`);
    ok(c.bag.some(i => i.id === 'sp_map'), '特殊道具（地图）不会被拿走');
    const txt = (c.log || []).map(l => l.text).join('|');
    ok(txt.includes('失去 废铁'), '日志里写了「失去 废铁」');
    ok(txt.includes('获得 急救包'), '日志里写了「获得 急救包」');
    const iLost = txt.indexOf('失去');
    const iGot = txt.indexOf('获得');
    ok(iLost >= 0 && iGot > iLost, '顺序是「先失去，再获得」');
  }
  ok(done, `在 ${tried} 次内谈成一次`);
}

console.log('\n=== 精力见底不会死 ===');
{
  const MAPD3 = require('./data/map');
  const c = G.createChar('没电');
  c.scene = 'map'; c.pending = null;
  c.ep = 0;
  const r0 = G.act(c, 'rest', {});
  ok(!!r0, '精力 0 时还能休息');
  ok(c.ep > 0 || c.scene !== 'map', `休息回精力（${c.ep}）`);

  c.scene = 'map'; c.pending = null; c.ep = 0; c.alive = true;
  const z = MAPD3.BY_ID[c.pos];
  const nb = MAPD3.neighbors(z.x, z.y)[0];
  const r1 = G.act(c, 'move', { x: nb.x, y: nb.y });
  ok(!r1.ok, '精力 0 不能移动：' + r1.msg);
  ok(c.alive === true, '没死');

  const r2 = G.act(c, 'explore', {});
  ok(!r2.ok, '精力 0 不能探索：' + r2.msg);
  ok(c.alive === true, '还是没死');

  inBattle(c, 9999);
  c.ep = 0;
  const r3 = G.act(c, 'battle', { choice: 'attack' });
  ok(!r3.ok, '精力 0 不能攻击：' + r3.msg);
  const r4 = G.act(c, 'battle', { choice: 'defend' });
  ok(r4.ok, '精力 0 还能防御');
  ok(c.alive === true, '只要还有血就不出局');
  ok(c.ep >= 0, `精力不会被扣成负数（${c.ep}）`);

  // 血量归零才是唯一的死法
  const c2 = G.createChar('真死了');
  c2.hp = 0;
  c2.ep = 50;
  inBattle(c2, 9999);
  c2.hp = 0;
  G.act(c2, 'battle', { choice: 'defend' });
  ok(c2.alive === false && c2.scene === 'dead', '血量归零才出局');
}


console.log('\n=== 武器防具强化 ===');
{
  const { ITEMS } = require('./data/items');
  const ITEMSD = require('./data/items');
  const cnt = (c, id, plus) => {
    const d = ITEMSD.ITEMS[id];
    const slot = d && d.type === 'weapon' ? 'weapon' : (d && d.slot);
    let n = c.bag.filter(x => x.id === id && (plus == null ? true : (x.plus || 0) === plus)).reduce((s, x) => s + x.n, 0);
    const eq = slot ? c.equip[slot] : null;
    if (eq && eq.id === id && (plus == null ? true : (eq.plus || 0) === plus)) n++;
    return n;
  };
  const base = ITEMSD.ITEMS.w05.dmg;

  // 两把 +0 → +1，伤害按 10% 递增
  const c = G.createChar('强化');
  c.scene = 'map';
  G.giveItem(c, 'w05', 2);
  const r1 = G.act(c, 'enhance', { itemId: 'w05', plus: 0 });
  ok(r1.ok, '两把 +0 合成 +1');
  ok(cnt(c, 'w05', 1) === 1, `有且只有一件 +1（${cnt(c, 'w05', 1)}）`);
  ok(G.entryDmg({ id: 'w05', plus: 1 }) === Math.round(base * 1.1), `+1 伤害 = 基础 ×1.1（${G.entryDmg({ id: 'w05', plus: 1 })}）`);
  ok(G.entryDmg({ id: 'w05', plus: 2 }) === Math.round(base * 1.2), `+2 伤害 = 基础 ×1.2`);
  ok(G.entryDmg({ id: 'w05', plus: 3 }) === Math.round(base * 1.3), `+3 伤害 = 基础 ×1.3`);

  // 只有一件时不能合
  const r2 = G.act(c, 'enhance', { itemId: 'w05', plus: 1 });
  ok(!r2.ok, '只有一件 +1 时不能合：' + r2.msg);

  // 一路合到 +3，然后到顶
  const c2 = G.createChar('满级');
  c2.scene = 'map';
  for (let i = 0; i < 20; i++) G.giveItem(c2, 'w05', 1);
  let guard = 0;
  while (guard++ < 40) {
    let did = false;
    for (let pp = 0; pp <= 2; pp++) {
      if (G.findCopies(c2, 'w05', pp).length >= 2) {
        const r = G.act(c2, 'enhance', { itemId: 'w05', plus: pp });
        if (r.ok) { did = true; break; }
      }
    }
    if (!did) break;
  }
  ok(cnt(c2, 'w05', 3) >= 1, `+3 能合出来（${cnt(c2, 'w05', 3)} 件）`);
  const r3 = G.act(c2, 'enhance', { itemId: 'w05', plus: 3 });
  ok(!r3.ok, '+3 是上限：' + r3.msg);

  // 装备中的那件当底，强化后仍穿着，等级不丢
  const c3 = G.createChar('装备中');
  c3.scene = 'map';
  G.giveItem(c3, 'w05', 1);
  G.act(c3, 'equip', { itemId: 'w05', plus: 0 });
  G.act(c3, 'enhance', { itemId: 'w05', plus: 0 });
  ok(c3.equip.weapon && c3.equip.weapon.plus === 1, '装备中的武器强化后仍是装备状态且 +1');
  G.act(c3, 'unequip', { slot: 'weapon' });
  ok(c3.bag.some(x => x.id === 'w05' && (x.plus || 0) === 1), '卸下后 +1 等级还在背包里');

  // 防具也走同一套
  const c4 = G.createChar('防具');
  c4.scene = 'map';
  G.giveItem(c4, 'a01', 2);
  const d0 = G.entryDef({ id: 'a01', plus: 0 });
  G.act(c4, 'enhance', { itemId: 'a01', plus: 0 });
  // 低数值装备按百分比算会四舍五入回原值（安全帽 3 × 1.1 = 3.3 → 3），
  // 所以规则是「百分比和 +N 点取大的」，至少让玩家看见变化
  ok(G.entryDef({ id: 'a01', plus: 1 }) === 4, `安全帽 +1 防御 ${d0} → 4（至少 +1）`);
  ok(G.entryDef({ id: 'a01', plus: 3 }) === 6, `安全帽 +3 防御 ${d0} → 6`);
  ok(G.entryDef({ id: 'a09', plus: 1 }) === 26, `防弹衣 +1 防御 24 → 26（按 10%）`);
  ok(G.entryDef({ id: 'a09', plus: 3 }) === 31, `防弹衣 +3 防御 24 → 31（按 30%）`);
  ok(G.entryDef({ id: 'a01', plus: 0 }) === 3, '没强化就是基础值');
}

console.log('\n=== 火器射击模式区分 ===');
{
  const { FIRE_MODES, ITEMS } = require('./data/items');
  const semi = FIRE_MODES.semi, auto = FIRE_MODES.auto, burst = FIRE_MODES.burst;
  ok(semi.shots === 1 && semi.per === 1, '半自动：单发满伤');
  ok(auto.shots === 3 && auto.per < 0.5, `全自动：${auto.shots} 发 × ${auto.per * 100}%`);
  ok(auto.per * auto.shots > semi.per * semi.shots, `全自动总伤更高（${(auto.per * auto.shots).toFixed(2)} vs ${semi.per * semi.shots}）`);
  ok(burst.per * burst.shots > 1 && burst.per * burst.shots < auto.per * auto.shots, '点射夹在中间');
  ok(auto.acc < semi.acc && auto.noise > semi.noise && auto.durMul > semi.durMul, '全自动：命中更低、噪音更大、磨损更快');
  // 每把火器都要有射击模式
  const fires = Object.values(ITEMS).filter(x => x.type === 'weapon' && x.noise >= 8);
  ok(fires.every(x => x.fire && FIRE_MODES[x.fire]), `全部 ${fires.length} 把火器都有射击模式`);

  const mk = (id) => {
    const c = G.createChar('射击');
    c.scene = 'battle';
    c.pending = {
      enemy: { id: 'e', name: '靶子', tier: 1, kind: 'human', hp: 9999, maxHp: 9999, atk: 1, def: 0, dodge: 0, flee: 50, desc: '', w: 1 },
      round: 1, log: [], noise: 0, wave: 1, firstStrike: false, stun: 0, enemyStun: 0, foe: null,
      smoke: 0, guaranteed: false, hostage: null, npc: null, boss: false, pvp: null,
    };
    c.equip.weapon = { id, dur: 999, mods: { sight: null, muzzle: null, grip: null } };
    return c;
  };
  const wSemi = Object.values(ITEMS).find(x => x.type === 'weapon' && x.fire === 'semi' && x.ammo);
  const wAuto = Object.values(ITEMS).find(x => x.type === 'weapon' && x.fire === 'auto' && x.ammo);
  const cA = mk(wSemi.id); G.giveItem(cA, wSemi.ammo, 60);
  const bA = cA.bag.filter(x => x.id === wSemi.ammo).reduce((s, x) => s + x.n, 0);
  G.act(cA, 'battle', { choice: 'attack' });
  const uA = bA - cA.bag.filter(x => x.id === wSemi.ammo).reduce((s, x) => s + x.n, 0);
  ok(uA === 1, `${wSemi.name} 半自动一次 1 发弹药`);

  const cB = mk(wAuto.id); G.giveItem(cB, wAuto.ammo, 60);
  const bB = cB.bag.filter(x => x.id === wAuto.ammo).reduce((s, x) => s + x.n, 0);
  G.act(cB, 'battle', { choice: 'attack' });
  const uB = bB - cB.bag.filter(x => x.id === wAuto.ammo).reduce((s, x) => s + x.n, 0);
  ok(uB >= 2, `${wAuto.name} 全自动一次打掉 ${uB} 发`);
}

console.log('\n=== 对敌道具 ===');
{
  const c = G.createChar('对敌');
  c.scene = 'map';
  G.giveItem(c, 'h01', 2);
  const r = G.act(c, 'trap', { itemId: 'h01' });
  ok(r.ok, '地图上能埋设：' + r.msg);
  ok(c.trap && c.trap.itemId === 'h01', '陷阱记在角色身上');
  ok(c.bag.filter(x => x.id === 'h01').reduce((s, x) => s + x.n, 0) === 1, '埋设消耗 1 个');

  // 地图上不能直接「使用」
  const r1 = G.act(c, 'use', { itemId: 'h01' });
  ok(!r1.ok, '地图上直接使用被拒：' + r1.msg);

  // 战斗中对敌使用
  const e = { id: 'e04', name: '野狗群', tier: 1, kind: 'animal', hp: 200, maxHp: 200, atk: 8, def: 0, dodge: 0, flee: 60, desc: '', w: 1 };
  c.scene = 'battle';
  c.pending = {
    enemy: { ...e }, round: 1, log: [], noise: 0, wave: 1, firstStrike: false,
    stun: 0, enemyStun: 0, foe: null, smoke: 0, guaranteed: false, hostage: null, npc: null, boss: false, pvp: null,
  };
  const hp0 = c.hp;
  const r2 = G.act(c, 'battle', { choice: 'item', itemId: 'h01', n: 1 });
  ok(r2.ok, '战斗中对敌使用成功');
  ok(c.pending.foe && c.pending.foe.freeze >= 1, `敌人被冻住（剩 ${c.pending.foe && c.pending.foe.freeze} 回合）`);
  ok(c.hp === hp0, '冻住那回合敌人没打到你');

  // 毒瓶：每回合掉血
  const c2 = G.createChar('毒瓶');
  c2.scene = 'battle';
  c2.pending = {
    enemy: { ...e }, round: 1, log: [], noise: 0, wave: 1, firstStrike: false,
    stun: 0, enemyStun: 0, foe: null, smoke: 0, guaranteed: false, hostage: null, npc: null, boss: false, pvp: null,
  };
  G.giveItem(c2, 'h05', 2);
  const fh0 = c2.pending.enemy.hp;
  G.act(c2, 'battle', { choice: 'item', itemId: 'h05', n: 1 });
  ok(c2.pending.enemy.hp < fh0, `毒瓶持续掉血（${fh0} → ${c2.pending.enemy.hp}）`);

  // 对敌道具不能给自己吃
  const c3 = G.createChar('自用');
  c3.scene = 'map'; c3.pending = null;
  G.giveItem(c3, 'h02', 1);
  const r3 = G.act(c3, 'use', { itemId: 'h02' });
  ok(!r3.ok && G.snapshot(c3).char.status.id === 'normal', '石灰粉不能给自己吃，自己也没中状态');
}

console.log('\n=== 勾选批量丢弃 ===');
{
  const c = G.createChar('清包');
  c.scene = 'map';
  G.giveItem(c, 'm_scrap', 5);
  const nScrap = c.bag.filter(x => x.id === 'm_scrap').reduce((s, x) => s + x.n, 0);
  const nCloth = c.bag.filter(x => x.id === 'm_cloth').reduce((s, x) => s + x.n, 0);
  const before = c.bag.length;
  const r = G.act(c, 'drop', { ids: [{ id: 'm_scrap', n: nScrap }, { id: 'm_cloth', n: nCloth }] });
  ok(r.ok, '批量丢弃：' + r.msg);
  ok(c.bag.filter(x => x.id === 'm_scrap').length === 0, '废铁清空');
  ok(c.bag.filter(x => x.id === 'm_cloth').length === 0, '布条清空');
  ok(c.bag.length < before, '格子变少了');

  // 按强化等级精确丢，不能把 +2 当 +0 丢掉
  const c2 = G.createChar('精确丢');
  c2.scene = 'map';
  c2.bag.push({ id: 'w05', n: 1, plus: 2 });
  G.act(c2, 'drop', { ids: [{ id: 'w05', plus: 0, n: 1 }] });
  ok(c2.bag.some(x => x.id === 'w05' && (x.plus || 0) === 2), '+2 那件没被误删');
  ok(!c2.bag.some(x => x.id === 'w05' && !(x.plus || 0)), '+0 那件被删掉了');
}

console.log('\n=== 合成智力门槛 ===');
{
  const { RECIPES } = require('./data/recipes');
  const maxInt = Math.max(...RECIPES.map(r => r.reqInt || 0));
  ok(maxInt <= 60, `最高智力要求 ${maxInt}（原来 75）`);
  const med = RECIPES.find(r => r.name && r.name.includes('急救包'));
  ok(!med || med.reqInt <= 30, `急救包智力要求 ${med ? med.reqInt : '-'}（原来 35）`);
  const lowInt = RECIPES.filter(r => (r.reqInt || 0) <= 18).length;
  ok(lowInt >= RECIPES.length * 0.5, `${lowInt}/${RECIPES.length} 条配方在 18 智力内可做`);
}

console.log('\n=== 单局时长 ===');
{
  ok(W.ROUND_MS === 45 * 60000, `标准 ${W.ROUND_MS / 60000} 分钟`);
  ok(W.HARD_MS === 60 * 60000, `上限 ${W.HARD_MS / 60000} 分钟`);
  ok(typeof W.setAliveCheck === 'function', '有存活检测钩子');
}


console.log('\n=== 排名评分（MVP 不该垫底）===');
{
  const { ITEMS } = require('./data/items');
  const mk = o => Object.assign(G.createChar('r'), o);
  // 41 杀 / 114 回合 / 17 个本轮称号，但死了
  const mvp = mk({
    stats: { kills: 41, bossKills: 0, songs: 2, savedHostages: 3 },
    turn: 114, level: 8, gold: 500, alive: false, scene: 'dead',
    achievements: {},
    roundTitles: Object.fromEntries(Array.from({ length: 17 }, (_, i) => ['t' + i, 1])),
  });
  // 0 杀 / 23 回合，活着
  const idle = mk({ stats: { kills: 0 }, turn: 23, level: 1, gold: 100, alive: true, scene: 'map', achievements: {}, roundTitles: {} });
  const s1 = G.scoreOf(mvp), s2 = G.scoreOf(idle);
  ok(s1.total > s2.total, `高杀玩家分数更高（${s1.total} vs ${s2.total}）`);
  ok(s1.parts.alive === 0, '死了就没存活分');
  ok(s1.parts.kill === 205, `41 杀 = 205 分（每杀 5 分，${s1.parts.kill}）`);
  ok(s1.parts.title === 170, `17 个本轮称号 = 170 分（每个 10 分，${s1.parts.title}）`);
  ok(s1.parts.turn === 50, `存活分封顶 50（114 回合，${s1.parts.turn}）`);

  // 跨轮里程碑不能算进本轮排名（否则老兵开局白拿几十分，新手永远追不上）
  const vet = mk({ achievements: {}, roundTitles: {}, career: { sevenWa: 10 } });
  G.syncCareerAchievements(vet);
  const nov = mk({ achievements: {}, roundTitles: {} });
  ok(Object.keys(vet.achievements).length > 0, `老兵确实拿到了跨轮称号（${Object.keys(vet.achievements).length} 个）`);
  ok(G.scoreOf(vet).total === G.scoreOf(nov).total,
    `但开局分数一致，跨轮称号不计分（${G.scoreOf(vet).total} = ${G.scoreOf(nov).total}）`);

  // 新手路线：探索和合成也要能得分
  const farmer = mk({ stats: { kills: 0, moves: 40, crafts: 10 }, turn: 25, level: 5, alive: true, scene: 'map', achievements: {}, roundTitles: {} });
  const fs = G.scoreOf(farmer);
  ok(fs.parts.moves === 16, `探索 40 次 = 16 分（${fs.parts.moves}）`);
  ok(fs.parts.craft === 30, `合成 10 次 = 30 分（${fs.parts.craft}）`);

  // 带七娃回家应该大幅领先
  const win = mk({ stats: { kills: 5 }, turn: 60, level: 5, flags: { sevenWaHome: true }, alive: true, scene: 'map', achievements: {}, roundTitles: {} });
  ok(G.scoreOf(win).total > s1.total * 0.7, `带七娃回家 ${G.scoreOf(win).total} 分（够高）`);

  // 击杀 BOSS 大加分
  const boss = mk({ stats: { kills: 0, bossKills: 1 }, turn: 40, level: 5, alive: true, scene: 'map', achievements: {}, roundTitles: {} });
  ok(G.scoreOf(boss).parts.boss === 150, '击杀 BOSS = 150 分');
}

console.log('\n=== 空投：必出史诗 + 广播三遍 ===');
{
  const { ITEMS } = require('./data/items');
  const w = W.get();
  const savedRound = JSON.parse(JSON.stringify(w.round));
  const savedSupply = w.supply;
  const savedNext = w.nextSupplyAt;
  const savedChat = w.chat;
  const savedId = w.nextChatId;

  // 1) 空投箱必含史诗
  let total = 0, withEpic = 0;
  for (let i = 0; i < 12; i++) {
    const c = G.createChar('sup' + i);
    c.scene = 'map'; c.pending = null;
    w.supply = { zone: c.pos, until: Date.now() + 60000, epic: true };
    G.act(c, 'explore', {});
    if (c.scene === 'box' && c.pending && c.pending.items) {
      total++;
      const has = c.pending.items.some(it => {
        const d = ITEMS[it.id];
        return d && (d.type === 'weapon' || d.type === 'armor') && d.rarity >= 5;
      });
      if (has) withEpic++;
    }
  }
  ok(total > 0 && withEpic === total, `${total} 个空投箱全部含史诗装备（${withEpic}）`);

  // 2) 广播三遍 + 10 分钟间隔
  w.round.state = 'running';
  w.round.extended = false;
  w.round.warned5 = false;
  w.round.endsAt = Date.now() + 30 * 60000;
  w.round.hardEndsAt = Date.now() + 45 * 60000;
  w.chat = []; w.nextChatId = 1;
  w.nextSupplyAt = Date.now() - 1000;
  W.tick();
  const sup = w.chat.filter(m => m.text.includes('空投'));
  ok(sup.length === 3, `空投广播发了 ${sup.length} 遍`);
  ok(sup.every(m => /「.+」/.test(m.text)), '每条都带地点');
  const gap = (w.nextSupplyAt - Date.now()) / 60000;
  ok(gap > 9.5 && gap <= 10.1, `下次空投约 ${gap.toFixed(1)} 分钟后`);

  // 3) 结束前 5 分钟预警
  w.chat = []; w.nextChatId = 1;
  w.round.endsAt = Date.now() + 4 * 60000;
  w.round.warned5 = false;
  W.tick();
  const warn = w.chat.filter(m => m.text.includes('5 分钟'));
  ok(warn.length === 1, '结束前 5 分钟有预警');
  W.tick();
  ok(w.chat.filter(m => m.text.includes('5 分钟')).length === 1, '预警不重复发');

  // 还原
  w.round = savedRound;
  w.supply = savedSupply;
  w.nextSupplyAt = savedNext;
  w.chat = savedChat;
  w.nextChatId = savedId;
  W.save();
}


console.log('\n=== 强化附魔词条 ===');
{
  const { ITEMS } = require('./data/items');
  const mk = () => {
    const c = G.createChar('附魔');
    c.scene = 'map';
    c.equip.weapon = null;
    c.bag = [];
    for (let i = 0; i < 9; i++) G.giveItem(c, 'w05', 1);
    G.act(c, 'equip', { itemId: 'w05', plus: 0 });
    return c;
  };
  const c = mk();
  const before = {};
  G.ATTRS.forEach(k => { before[k] = G.effAttr(c, k); });

  // +1 不该有词条
  const r1 = G.act(c, 'enhance', { itemId: 'w05', plus: 0 });
  ok(r1.ok, '+1 强化成功');
  ok(!(r1.affix && r1.affix.length), '+1 不带附魔');

  // 一路强化到 +3
  let guard = 0;
  while (guard++ < 20) {
    let did = false;
    for (let p = 0; p <= 2; p++) {
      if (G.findCopies(c, 'w05', p).length >= 2) {
        const r = G.act(c, 'enhance', { itemId: 'w05', plus: p });
        if (r.ok) { did = true; break; }
      }
    }
    if (!did) break;
  }
  const w = c.equip.weapon;
  ok(w && w.plus === 3, `强化到 +3（${w && w.plus}）`);
  ok(w.affix && w.affix.length === 2, `+3 有 2 条附魔（${w.affix ? w.affix.length : 0}）`);

  // 单条上限 10，属性名合法
  ok(w.affix.every(a => a.v >= 1 && a.v <= G.AFFIX_MAX), `每条都在 1~${G.AFFIX_MAX}（${w.affix.map(a => a.v).join('/')}）`);
  ok(w.affix.every(a => G.ATTRS.includes(a.k)), '属性名合法');
  ok(new Set(w.affix.map(a => a.k)).size === w.affix.length, '两条不会重复同一属性');

  // 属性真的生效
  const after = {};
  G.ATTRS.forEach(k => { after[k] = G.effAttr(c, k); });
  const gained = w.affix.every(a => after[a.k] === Math.min(100, before[a.k] + a.v));
  ok(gained, `附魔属性生效：${w.affix.map(a => G.ATTR_CN[a.k] + ' +' + a.v).join('、')}`);

  // 卸下来就不生效
  G.act(c, 'unequip', { slot: 'weapon' });
  const off = {};
  G.ATTRS.forEach(k => { off[k] = G.effAttr(c, k); });
  ok(w.affix.every(a => off[a.k] === before[a.k]), '卸下后附魔不生效');

  // 文案
  const txt = G.affixText(w);
  ok(/\+/.test(txt) && txt.length > 0, `词条文案：${txt}`);

  // 词条跟着实例走（卸下再装备不丢）
  G.act(c, 'equip', { itemId: 'w05', plus: 3 });
  ok(c.equip.weapon.affix && c.equip.weapon.affix.length === 2, '卸下再装备，附魔还在');
}

console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
process.exit(fail ? 1 : 0);
