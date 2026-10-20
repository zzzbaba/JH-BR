// 新功能端到端测试：轮次 / 商店 / 聊天 / GM / 交易 / 成就 / 后台
const BASE = 'http://127.0.0.1:8123';
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(path, body, tk) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (tk || '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { j = { ok: false, raw: true }; }
  return { status: r.status, j };
}

(async () => {
  const A = 'gmtest_' + Date.now().toString().slice(-6);
  const B = 'ptest_' + Date.now().toString().slice(-6);

  console.log('\n=== 注册与轮次 ===');
  const ra = await req('/api/register', { username: A, password: '1234' });
  const ta = ra.j.token;
  ok(ra.j.ok, '账号 A 注册');

  const rb = await req('/api/register', { username: B, password: '1234' });
  const tb = rb.j.token;
  ok(rb.j.ok, '账号 B 注册');

  let st = await req('/api/state', null, ta);
  ok(['idle', 'running', 'ended'].includes(st.j.round.state), `轮次状态合法（${st.j.round.state}）`);
  ok(st.j.hasSave === false, '新账号无存档');

  console.log('\n=== 开局自动开轮 ===');
  // 上一轮如果已结束，先让管理员开一轮，保证测试可重复
  if (st.j.round.state === 'ended') {
    const pre = await req('/api/admin/login', { password: 'jianghan' });
    await req('/api/admin/round', { action: 'start' }, pre.j.token);
    console.log('  （上一轮已结束，已开新一轮）');
  }
  const ng = await req('/api/newgame', { name: '甲' }, ta);
  ok(ng.j.ok, 'A 开局');
  ok(ng.j.round.state === 'running', `开局后轮次 running（${ng.j.round.state}）`);
  const roundId = ng.j.round.id;
  let SA = ng.j.state;
  ok(SA.char.gold === 100, `初始金币 100（${SA.char.gold}）`);
  ok(SA.zone.name === '十号地', '出生在十号地');
  ok(!!SA.merchant, `十号地有商人（${SA.merchant && SA.merchant.name}）`);

  const ng2 = await req('/api/newgame', { name: '乙' }, tb);
  ok(ng2.j.ok && ng2.j.round.id === roundId, 'B 加入同一轮');
  let SB = ng2.j.state;

  console.log('\n=== 商店 ===');
  const buy = await req('/api/action', { action: 'shop_buy', payload: { itemId: 'med01', n: 2 } }, ta);
  ok(buy.j.ok, '买 2 个绷带');
  SA = buy.j.state;
  ok(SA.char.gold === 20, `金币 100 → 20（实际 ${SA.char.gold}）`);
  const buyBad = await req('/api/action', { action: 'shop_buy', payload: { itemId: 'w26', n: 1 } }, ta);
  ok(!buyBad.j.ok, '高级武器买不到：' + buyBad.j.msg);
  const buyPoor = await req('/api/action', { action: 'shop_buy', payload: { itemId: 'med03', n: 1 } }, ta);
  ok(!buyPoor.j.ok, '钱不够被拒：' + buyPoor.j.msg);

  const sell = await req('/api/action', { action: 'shop_sell', payload: { itemId: 'med01', n: 1 } }, ta);
  ok(sell.j.ok && sell.j.state.char.gold > 20, `卖出后金币 ${sell.j.state.char.gold}`);

  console.log('\n=== 聊天 ===');
  const pub = await req('/api/chat/send', { ch: 'public', text: '有人在十号地吗' }, ta);
  ok(pub.j.ok, '公共频道发言');
  const zone = await req('/api/chat/send', { ch: 'zone', text: '十号地集合' }, tb);
  ok(zone.j.ok, '区块频道发言');
  const pv = await req('/api/chat/send', { ch: 'private', to: B, text: '你好' }, ta);
  ok(pv.j.ok, '私聊发送');
  const pollB = await req('/api/chat/poll?since=0', null, tb);
  const texts = pollB.j.msgs.map(m => m.text);
  ok(texts.includes('有人在十号地吗'), 'B 能看到公共消息');
  ok(texts.includes('十号地集合'), 'B 能看到本区块消息');
  ok(texts.includes('你好'), 'B 能看到私聊');

  console.log('\n=== 后台 ===');
  const adminLogin = await req('/api/admin/login', { password: 'jianghan' });
  ok(adminLogin.j.ok, '管理员登录');
  const at = adminLogin.j.token;
  const badAdmin = await req('/api/admin/overview', null, 'wrong');
  ok(badAdmin.status === 401, '错误管理员 token 被拒');

  const ov = await req('/api/admin/overview', null, at);
  ok(ov.j.ok && ov.j.players.length >= 2, `后台看到 ${ov.j.players.length} 个角色`);
  ok(typeof ov.j.settings.lootRate === 'number', `爆率设置可读（${ov.j.settings.lootRate}）`);

  console.log('\n=== GM 绑定与命令 ===');
  const gmBind = await req('/api/admin/gm', { username: A, isGM: true }, at);
  ok(gmBind.j.ok && gmBind.j.isGM, 'A 绑定为 GM');

  const gmDeny = await req('/api/chat/send', { ch: 'public', text: '@//gm/ show me the money' }, tb);
  ok(!gmDeny.j.ok, 'B 未绑定 GM，命令被拒：' + gmDeny.j.msg);

  const gmMoney = await req('/api/chat/send', { ch: 'public', text: '@//gm/ show me the money' }, ta);
  ok(gmMoney.j.ok, 'GM 加钱：' + gmMoney.j.msg);
  let stA = await req('/api/state', null, ta);
  ok(stA.j.state.char.gold >= 10000, `金币到 ${stA.j.state.char.gold}`);

  const gmGod = await req('/api/chat/send', { ch: 'public', text: '@//gm/ god bless you' }, ta);
  ok(gmGod.j.ok, 'GM 无敌：' + gmGod.j.msg);
  stA = await req('/api/state', null, ta);
  ok(stA.j.state.char.invincible === true, '无敌状态已开启');

  const gmGive = await req('/api/chat/send', { ch: 'public', text: '@//gm/ give me 绷带 5' }, ta);
  ok(gmGive.j.ok, 'GM 给物品：' + gmGive.j.msg);
  const gmGive1 = await req('/api/chat/send', { ch: 'public', text: '@//gm/ give me 匕首' }, ta);
  ok(gmGive1.j.ok, 'GM 给单件（不给数量）：' + gmGive1.j.msg);
  const gmBad = await req('/api/chat/send', { ch: 'public', text: '@//gm/ give me 不存在的物品' }, ta);
  ok(!gmBad.j.ok, '不存在的物品被拒：' + gmBad.j.msg);

  console.log('\n=== 无敌生效 ===');
  const before = (await req('/api/state', null, ta)).j.state.char.hp;
  for (let i = 0; i < 8; i++) {
    const r = await req('/api/action', { action: 'explore' }, ta);
    if (!r.j.state) break;
    if (r.j.state.scene === 'encounter') await req('/api/action', { action: 'encounter', payload: { choice: 'fight' } }, ta);
    else if (r.j.state.scene === 'battle') {
      for (let k = 0; k < 6; k++) {
        const b = await req('/api/action', { action: 'battle', payload: { choice: 'attack' } }, ta);
        if (!b.j.state || b.j.state.scene !== 'battle') break;
      }
    } else if (r.j.state.scene === 'loot' || r.j.state.scene === 'box') {
      await req('/api/action', { action: r.j.state.scene, payload: { all: true } }, ta);
    } else if (r.j.state.scene === 'hostage') {
      await req('/api/action', { action: 'hostage', payload: { choice: 'ask' } }, ta);
    }
  }
  const after = (await req('/api/state', null, ta)).j.state;
  ok(after.char.hp === before || after.char.hp >= before, `无敌下血量没掉（${before} → ${after.char.hp}）`);

  console.log('\n=== 交易 ===');
  // 两人需在同一区块：把 B 移到十号地（B 本来就在）
  const stB = await req('/api/state', null, tb);
  const same = stB.j.state.zone.id === after.zone.id;
  ok(same, `双方同区块（${stB.j.state.zone.name} / ${after.zone.name}）`);

  if (same) {
    const offer = await req('/api/trade/offer', {
      to: B, giveGold: 100, giveItems: [], wantGold: 0, wantItems: [],
    }, ta);
    ok(offer.j.ok, 'A 向 B 发出报价（送 100 金币）');
    const listB = await req('/api/trade/list', null, tb);
    ok(listB.j.incoming.length >= 1, `B 收到 ${listB.j.incoming.length} 条报价`);
    const gB = (await req('/api/state', null, tb)).j.state.char.gold;
    const acc = await req('/api/trade/accept', { id: listB.j.incoming[0].id }, tb);
    ok(acc.j.ok, 'B 接受交易：' + acc.j.msg);
    const gB2 = (await req('/api/state', null, tb)).j.state.char.gold;
    ok(gB2 === gB + 100, `B 金币 ${gB} → ${gB2}`);
  }

  console.log('\n=== 成就 ===');
  // 用 GM 塞满 20 种物品触发「拾荒之王」
  const ITEMS = ['med01','med02','med03','med04','med05','med06','med07','med08','med09','med10','med11','med12','med13','med14','m_cloth','m_plank','m_nail','m_wire','m_tape','m_bottle'];
  for (const it of ITEMS) {
    await req('/api/chat/send', { ch: 'public', text: `@//gm/ give me ${it}` }, ta);
  }
  const stA2 = await req('/api/state', null, ta);
  const ach = stA2.j.state.char.achievements || {};
  ok(Object.keys(ach).length >= 1, `已解锁 ${Object.keys(ach).length} 个称号：${Object.keys(ach).join(',')}`);

  const achList = await req('/api/achievements', null, ta);
  ok(achList.j.all.length >= 40, `成就定义 ${achList.j.all.length} 个（要求 ≥40）`);
  ok(achList.j.all.every(a => a.cat), '每个称号都有分类');
  ok(Array.isArray(achList.j.cats) && achList.j.cats.length >= 5, `称号分类 ${(achList.j.cats||[]).join('/')}`);

  console.log('\n=== 排行榜 ===');
  const lb = await req('/api/leaderboard', null, ta);
  ok(lb.j.ok && lb.j.board.length >= 2, `排行榜 ${lb.j.board.length} 人`);
  ok(lb.j.round.id === roundId, '排行榜显示当前轮次');

  console.log('\n=== 后台改数值 / 改背包 ===');
  const setS = await req('/api/admin/settings', { lootRate: 2.5, bossHp: 500 }, at);
  ok(setS.j.ok && setS.j.settings.lootRate === 2.5, `爆率改为 ${setS.j.settings.lootRate}`);
  const editP = await req('/api/admin/player', { username: B, gold: 88888, hp: 50 }, at);
  ok(editP.j.ok && editP.j.char.gold === 88888, `改 B 金币为 ${editP.j.char.gold}`);
  const addI = await req('/api/admin/bag', { username: B, action: 'add', itemId: 'w35', n: 1 }, at);
  ok(addI.j.ok, '后台给 B 塞了一把火箭筒');
  const bagView = await req('/api/admin/bagview?u=' + encodeURIComponent(B), null, at);
  ok(bagView.j.ok && bagView.j.bag.some(x => x.id === 'w35'), '背包里确实有火箭筒');

  console.log('\n=== 轮次结束 ===');
  const endR = await req('/api/admin/round', { action: 'end' }, at);
  ok(endR.j.ok && endR.j.round.state === 'ended', `轮次结束（${endR.j.round.state}）`);
  const afterEnd = await req('/api/action', { action: 'explore' }, ta);
  ok(!afterEnd.j.ok, '结束后不能再行动：' + afterEnd.j.msg);
  const lb2 = await req('/api/leaderboard', null, ta);
  ok(lb2.j.history.length >= 1, `历史记录 ${lb2.j.history.length} 条`);

  console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
