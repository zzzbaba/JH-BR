// 第九套：玩家对战（PVP）与多人环境
// 需要服务器在跑
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = 'http://127.0.0.1:8123';
let AT = '';   // 后台 token，patch/read 要用
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(p, body, tk) {
  const r = await fetch(BASE + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tk || '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { j = {}; }
  return { status: r.status, j };
}
const savePath = u => path.join(__dirname, 'store', 'saves', crypto.createHash('md5').update(u).digest('hex').slice(0, 16) + '.json');
// 内存化之后：改文件不会自动生效，改完要让服务重读这一份
async function patch(user, fn) {
  const f = savePath(user);
  for (let i = 0; i < 24 && !fs.existsSync(f); i++) await new Promise(r => setTimeout(r, 250));
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(s.char);
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  await fetch(BASE + '/api/admin/loadone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AT },
    body: JSON.stringify({ username: user }),
  });
}
// 读也要走服务，别读可能还没落盘的磁盘
async function read(user) {
  const j = await fetch(BASE + '/api/admin/playerdetail?u=' + encodeURIComponent(user), {
    headers: { Authorization: 'Bearer ' + AT },
  }).then(r => r.json());
  return j && j.char ? j.char : null;
}


// 把当前场景推进到「地图」或「玩家遭遇」，返回 pending.pvp（有的话）
async function advance(tk) {
  for (let i = 0; i < 30; i++) {
    const st = (await req('/api/state', null, tk)).j.state;
    if (!st) return null;
    const sc = st.scene;
    if (sc === 'map') {
      const r = await req('/api/action', { action: 'explore', payload: {} }, tk);
      const s2 = r.j.state;
      if (s2 && s2.pending && s2.pending.pvp) return s2.pending.pvp;
      continue;
    }
    if (sc === 'encounter') {
      if (st.pending && st.pending.pvp) return st.pending.pvp;
      await req('/api/action', { action: 'encounter', payload: { choice: 'spare' } }, tk);
      continue;
    }
    if (sc === 'battle') { await req('/api/action', { action: 'battle', payload: { choice: 'flee' } }, tk); continue; }
    if (sc === 'loot' || sc === 'box') { await req('/api/action', { action: 'close', payload: {} }, tk); continue; }
    if (sc === 'hostage') { await req('/api/action', { action: 'hostage', payload: { choice: 'leave' } }, tk); continue; }
    if (sc === 'hostage_result') { await req('/api/action', { action: 'hostage_done', payload: {} }, tk); continue; }
    if (sc === 'sevenwa') { await req('/api/action', { action: 'sevenwa', payload: { choice: 'ignore' } }, tk); continue; }
    if (sc === 'liuying') { await req('/api/action', { action: 'liuying', payload: { choice: 'red', answer: 0 } }, tk); continue; }
    return null;
  }
  return null;
}


// 找一个当前没人的区块，保证测试不受历史玩家干扰
function freeZone(except) {
  const dir = path.join(__dirname, 'store', 'saves');
  const used = new Set();
  for (const f of fs.readdirSync(dir)) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j.char && j.char.scene !== 'dead') used.add(j.char.pos);
    } catch (e) { /* ignore */ }
  }
  const all = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) all.push('z' + y + x);
  const free = all.filter(z => !used.has(z) && z !== except);
  return free.length ? free[Math.floor(Math.random() * free.length)] : all[Math.floor(Math.random() * all.length)];
}

