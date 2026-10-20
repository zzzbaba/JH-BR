// 游戏逻辑测试：人质 / 心情挑逗 / 成就 / BOSS
const W = require('./world');
W.load();
const G = require('./game');
const { FINAL_BOSS } = require('./data/boss');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

console.log('\n=== 人质解救 ===');
let taken = 0, refused = 0;
for (let i = 0; i < 60; i++) {
  const c = G.createChar('救人' + i);
  c.attrs.cha = 40;
  c.scene = 'hostage';
  c.pending = {
    hostage: { name: '周敏', taken: false },
    drops: [], enemyName: '流浪汉', chain: false, wave: 1, zoneName: '十号地',
  };
  G.act(c, 'hostage', { choice: 'ask' });
  if (c.hostages.length > 0) taken++; else refused++;
  if (i === 0) {
    ok(c.scene === 'hostage_result', '人质处理后进入表情反馈场景');
    G.act(c, 'hostage_done', {});
    ok(c.scene === 'loot', '点继续后进入战利品');
  }
}
console.log(`  60 次交涉：成功 ${taken}，失败 ${refused}`);
ok(taken > 0 && refused > 0, '交涉有成功也有失败（随机性正常）');
ok(taken >= 20, `魅力 40 时成功率合理（${Math.round(taken / 60 * 100)}%）`);

console.log('\n=== 夜里唱歌事件 ===');
{
  const c = G.createChar('夜聊');
  // 心情会自己波动，钉在「开心」，否则这条断言有 2/3 概率随机红
  c.hostages = [{ name: '李娟', at: Date.now(), mood: 'happy', moodUntil: Date.now() + 86400000, songs: 0 }];
  c.ep = 100;
  let nights = 0;
  for (let i = 0; i < 400; i++) {
    const before = c.stats.songs;
    c.scene = 'map';
    c.pending = null;
    c.ep = 100;
    c.hp = G.hpMax(c);
    G.act(c, 'rest');
    if (c.stats.songs > before) nights++;
    c.scene = 'map';
    c.pending = null;
    if (nights >= 12) break;
  }
  ok(nights > 0, `休息触发 ${nights} 次夜里唱歌`);
  ok(c.stats.songs > 0, `唱歌次数累计 ${c.stats.songs}`);
}

console.log('\n=== 人质心情与挑逗 ===');
{
  const c = G.createChar('心情');
  c.hostages = [
    { name: '开心妹', at: Date.now(), mood: 'happy', moodUntil: Date.now() + 86400000, songs: 0 },
    { name: '冷淡妹', at: Date.now(), mood: 'sad', moodUntil: Date.now() + 86400000, songs: 0 },
  ];
  const r1 = G.act(c, 'tease', { index: 1 });
  ok(!r1.ok, '不开心时不能挑逗：' + r1.msg);
  let hit = 0;
  for (let i = 0; i < 300; i++) {
    c.hostages[0].mood = 'happy';
    c.hostages[0].moodUntil = Date.now() + 86400000;
    const b0 = c.stats.songs;
    G.act(c, 'tease', { index: 0 });
    if (c.stats.songs > b0) hit++;
  }
  const rate = Math.round(hit / 300 * 100);
  ok(rate >= 12 && rate <= 28, `挑逗成功率约 20%（实测 ${rate}%）`);
  ok(c.hostages[0].songs === hit, `人质身上记录了 ${c.hostages[0].songs} 次唱歌/讲故事`);
  // 心情会过期并自动换
  c.hostages[0].moodUntil = Date.now() - 1;
  const m0 = c.hostages[0].mood;
  G.act(c, 'rest');
  ok(c.hostages[0].moodUntil > Date.now(), '心情过期后自动刷新');
}

