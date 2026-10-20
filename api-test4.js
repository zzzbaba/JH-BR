// NPC / 改装 / CSV 接口测试
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
  const ov = await req('/api/admin/overview', null, at);
  if (ov.j.round.state !== 'running') await req('/api/admin/round', { action: 'start' }, at);

  const u = 'npct_' + Date.now().toString().slice(-6);
  const tk = (await req('/api/register', { username: u, password: '1234' })).j.token;
  const ng = await req('/api/newgame', { name: '旅人' }, tk);
  ok(ng.j.ok, '开局成功');

  console.log('\n=== NPC 接口 ===');
  // 后台把玩家挪到老韩那里
  await req('/api/admin/player', { username: u, pos: 'z03' }, at);
  let st = (await req('/api/state', null, tk)).j.state;
  ok(st.zone.id === 'z03', `已移动到 ${st.zone.name}`);
  ok(!!st.npc, `区块内有 NPC：${st.npc && st.npc.name}`);
  ok(st.npc.favor === 0 && st.npc.canTalk === true, '初始好感 0，可对话');

  const open = await req('/api/action', { action: 'npc', payload: { npcId: st.npc.id, choice: 'open' } }, tk);
  ok(open.j.ok && open.j.state.scene === 'npc', '打开对话界面');

  const talk = await req('/api/action', { action: 'npc', payload: { npcId: st.npc.id, choice: 'talk' } }, tk);
  ok(talk.j.ok, '对话成功');
  ok(talk.j.state.npc.favor === 1, `好感 ${talk.j.state.npc.favor}`);
  ok(talk.j.state.npc.canTalk === false, '进入冷却');

  const talk2 = await req('/api/action', { action: 'npc', payload: { npcId: st.npc.id, choice: 'talk' } }, tk);
  ok(!talk2.j.ok, '冷却期被拒：' + talk2.j.msg);

  // 给钱买东西
  await req('/api/admin/player', { username: u, gold: 300 }, at);
  const buy = await req('/api/action', { action: 'npc', payload: { npcId: st.npc.id, choice: 'buy', itemId: 'sp_repairkit' } }, tk);
  ok(buy.j.ok, 'NPC 处购买：' + buy.j.msg);

  const leave = await req('/api/action', { action: 'npc', payload: { npcId: st.npc.id, choice: 'leave' } }, tk);
  ok(leave.j.ok && leave.j.state.scene === 'map', '离开回到地图');

  console.log('\n=== 改装接口 ===');
  // 塞一把枪和配件
  await req('/api/admin/bag', { username: u, action: 'add', itemId: 'w32', n: 1 }, at);
  await req('/api/admin/bag', { username: u, action: 'add', itemId: 'buff_scope', n: 1 }, at);
  await req('/api/admin/bag', { username: u, action: 'add', itemId: 'buff_silencer', n: 1 }, at);

  const eq = await req('/api/action', { action: 'equip', payload: { itemId: 'w32' } }, tk);
  ok(eq.j.ok, '装备狙击枪');
  ok(eq.j.state.weapon.dur === eq.j.state.weapon.maxDur, `满耐久 ${eq.j.state.weapon.dur}/${eq.j.state.weapon.maxDur}`);

  const hit0 = eq.j.state.char.combat.hit;
  const mod1 = await req('/api/action', { action: 'mod', payload: { action: 'install', itemId: 'buff_scope' } }, tk);
  ok(mod1.j.ok, '装瞄准镜');
  ok(mod1.j.state.char.combat.hit > hit0, `命中 ${hit0} → ${mod1.j.state.char.combat.hit}`);

  const mod2 = await req('/api/action', { action: 'mod', payload: { action: 'install', itemId: 'buff_silencer' } }, tk);
  ok(mod2.j.ok, '装消音器');
  ok(mod2.j.state.weapon.mods.muzzle === 'buff_silencer', '枪口槽已占用');

  const mod3 = await req('/api/action', { action: 'mod', payload: { action: 'remove', slot: 'sight' } }, tk);
  ok(mod3.j.ok && !mod3.j.state.weapon.mods.sight, '拆下瞄准镜');

  console.log('\n=== CSV 导出 ===');
  const csvRes = await fetch(BASE + '/api/export/csv', { headers: { Authorization: 'Bearer ' + tk } });
  ok(csvRes.status === 200, '玩家 CSV 接口 200');
  ok((csvRes.headers.get('content-type') || '').includes('text/csv'), 'Content-Type 是 text/csv');
  const buf = new Uint8Array(await csvRes.arrayBuffer());
  ok(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, '带 UTF-8 BOM（Excel 不乱码）');
  const csv = new TextDecoder('utf-8').decode(buf);
  const lines = csv.replace(/^\ufeff/, '').split('\r\n');
  ok(lines.length >= 2, `至少 2 行（表头 + 数据）`);
  ok(lines[0].includes('账号') && lines[0].includes('武器耐久'), '表头包含关键列');
  ok(lines[1].includes('旅人'), '数据行包含角色名');
  ok(lines[1].includes('88式狙击步枪'), '数据行包含当前武器');
  console.log('    表头：' + lines[0].slice(0, 80) + '…');

  const adminCsv = await fetch(BASE + '/api/admin/export/csv', { headers: { Authorization: 'Bearer ' + at } });
  ok(adminCsv.status === 200, '后台 CSV 接口 200');
  const acsv = await adminCsv.text();
  const alines = acsv.replace(/^\ufeff/, '').split('\r\n');
  ok(alines.length > 2, `后台 CSV ${alines.length - 1} 行数据`);

  // 未登录不能导
  const noauth = await fetch(BASE + '/api/export/csv');
  ok(noauth.status === 401, '未登录导出被拒');


  // ===== 后台运行日志 =====
  console.log('\n=== 后台运行日志 ===');
  {
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at };
    const j = await fetch(BASE + '/api/admin/logs?since=0&level=all', { headers: H }).then(x => x.json());
    ok(j.ok === true, '日志接口 200');
    ok(Array.isArray(j.logs) && j.logs.length > 0, `有 ${j.logs ? j.logs.length : 0} 条日志`);
    ok(typeof j.maxId === 'number', '带增量游标 maxId');
    ok(j.counts && typeof j.counts.all === 'number', '带各级别计数');
    ok(Array.isArray(j.mem) && j.mem.length > 0, `有 ${j.mem ? j.mem.length : 0} 条内存采样`);
    ok(j.now && typeof j.now.heap === 'number', `当前堆内存 ${j.now && j.now.heap}MB`);
    ok(j.now && typeof j.now.saves === 'number', `采样里有存档数（${j.now && j.now.saves}）`);

    // 每条日志字段齐全
    const bad = j.logs.filter(m => !m.at || !m.level || !m.tag || typeof m.text !== 'string');
    ok(bad.length === 0, '每条日志都有 时间/级别/标签/正文');
    const levels = new Set(j.logs.map(m => m.level));
    ok([...levels].every(l => ['info', 'warn', 'error', 'sys'].includes(l)), `级别合法（${[...levels].join('/')}）`);

    // 增量：用 maxId 再拉应该是空的
    const j2 = await fetch(BASE + '/api/admin/logs?since=' + j.maxId + '&level=all', { headers: H }).then(x => x.json());
    ok(j2.logs.length === 0 || j2.logs.every(m => m.id > j.maxId), '增量拉取不会重复');

    // 级别筛选
    const je = await fetch(BASE + '/api/admin/logs?since=0&level=error', { headers: H }).then(x => x.json());
    ok(je.logs.every(m => m.level === 'error'), `错误级筛选只返回错误（${je.logs.length} 条）`);

    // 手动采样
    const probe = await fetch(BASE + '/api/admin/logs/probe', { method: 'POST', headers: H, body: '{}' }).then(x => x.json());
    ok(probe.ok && probe.mem && typeof probe.mem.heap === 'number', '手动采样可用');

    // 未登录拿不到日志
    const noauth = await fetch(BASE + '/api/admin/logs');
    ok(noauth.status === 401, '未登录读日志被拒');
  }

  // ===== 后台同步的新功能 =====
  console.log('\n=== 后台同步新功能 ===');
  {
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at };
    const st = await fetch(BASE + '/api/admin/stats', { headers: H }).then(x => x.json());
    ok(st.catalog && st.catalog.items > 0, `物品目录统计（${st.catalog && st.catalog.items} 件）`);
    ok(st.catalog.hostile > 0, `对敌道具 ${st.catalog && st.catalog.hostile} 种`);
    ok(st.catalog.fireModes === 5, `射击模式 ${st.catalog && st.catalog.fireModes} 种`);
    ok(st.catalog.epicGear > 0, `史诗装备 ${st.catalog && st.catalog.epicGear} 件`);
    ok(st.catalog.maxPlus === 3, `强化上限 +${st.catalog && st.catalog.maxPlus}`);

    const ov = await fetch(BASE + '/api/admin/overview', { headers: H }).then(x => x.json());
    ok(ov.round && typeof ov.round.nextSupplyInMs === 'number', '轮次信息带下次空投倒计时');
    ok(ov.players.every(p => typeof p.score === 'number'), '玩家列表带排名分数');
    ok(ov.players.every(p => p.plus && typeof p.plus.weapon === 'number'), '玩家列表带强化等级');

    // 手动空投
    const sp = await fetch(BASE + '/api/admin/round', { method: 'POST', headers: H, body: JSON.stringify({ action: 'supply' }) }).then(x => x.json());
    ok(sp.ok && sp.zone, `手动空投成功 → ${sp.zone}`);
    ok(sp.round.supply && sp.round.supply.epic === true, '空投箱标记为必出史诗');
    ok(sp.round.supply.leftMs > 0, '空投有剩余时间');
  }

  console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