(async () => {
  const at = await req('/api/admin/login', { password: 'jianghan' }).then(x => x.j.token);
  AT = at;
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at };
  const ov = await req('/api/admin/overview', null, at).then(x => x.j);
  if (ov.round.state !== 'running') await req('/api/admin/round', { action: 'start' }, at);
  // 测试期间把 PVP 概率拉满，避免随机
  await req('/api/admin/settings', { pvpChance: 100 }, at);

  async function mkPlayer(tag) {
    const user = tag + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90);
    const tk = await req('/api/register', { username: user, password: '1234' }).then(x => x.j.token);
    await req('/api/newgame', { name: tag }, tk);
    await sleep(120);
    return { user, tk };
  }

  console.log('\n=== 同区块玩家遭遇 ===');
  const A = await mkPlayer('战士');
  const B = await mkPlayer('靶子');
  // 两人挪到同一区块，B 血量压低方便一击致死
  const spawn = freeZone();   // 空区块，保证只会撞到 B
  await patch(A.user, c => { c.pos = spawn; c.scene = 'map'; c.pending = null; });
  await patch(B.user, c => { c.pos = spawn; c.scene = 'map'; c.pending = null; c.hp = 12; c.gold = 500; });

  // 强制这个区块必出「遭遇战」—— 只靠随机 explore，6 次里可能一次战斗都碰不上
  await req('/api/admin/roundcfg', { zone: spawn, lootMul: 1, force: 'fight', forceChance: 100 }, at);
  let pvpSeen = null;
  for (let i = 0; i < 10 && !pvpSeen; i++) pvpSeen = await advance(A.tk);
  ok(!!pvpSeen, '同区块遇到真人：' + (pvpSeen ? pvpSeen.name : '没遇到'));

  if (pvpSeen) {
    // 打之前先记下对方的状态（他可能是历史测试留下的玩家）
    const before = await read(pvpSeen.user);
    const hp0 = before.hp, gold0 = before.gold || 0;
    await req('/api/action', { action: 'encounter', payload: { choice: 'fight' } }, A.tk);
    for (let i = 0; i < 30; i++) {
      const r = await req('/api/action', { action: 'battle', payload: { choice: 'attack' } }, A.tk);
      const st = r.j.state;
      if (!st || st.scene !== 'battle') break;
      await sleep(60);
    }
    const victim = await read(pvpSeen.user);
    ok(victim.hp < hp0 || victim.alive === false, `对方真的掉血了（${hp0} → ${victim.hp}，alive ${victim.alive}）`);
    ok((victim.gold || 0) < gold0, `对方掉了钱（${gold0} → ${victim.gold}）`);
    const logTxt = (victim.log || []).map(l => l.text).join('|');
    ok(/对你动手/.test(logTxt), '对方日志收到袭击提示：' + ((logTxt.match(/[^|]*对你动手[^|]*/) || [''])[0]));
    ok(true, `被打的是 ${pvpSeen.name}（${pvpSeen.user}）`);
  }

  console.log('\n=== 不同区块不会遇到 ===');
  {
    const C = await mkPlayer('远处');
    const D = await mkPlayer('另处');
    const zc = freeZone();
    const zd = freeZone(zc);
    await patch(C.user, c => { c.pos = zc; c.scene = 'map'; c.pending = null; });
    await patch(D.user, c => { c.pos = zd; c.scene = 'map'; c.pending = null; });
    let met = false;
    for (let i = 0; i < 6 && !met; i++) met = !!(await advance(C.tk));
    ok(!met, '不同区块不会触发玩家遭遇');
  }

  console.log('\n=== GM 隐身 ===');
  {
    const G1 = await mkPlayer('隐身GM');
    const E = await mkPlayer('路人');
    // 把 G1 设成 GM
    await req('/api/admin/gm', { username: G1.user, isGM: true }, at);
    const zg = freeZone();
    await patch(E.user, c => { c.pos = zg; c.scene = 'map'; c.pending = null; });
    await patch(G1.user, c => { c.pos = zg; c.scene = 'map'; c.pending = null; });
    let metGm = false;
    for (let i = 0; i < 6 && !metGm; i++) {
      const pv = await advance(E.tk);
      if (pv && pv.name === '隐身GM') metGm = true;
    }
    ok(!metGm, 'GM 玩家不会被别人遇到');
    await req('/api/admin/gm', { username: G1.user, isGM: false }, at);
  }

  // 收尾：清掉强制事件 + 恢复概率
  await req('/api/admin/roundcfg', { clear: true }, at);
  await req('/api/admin/settings', { pvpChance: 45 }, at);
  console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
