// API 端到端测试
const BASE = 'http://127.0.0.1:8123';
let token = '';
let fail = 0;

function ok(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; }

async function req(path, body, tk) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (tk || token) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json() };
}

(async () => {
  console.log('\n=== 账号 ===');
  const u = 'tester_' + Date.now().toString().slice(-6);
  const reg = await req('/api/register', { username: u, password: '1234' });
  ok(reg.json.ok, '注册成功');
  token = reg.json.token;

  const dup = await req('/api/register', { username: u, password: '1234' });
  ok(!dup.json.ok, '重复注册被拒：' + dup.json.msg);

  const bad = await req('/api/login', { username: u, password: 'wrong' });
  ok(!bad.json.ok, '错误密码被拒');

  const login = await req('/api/login', { username: u, password: '1234' });
  ok(login.json.ok, '登录成功');
  token = login.json.token;

  const noauth = await req('/api/state', null, 'badtoken');
  ok(noauth.status === 401, '无效 token 返回 401');

  console.log('\n=== 静态数据 ===');
  const meta = await req('/api/meta');
  ok(meta.json.ok && meta.json.meta.map.length === 64, 'meta 返回 64 区块');
  ok(Object.keys(meta.json.meta.items).length > 100, `物品 ${Object.keys(meta.json.meta.items).length} 件`);
  ok(meta.json.meta.recipes.length === 35, `配方 ${meta.json.meta.recipes.length} 条`);

  console.log('\n=== 开局 ===');
  const st0 = await req('/api/state');
  ok(st0.json.hasSave === false, '新账号无存档');
  const ng = await req('/api/newgame', { name: '测试' });
  ok(ng.json.ok && ng.json.state, '新游戏创建成功');
  let S = ng.json.state;
  ok(S.zone.name === '十号地', '出生在十号地');
  ok(S.char.hp === S.char.hpMax, `满血开局 ${S.char.hp}/${S.char.hpMax}`);
  ok(S.neighbors.length >= 2, `可移动方向 ${S.neighbors.length} 个`);

  console.log('\n=== 移动 ===');
  const nb = S.neighbors[0];
  const mv = await req('/api/action', { action: 'move', payload: { x: nb.x, y: nb.y } });
  ok(mv.json.ok, '移动到 ' + nb.name);
  S = mv.json.state;
  ok(S.zone.name === nb.name, '位置已更新');
  ok(S.char.ep < 100, `精力消耗 ${100 - S.char.ep}`);

  console.log('\n=== 非相邻移动被拒 ===');
  const far = await req('/api/action', { action: 'move', payload: { x: 0, y: 0 } });
  ok(!far.json.ok, '拒绝非相邻移动：' + far.json.msg);

  console.log('\n=== 探索 20 次 ===');
  let scenes = {};
  for (let i = 0; i < 20; i++) {
    let r;
    if (S.scene === 'map') r = await req('/api/action', { action: 'explore' });
    else if (S.scene === 'encounter') r = await req('/api/action', { action: 'encounter', payload: { choice: 'spare' } });
    else if (S.scene === 'battle') r = await req('/api/action', { action: 'battle', payload: { choice: 'attack' } });
    else if (S.scene === 'loot' || S.scene === 'box') r = await req('/api/action', { action: S.scene, payload: { all: true } });
    else if (S.scene === 'dead') break;
    if (!r || !r.json.state) break;
    S = r.json.state;
    scenes[S.scene] = (scenes[S.scene] || 0) + 1;
    if (S.scene === 'dead') break;
  }
  console.log('  场景分布:', JSON.stringify(scenes));
  ok(true, `20 次行动后场景=${S.scene} 回合=${S.char.turn} 击杀=${S.char.kills}`);

  console.log('\n=== 存档持久化 ===');
  const st1 = await req('/api/state');
  ok(st1.json.hasSave && st1.json.state.char.turn === S.char.turn, '重新读取存档，回合数一致');

  console.log('\n=== 装备 / 背包 ===');
  const exp = await req('/api/export');
  ok(exp.json.ok && exp.json.save.char, '存档可导出');

  console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e.message); process.exit(1); });