console.log('\n=== 成就判定 ===');
{
  const c = G.createChar('成就');
  c.stats.kills = 50;
  c.stats.savedHostages = 10;
  c.stats.songs = 10;
  c.stats.crafts = 20;
  c.stats.bossKills = 1;
  c.turn = 30;
  ['sta', 'str', 'cha', 'int', 'luk'].forEach(k => { c.attrs[k] = 60; });
  for (const id of ['med01','med02','med03','med04','med05','med06','med07','med08','med09','med10','m_cloth','m_plank','m_nail','m_copper','m_tape','m_bottle','m_rope','m_scrap','m_leather','m_screw']) {
    c.bag.push({ id, n: 1 });
  }
  const unlocked = G.checkAchievements(c);
  const ids = unlocked.map(a => a.id);
  console.log('  解锁：' + ids.join(', '));
  ok(ids.includes('butcher'), '屠夫（50 杀）');
  ok(ids.includes('savior'), '人质救星（10 人质）');
  ok(ids.includes('ten_perfect'), '百听不厌（10 首歌）');
  ok(ids.includes('alchemist'), '炼金术士（20 次合成）');
  ok(ids.includes('champion'), '油田之王（击杀 BOSS）');
  ok(ids.includes('survivor'), '不死鸟（30 回合）');
  ok(ids.includes('collector'), '拾荒之王（20 种物品）');
  ok(ids.includes('ironman'), '钢铁之躯（属性总和 300）');
  ok(!ids.includes('gunsmith'), '军火商未解锁（没带 5 把枪）');
  ok(ids.length >= 9, `至少解锁上面这 9 个（实际 ${ids.length} 个）`);

  // 二次检查不应重复解锁
  const again = G.checkAchievements(c);
  ok(again.length === 0, '重复检查不会重复解锁');
}

console.log('\n=== 最终 BOSS ===');
{
  const c = G.createChar('打boss');
  c.pos = FINAL_BOSS.zone;
  c.flags.bossDefeated = false;
  // 直接构造 BOSS 遭遇
  c.scene = 'encounter';
  c.pending = {
    enemy: {
      id: FINAL_BOSS.id, name: FINAL_BOSS.name, kind: 'armed', tier: 6,
      hp: 12, maxHp: 12, atk: 30, def: 0, dodge: 0, flee: 0, desc: FINAL_BOSS.desc, w: 6,
    },
    source: 'boss', zoneName: '广华寺', noise: 0, wave: 1, boss: true,
  };
  G.act(c, 'encounter', { choice: 'fight' });
  ok(c.scene === 'battle', '进入 BOSS 战');
  for (let i = 0; i < 20 && c.scene === 'battle'; i++) G.act(c, 'battle', { choice: 'attack' });
  ok(c.flags.bossDefeated === true, 'BOSS 被击杀，标记 bossDefeated');
  ok(c.stats.bossKills === 1, 'BOSS 击杀数 +1');
  ok(c.scene === 'loot', '进入战利品结算');
  ok(c.pending && c.pending.bossWin === true, '战利品标记为 BOSS 胜利');
  ok(c.achievements.champion, '同时解锁「油田之王」');
}

console.log('\n=== 无敌 ===');
{
  const c = G.createChar('无敌');
  c.invincible = true;
  c.scene = 'battle';
  c.pending = {
    enemy: { id: 'x', name: '测试员', kind: 'human', tier: 1, hp: 999, maxHp: 999, atk: 100, def: 0, dodge: 0, flee: 0, desc: '', w: 1 },
    round: 1, log: [], noise: 0, wave: 1, hostage: null, boss: false,
    stun: 0, enemyStun: 0, smoke: 0, guaranteed: false,
  };
  const hp0 = c.hp;
  for (let i = 0; i < 10; i++) G.act(c, 'battle', { choice: 'defend' });
  ok(c.hp === hp0, `无敌下连续 10 回合不掉血（${hp0} → ${c.hp}）`);
}

console.log('\n=== 金币 ===');
{
  const c = G.createChar('金币');
  ok(c.gold === 100, `初始金币 ${c.gold}`);
  G.addGold(c, -50);
  ok(c.gold === 50, `扣钱后 ${c.gold}`);
  G.addGold(c, -9999);
  ok(c.gold === 0, '不会扣成负数');
}

console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
process.exit(fail ? 1 : 0);
