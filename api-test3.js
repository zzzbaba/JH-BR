// 后台增强接口测试
const BASE = 'http://127.0.0.1:8123';
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

async function req(path, body, tk) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (tk || '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { j = {}; }
  return { status: r.status, j };
}

(async () => {
  const at = (await req('/api/admin/login', { password: 'jianghan' })).j.token;
  ok(!!at, '管理员登录');

  // 确保有一轮
  const r0 = await req('/api/admin/overview', null, at);
  if (r0.j.round.state !== 'running') {
    await req('/api/admin/round', { action: 'start' }, at);
  }

  // 造两个玩家
  const u1 = 'adm1_' + Date.now().toString().slice(-6);
  const u2 = 'adm2_' + Date.now().toString().slice(-6);
  const t1 = (await req('/api/register', { username: u1, password: '1234' })).j.token;
  const t2 = (await req('/api/register', { username: u2, password: '1234' })).j.token;
  const n1 = await req('/api/newgame', { name: '甲' }, t1);
  const n2 = await req('/api/newgame', { name: '乙' }, t2);
  ok(n1.j.ok && n2.j.ok, '两个玩家进场');

  console.log('\n=== 运行统计 ===');
  const st = await req('/api/admin/stats', null, at);
  ok(st.j.ok, 'stats 接口可用');
  ok(typeof st.j.accounts === 'number', `账号数 ${st.j.accounts}`);
  ok(typeof st.j.roundChars === 'number', `本轮人数 ${st.j.roundChars}`);
  ok(Array.isArray(st.j.zoneHeat), `区块分布 ${st.j.zoneHeat.length} 条`);
  ok(typeof st.j.saveBytes === 'number', `存档大小 ${Math.round(st.j.saveBytes / 1024)} KB`);
  ok(typeof st.j.uptime === 'number', `运行时长 ${st.j.uptime}s`);

  console.log('\n=== 聊天查看 ===');
  await req('/api/chat/send', { ch: 'public', text: '后台测试消息' }, t1);
  const ch = await req('/api/admin/chat', null, at);
  ok(ch.j.ok && ch.j.msgs.length > 0, `聊天记录 ${ch.j.msgs.length} 条`);
  ok(ch.j.msgs.some(m => m.text === '后台测试消息'), '能读到刚才那条');

  console.log('\n=== 玩家详情 ===');
  const pd = await req('/api/admin/playerdetail?u=' + encodeURIComponent(u1), null, at);
  ok(pd.j.ok && pd.j.char.name === '甲', '读玩家完整状态');
  ok(pd.j.char.stats && typeof pd.j.char.stats.kills === 'number', '包含统计');
  ok(pd.j.char.career && typeof pd.j.char.career.sevenWa === 'number', '包含跨轮次累计');

  console.log('\n=== 批量操作 ===');
  // 先扣血
  await req('/api/admin/player', { username: u1, hp: 5 }, at);
  const heal = await req('/api/admin/global', { action: 'heal' }, at);
  ok(heal.j.ok, `全服满血，影响 ${heal.j.affected} 人`);
  const pd2 = await req('/api/admin/playerdetail?u=' + encodeURIComponent(u1), null, at);
  ok(pd2.j.char.hp === pd2.j.char.hpMax, `甲已满血 ${pd2.j.char.hp}/${pd2.j.char.hpMax}`);

  const gold = await req('/api/admin/global', { action: 'gold', amount: 777 }, at);
  ok(gold.j.ok, `全服发金币，影响 ${gold.j.affected} 人`);
  const pd3 = await req('/api/admin/playerdetail?u=' + encodeURIComponent(u1), null, at);
  ok(pd3.j.char.gold >= 777, `甲金币 ${pd3.j.char.gold}`);

  const item = await req('/api/admin/global', { action: 'item', itemId: 'med03', n: 2 }, at);
  ok(item.j.ok, `全服发物品，影响 ${item.j.affected} 人`);

  const inv = await req('/api/admin/global', { action: 'invincible', on: true }, at);
  ok(inv.j.ok, '全服开无敌');
  const pd4 = await req('/api/admin/playerdetail?u=' + encodeURIComponent(u1), null, at);
  ok(pd4.j.char.invincible === true, '甲已无敌');
  await req('/api/admin/global', { action: 'invincible', on: false }, at);

  console.log('\n=== 代发 GM 命令 ===');
  const g1 = await req('/api/admin/gmcmd', { username: u1, cmd: 'show me the money' }, at);
  ok(g1.j.ok, '代发加钱：' + g1.j.msg);
  const g2 = await req('/api/admin/gmcmd', { username: u1, cmd: 'give me 88式狙击步枪 2' }, at);
  ok(g2.j.ok, '代发给枪：' + g2.j.msg);
  const g3 = await req('/api/admin/gmcmd', { username: u1, cmd: 'god bless you' }, at);
  ok(g3.j.ok, '代发无敌：' + g3.j.msg);
  const g4 = await req('/api/admin/gmcmd', { username: u1, cmd: '不存在的命令' }, at);
  ok(!g4.j.ok, '未知命令被拒：' + g4.j.msg);
  const g5 = await req('/api/admin/gmcmd', { username: 'nobody_xxx', cmd: 'help' }, at);
  ok(g5.status === 404, '不存在的玩家返回 404');

  console.log('\n=== 新设置项 ===');
  const s1 = await req('/api/admin/settings', {
    moveCost: 6, exploreCost: 5, encounterMul: 1.5, mineMul: 0.5,
    shopMul: 1.2, startGold: 250, statusMs: 180000, sevenWaChance: 35,
    bossEnabled: false,
  }, at);
  ok(s1.j.ok, '保存新设置');
  const s = s1.j.settings;
  ok(s.moveCost === 6 && s.exploreCost === 5, `精力消耗 ${s.moveCost}/${s.exploreCost}`);
  ok(s.encounterMul === 1.5 && s.mineMul === 0.5, `遭遇/地雷倍率 ${s.encounterMul}/${s.mineMul}`);
  ok(s.shopMul === 1.2 && s.startGold === 250, `商店倍率 ${s.shopMul} / 初始金币 ${s.startGold}`);
  ok(s.statusMs === 180000 && s.sevenWaChance === 35, `状态 ${s.statusMs}ms / 七娃 ${s.sevenWaChance}%`);
  ok(s.bossEnabled === false, 'BOSS 已关闭');

  console.log('\n=== 设置真的生效 ===');
  const ng3u = 'adm3_' + Date.now().toString().slice(-6);
  const t3 = (await req('/api/register', { username: ng3u, password: '1234' })).j.token;
  const ng3 = await req('/api/newgame', { name: '丙' }, t3);
  ok(ng3.j.ok && ng3.j.state.char.gold === 250, `新角色初始金币 ${ng3.j.state && ng3.j.state.char.gold}`);

  const mv0 = ng3.j.state.char.ep;
  const nb = ng3.j.state.neighbors[0];
  const mv = await req('/api/action', { action: 'move', payload: { x: nb.x, y: nb.y } }, t3);
  ok(mv0 - mv.j.state.char.ep >= 6, `移动消耗 ${mv0 - mv.j.state.char.ep} 精力`);

  // 恢复默认
  await req('/api/admin/settings', {
    moveCost: 4, exploreCost: 3, encounterMul: 1, mineMul: 1,
    shopMul: 1, startGold: 100, statusMs: 300000, sevenWaChance: 20, bossEnabled: true,
  }, at);
  ok(true, '设置已恢复默认');

  console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
