// 第八套：界面状态机测试（需要服务器在跑 + playwright-core）
// 覆盖七套测不到的东西：弹窗开关、死锁自愈、键盘、状态样式
//
// 跑法：
//   NODE_PATH="$HOME/.workbuddy-ai/binaries/node/workspace/node_modules" \
//     node ui-test.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8123';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

let AT = '';
let browser = null;

async function adminLogin() {
  AT = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'jianghan' }),
  }).then(r => r.json()).then(j => j.token);
  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ action: 'start' }),
    });
  }
}

async function newPlayer(tag) {
  const user = tag + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: tag }),
  });
  await sleep(150);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1300);
  return { user, tk, page, ctx, errs };
}

function savePathOf(user) {
  return path.join(__dirname, 'store', 'saves', crypto.createHash('md5').update(user).digest('hex').slice(0, 16) + '.json');
}

// 直接改存档，把角色钉在某个场景（比等随机事件可靠）
// 内存化之后：改文件不会自动生效，必须让服务重读这一份。
// 新玩家的存档要等落盘周期（≤2 秒），所以先轮询等文件出现。
async function patchSave(user, fn) {
  const f = savePathOf(user);
  for (let i = 0; i < 24 && !fs.existsSync(f); i++) await sleep(250);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(s.char);
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  await fetch(BASE + '/api/admin/loadone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AT },
    body: JSON.stringify({ username: user }),
  });
}

const modalState = page => page.evaluate(() => ({
  hidden: document.querySelector('#modal').classList.contains('hidden'),
  title: (document.querySelector('.m-title') || {}).textContent || '',
}));

(async () => {
  await adminLogin();
  browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  // ---------- 1. 键盘：Enter 探索 ----------
  console.log('\n=== 键盘：Enter 探索 ===');
  {
    const { page, errs } = await newPlayer('ui1');
    const hints = await page.$$eval('.kbd-hint', els => els.filter(e => !e.classList.contains('hidden')).map(e => e.textContent));
    ok(hints.some(h => h.includes('Enter 探索')), '地图上显示键盘提示条：' + hints.join('|'));
    const before = await page.evaluate(async () => {
      const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
      return { turn: j.state.char.turn, ep: j.state.char.ep, scene: j.state.scene };
    });
    await page.keyboard.press('Enter');
    await sleep(900);
    const after = await page.evaluate(async () => {
      const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
      return { turn: j.state.char.turn, ep: j.state.char.ep, scene: j.state.scene };
    });
    ok(after.turn > before.turn || after.ep < before.ep || after.scene !== before.scene, `回车有动作（turn ${before.turn}→${after.turn}）`);
    ok(errs.length === 0, '无页面错误');
    await page.context().close();
  }

  // ---------- 2. 满包开箱：失败有提示，弹窗不消失 ----------
  console.log('\n=== 满包开箱 ===');
  {
    const { user, page } = await newPlayer('ui2');
    await patchSave(user, c => {
      c.bag = [];
      for (let i = 0; i < 16; i++) c.bag.push({ id: 'm_scrap', n: 1 });   // size2 → 32 格
      c.scene = 'box';
      c.pending = { items: [{ id: 'med01', n: 2 }, { id: 'w02', n: 1 }], text: '墙角堆着的木箱。', zoneName: '十号地' };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1300);
    const _m = await page.evaluate(()=>({hidden:document.querySelector('#modal').classList.contains('hidden'),title:(document.querySelector('.m-title')||{}).textContent||'',scene:(typeof S!=='undefined'&&S)?S.scene:'noS',wait:!document.querySelector('#waitScreen').classList.contains('hidden'),game:!document.querySelector('#gameScreen').classList.contains('hidden'),bag:S&&S.char&&S.char.bag.length}));
    ok(_m.title === '开箱', '满包也能打开箱子（实际：' + JSON.stringify(_m) + '）');
    await page.click('#mFoot .btn:nth-child(1)');   // 全部拿走
    await sleep(1000);
    const t = await page.$eval('.toast', el => el.textContent).catch(() => '');
    ok(/背包满/.test(t), '拿不动时底部有提示：' + t);
    ok(!(await modalState(page)).hidden, '弹窗没有消失（不会卡死）');
    await page.context().close();
  }

  // ---------- 3. 开箱 → 背包 → Esc 回开箱 ----------
  console.log('\n=== 浮层关闭后回到场景 ===');
  {
    const { user, page } = await newPlayer('ui3');
    await patchSave(user, c => {
      c.scene = 'box';
      c.pending = { items: [{ id: 'med01', n: 1 }], text: '木箱。', zoneName: '十号地' };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1300);
    await page.click('#mFoot .btn:nth-child(2)');   // 背包
    await sleep(500);
    ok((await modalState(page)).title === '背包', '从开箱页打开背包');
    await page.keyboard.press('Escape');
    await sleep(500);
    const s1 = await modalState(page);
    ok(!s1.hidden && s1.title === '开箱', `Esc 关背包回到开箱（实际：${s1.title}）`);

    await page.click('#mFoot .btn:nth-child(2)');
    await sleep(400);
    await page.mouse.click(40, 450);                // 点遮罩
    await sleep(500);
    const s2 = await modalState(page);
    ok(!s2.hidden && s2.title === '开箱', `点遮罩关背包也回到开箱（实际：${s2.title}）`);
    await page.context().close();
  }

  // ---------- 4. 死锁自愈 ----------
  console.log('\n=== 弹窗被强行隐藏后自愈 ===');
  {
    const { user, page } = await newPlayer('ui4');
    await patchSave(user, c => {
      c.scene = 'box';
      c.pending = { items: [{ id: 'med01', n: 1 }], text: '木箱。', zoneName: '十号地' };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1300);
    await page.evaluate(() => document.querySelector('#modal').classList.add('hidden'));
    await sleep(1600);
    const s = await modalState(page);
    ok(!s.hidden && s.title === '开箱', `1 秒内自动把弹窗画回来（实际：${s.title}）`);
    await page.context().close();
  }

  // ---------- 5. 满血满精力跑马灯 ----------
  console.log('\n=== 满状态跑马灯 ===');
  {
    const { page } = await newPlayer('ui5');
    const info = await page.evaluate(() => {
      const v = document.querySelectorAll('.vital');
      return {
        cls: v[0].className,
        anim: getComputedStyle(document.querySelector('#hpBar'), '::after').animationName,
        label: getComputedStyle(v[0].querySelector('.vital-label span')).color,
      };
    });
    ok(info.cls.includes('state-full'), '满血满精力加 state-full：' + info.cls);
    ok(info.anim === 'marchLight', '跑马灯动画在跑：' + info.anim);
    ok(info.label === 'rgb(143, 220, 106)', '生命二字变绿：' + info.label);
    await page.context().close();
  }

  // ---------- 6. 精力为 0：不死、不能探索 ----------
  console.log('\n=== 精力为 0 ===');
  {
    const { user, page } = await newPlayer('ui6');
    await patchSave(user, c => { c.ep = 0; });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1300);
    const st = await page.evaluate(async () => {
      const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
      return { alive: j.state.char.alive, scene: j.state.scene, ep: j.state.char.ep };
    });
    ok(st.alive === true && st.scene === 'map', `精力 0 仍然活着（${JSON.stringify(st)}）`);
    await page.keyboard.press('Enter');
    await sleep(1000);
    const t = await page.$eval('.toast', el => el.textContent).catch(() => '');
    ok(/精力/.test(t), '探索被拒并提示：' + t);
    await page.context().close();
  }

  // ---------- 7. 道具面板数量下拉 ----------
  console.log('\n=== 道具面板一次用多个 ===');
  {
    const { user, page } = await newPlayer('ui7');
    await patchSave(user, c => {
      c.bag = [{ id: 'med08', n: 5 }, { id: 'med01', n: 3 }];
      c.ep = 20;
      c.scene = 'encounter';
      c.pending = {
        enemy: { id: 'e02', name: '拾荒者', kind: 'human', tier: 1, hp: 34, maxHp: 34, atk: 7, def: 1, dodge: 8, flee: 75, desc: '', w: 1 },
        zoneName: '十号地', wave: 1, source: 'random',
      };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1300);
    await page.click('text=使用道具');
    await sleep(500);
    const hasSel = await page.$('[data-sel="med08"]');
    ok(!!hasSel, '可批量吃的药有数量下拉');
    await page.selectOption('[data-sel="med08"]', '3');
    await sleep(250);
    const btn = await page.$eval('[data-use="med08"]', el => el.textContent);
    ok(btn === '用 3 个', '按钮文案跟着变：' + btn);
    await page.hover('.recipe:has([data-sel="med08"])');
    await sleep(400);
    const tip = await page.$eval('#tip', el => el.innerText.replace(/\n+/g, ' ')).catch(() => '');
    ok(/按一次用 3 个计算/.test(tip) && /\+36/.test(tip), '悬浮提示按 3 个算：' + tip);
    await page.context().close();
  }

  // ---------- 8. 排行榜历史不重叠 ----------
  console.log('\n=== 排行榜历史 ===');
  {
    const { page } = await newPlayer('ui8');
    await page.evaluate(() => openRankModal());
    await sleep(900);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.rank-row')]
      .filter(r => r.querySelector('.no.hist'))
      .slice(0, 5)
      .map(r => {
        const a = r.querySelector('.no').getBoundingClientRect();
        const b = r.querySelector('.nm').getBoundingClientRect();
        return { gap: Math.round(b.left - a.right), no: r.querySelector('.no').textContent, reason: r.querySelector('.kd').textContent };
      }));
    ok(rows.length > 0, `有历史记录（${rows.length} 条）`);
    ok(rows.every(r => r.gap >= 2), '轮次号没压到名字上：' + JSON.stringify(rows.map(r => r.gap)));
    ok(rows.every(r => /[\u4e00-\u9fa5]/.test(r.reason)), '结束原因是中文：' + (rows[0] && rows[0].reason));
    await page.context().close();
  }

  // ---------- 9. 七娃胜利 → 结算 → 等待区（放最后：会结束本轮） ----------
  console.log('\n=== 七娃胜利 → 结算 → 等待区 ===');
  {
    const { user, page } = await newPlayer('ui8');
    await fetch(BASE + '/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ sevenWaChance: 100 }),
    });
    await patchSave(user, c => { c.scene = 'sevenwa'; c.pending = {}; });
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await page.evaluate(() => localStorage.getItem('br_token'))) };
    const r = await fetch(BASE + '/api/action', { method: 'POST', headers: H, body: JSON.stringify({ action: 'sevenwa', payload: { choice: 'talk' } }) }).then(x => x.json());
    ok(r.state && r.state.scene === 'sevenwin', '带走七娃 → 胜利画面');
    ok(r.round && r.round.state === 'ended' && r.round.endReason === 'sevenwa', `本轮立即结束（${r.round && r.round.endReason}）`);

    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    ok((await page.$eval('.win-title', el => el.textContent.trim()).catch(() => '')) === '你 们 回 家 了', '刷新后仍是胜利画面');

    await page.click('#mFoot .btn');           // 结算
    await sleep(1800);
    const w1 = await page.evaluate(() => ({
      wait: !document.querySelector('#waitScreen').classList.contains('hidden'),
      title: (document.querySelector('#waitTitle') || {}).textContent,
    }));
    ok(w1.wait && w1.title === '本轮结束', `结算后进入等待区（${w1.title}）`);

    const st = await fetch(BASE + '/api/state', { headers: H }).then(x => x.json());
    ok(st.hasSave === false && st.settled === true, `后端已落库（hasSave=${st.hasSave}, settled=${st.settled}）`);

    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    const w2 = await page.evaluate(() => ({
      wait: !document.querySelector('#waitScreen').classList.contains('hidden'),
      title: (document.querySelector('#waitTitle') || {}).textContent,
    }));
    ok(w2.wait, `刷新也不会弹回胜利画面（${w2.title}）`);
    await page.context().close();
  }

  console.log('\n=== 合成台：背包满不能合 ===');
  {
    // 上一段把轮次结束了，这里先开一轮，否则 newgame 建不出存档
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ action: 'start' }),
    });
    await sleep(300);
    // 曾经的 bug：背包满时仍然「合成成功」，材料扣了、成品 x0
    const { user, page } = await newPlayer('ui9');
    await patchSave(user, c => {
      c.scene = 'map';
      c.pending = null;
      c.attrs.int = 100;
      c.bag = [{ id: 'm_cloth', n: 10 }, { id: 'm_nail', n: 10 }];
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);

    const btn = () => page.evaluate(() => {
      const b = document.querySelector('[data-craft="r65"]');
      return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
    });

    await page.evaluate(() => openCraft());
    await sleep(600);
    const b1 = await btn();
    ok(b1 && !b1.disabled && b1.text === '合成', `背包有空时能合成（${b1 && b1.text}）`);

    // 塞满
    await page.evaluate(() => {
      const cap = S.char.slots;
      let used = S.char.bag.reduce((s, it) => s + ((META.items[it.id] || {}).size || 1), 0);
      let g = 0;
      while (used < cap && g++ < 2000) { S.char.bag.push({ id: 'm_scrap', n: 1 }); used++; }
    });
    await page.evaluate(() => openCraft());
    await sleep(600);
    const b2 = await btn();
    ok(b2 && b2.disabled && b2.text === '背包满', `背包满时按钮变「背包满」且禁用（${b2 && b2.text}）`);

    // 真点一下，确认什么都没发生
    const before = await page.evaluate(() => S.char.bag.filter(x => x.id === 'a15').reduce((s, x) => s + x.n, 0));
    await page.evaluate(() => { const b = document.querySelector('[data-craft="r65"]'); if (b) b.click(); });
    await sleep(500);
    const after = await page.evaluate(() => ({
      jeans: S.char.bag.filter(x => x.id === 'a15').reduce((s, x) => s + x.n, 0),
      cloth: S.char.bag.filter(x => x.id === 'm_cloth').reduce((s, x) => s + x.n, 0),
      log: S.log.slice(-1)[0] && S.log.slice(-1)[0].text,
    }));
    ok(after.jeans === before, `没产出成品（${after.jeans}）`);
    ok(after.cloth === 10, `材料没被扣（布条 ${after.cloth}）`);
    ok(!/x0/.test(after.log || ''), `日志里没有 x0（${after.log}）`);
    await page.context().close();
  }


  console.log('\n=== 背包：可强化黄标 ===');
  {
    const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(x => x.json());
    if (ov.round.state !== 'running') {
      await fetch(BASE + '/api/admin/round', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
        body: JSON.stringify({ action: 'start' }),
      });
      await sleep(400);
    }
    const { user, page } = await newPlayer('ui11');
    await patchSave(user, c => {
      c.scene = 'map';
      c.pending = null;
      c.equip = { weapon: null, head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null };
      c.bag = [
        { id: 'a20', n: 1 }, { id: 'a20', n: 1 },   // 防暴面罩 ×2 → 可强化
        { id: 'w07', n: 1 }, { id: 'w07', n: 1 },   // 消防斧 ×2 → 可强化
        { id: 'a05', n: 1 },                        // 军用钢盔 ×1 → 不可
        { id: 'w05', n: 1, plus: 3 },               // 已满级 → 不可
        { id: 'med01', n: 5 },                      // 药物 → 不可
      ];
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(() => openBag());
    await sleep(700);

    const info = await page.evaluate(() => [...document.querySelectorAll('.bag-cell[data-id]')].map(e => ({
      id: e.dataset.id,
      enh: !!e.querySelector('.enh-dot'),
      cls: e.classList.contains('enh-able'),
      anim: getComputedStyle(e).animationName,
    })));
    const marked = info.filter(x => x.enh).map(x => x.id).sort();
    ok(JSON.stringify(marked) === '["a20","w07"]', `只有凑够 2 件的装备打黄标（${marked.join('/') || '无'}）`);
    ok(info.every(x => x.enh === x.cls), '黄标和边框高亮同时出现');
    const markedEls = info.filter(x => x.enh);
    ok(markedEls.every(x => x.anim === 'enhGlow'), '可强化的格子有闪烁动画');
    const notMarked = info.find(x => x.id === 'w05');
    ok(notMarked && !notMarked.enh, '+3 满级不打黄标');
    const single = info.find(x => x.id === 'a05');
    ok(single && !single.enh, '只有 1 件的不打黄标');
    const med = info.find(x => x.id === 'med01');
    ok(med && !med.enh, '药物不打黄标');

    // 强化一件后，黄标应该消失
    const H2 = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await page.evaluate(() => localStorage.getItem('br_token'))) };
    const r = await fetch(BASE + '/api/action', { method: 'POST', headers: H2, body: JSON.stringify({ action: 'enhance', payload: { itemId: 'a20', plus: 0 } }) }).then(x => x.json());
    ok(r.ok, '强化成功：' + r.msg);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    await page.evaluate(() => openBag());
    await sleep(600);
    const after = await page.evaluate(() => [...document.querySelectorAll('.bag-cell[data-id]')].filter(e => e.querySelector('.enh-dot')).map(e => e.dataset.id));
    ok(!after.includes('a20'), `强化后 a20 的黄标消失了（剩 ${after.join('/') || '无'}）`);

    await page.context().close();
  }



  console.log('\n=== 强化后的数值要看得见 ===');
  {
    const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(x => x.json());
    if (ov.round.state !== 'running') {
      await fetch(BASE + '/api/admin/round', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
        body: JSON.stringify({ action: 'start' }),
      });
      await sleep(400);
    }
    const { user, page } = await newPlayer('ui13');
    await patchSave(user, c => {
      c.scene = 'map';
      c.pending = null;
      c.equip = { weapon: null, head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null };
      // 安全帽基础防御只有 3，按百分比算 +1 后还是 3 —— 必须至少 +1
      c.bag = [
        { id: 'a01', n: 1 },
        { id: 'a01', n: 1, plus: 1 },
        { id: 'a01', n: 1, plus: 3 },
        { id: 'a09', n: 1, plus: 3 },
      ];
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    await page.evaluate(() => openBag());
    await sleep(700);

    const tipOf = (id, plus) => page.evaluate(([i, pl]) => {
      const cell = document.querySelector(`.bag-cell[data-id="${i}"][data-plus="${pl}"]`);
      if (!cell) return null;
      tipTarget = cell;
      showTip(i, { clientX: 600, clientY: 400 });
      return document.querySelector('#tip').textContent.replace(/\s+/g, ' ').trim();
    }, [id, plus]);

    const t0 = await tipOf('a01', 0);
    const t1 = await tipOf('a01', 1);
    const t3 = await tipOf('a01', 3);
    ok(/防御\s*3/.test(t0), `安全帽 +0 提示显示防御 3（${t0.slice(0, 40)}）`);
    ok(/防御\s*4/.test(t1), `安全帽 +1 提示显示防御 4，不是 3（${t1.slice(0, 40)}）`);
    ok(/防御\s*6/.test(t3), `安全帽 +3 提示显示防御 6（${t3.slice(0, 40)}）`);
    ok(/\+1/.test(t1) && /基础\s*3/.test(t1), `提示里标了强化等级和基础值`);

    const big = await tipOf('a09', 3);
    ok(/防御\s*31/.test(big), `防弹衣 +3 按 30% 算 → 31（${big.slice(0, 40)}）`);

    // 详情区也要写清楚
    await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="a01"][data-plus="3"]'); if (c) c.click(); });
    await sleep(500);
    const detail = await page.evaluate(() => {
      const el = document.querySelector('.item-detail');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    ok(/防御 \+6/.test(detail) && /基础 3/.test(detail), `详情区写明「防御 +6（基础 3，+3 强化）」`);

    await page.context().close();
  }



  console.log('\n=== 强化品质标签 ===');
  {
    const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(x => x.json());
    if (ov.round.state !== 'running') {
      await fetch(BASE + '/api/admin/round', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
        body: JSON.stringify({ action: 'start' }),
      });
      await sleep(400);
    }
    const { user, page } = await newPlayer('ui15');
    await patchSave(user, c => {
      c.scene = 'map';
      c.pending = null;
      c.equip = { weapon: null, head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null };
      c.bag = [
        { id: 'w32', n: 1, plus: 3 },
        { id: 'w05', n: 1, plus: 2 },
        { id: 'a01', n: 1, plus: 1 },
        { id: 'a09', n: 1 },
      ];
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    await page.evaluate(() => openBag());
    await sleep(700);

    const gradeOf = (id, plus) => page.evaluate(([i, pl]) => {
      const c = document.querySelector(`.bag-cell[data-id="${i}"][data-plus="${pl}"]`);
      if (!c) return null;
      tipTarget = c;
      showTip(i, { clientX: 620, clientY: 380 });
      const g = document.querySelector('#tip .tip-grade');
      return g ? { txt: (g.querySelector('b') || g).textContent, cls: g.className } : null;
    }, [id, plus]);

    const g3 = await gradeOf('w32', 3);
    ok(g3 && g3.txt === '传说' && /g3/.test(g3.cls), `+3 显示「传说」（${g3 && g3.txt}）`);
    const g2 = await gradeOf('w05', 2);
    ok(g2 && g2.txt === '史诗' && /g2/.test(g2.cls), `+2 显示「史诗」（${g2 && g2.txt}）`);
    const g1 = await gradeOf('a01', 1);
    ok(g1 && g1.txt === '优秀' && /g1/.test(g1.cls), `+1 显示「优秀」（${g1 && g1.txt}）`);
    const g0 = await gradeOf('a09', 0);
    ok(!g0, '+0 不显示品质标签');

    // 标签不能把标题行挤变形
    const nameW = await page.evaluate(() => {
      const c = document.querySelector('.bag-cell[data-id="w32"][data-plus="3"]');
      tipTarget = c;
      showTip('w32', { clientX: 620, clientY: 380 });
      const n = document.querySelector('#tip .tip-name');
      const t = document.querySelector('#tip .tip-type');
      return { nameH: n.getBoundingClientRect().height, typeH: t.getBoundingClientRect().height };
    });
    ok(nameW.typeH < 40, `「武器」标签没被挤成竖排（高 ${Math.round(nameW.typeH)}px）`);

    await page.context().close();
  }

  console.log('\n=== 附魔词条要看得见 ===');
  {
    const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(x => x.json());
    if (ov.round.state !== 'running') {
      await fetch(BASE + '/api/admin/round', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
        body: JSON.stringify({ action: 'start' }),
      });
      await sleep(400);
    }
    const { user, page } = await newPlayer('ui14');
    await patchSave(user, c => {
      c.scene = 'map';
      c.pending = null;
      // 装备位一件 +3 带两条词条，背包一件 +2 带一条
      c.equip = {
        weapon: { id: 'w05', dur: 70, mods: { sight: null, muzzle: null, grip: null }, plus: 3, affix: [{ k: 'luk', v: 8 }, { k: 'cha', v: 10 }] },
        head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null,
      };
      c.bag = [{ id: 'a09', n: 1, plus: 2, affix: [{ k: 'str', v: 5 }] }];
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);

    const eff = await page.evaluate(() => ({ luk: S.char.eff.luk, cha: S.char.eff.cha }));
    ok(eff.luk >= 8 && eff.cha >= 10, `附魔属性生效（幸运 ${eff.luk} / 魅力 ${eff.cha}）`);

    await page.evaluate(() => openBag());
    await sleep(700);

    const dot = await page.evaluate(() => !!document.querySelector('.bag-cell[data-id="a09"] .affix-dot'));
    ok(dot, '有附魔的格子左上角有紫点');

    const tip = await page.evaluate(() => {
      const c = document.querySelector('.bag-cell[data-id="a09"][data-plus="2"]');
      tipTarget = c;
      showTip('a09', { clientX: 600, clientY: 400 });
      return document.querySelector('#tip').textContent.replace(/\s+/g, ' ').trim();
    });
    ok(/附魔/.test(tip) && /武力 \+5/.test(tip), `提示里显示附魔（${tip.slice(0, 50)}…）`);

    await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="a09"][data-plus="2"]'); if (c) c.click(); });
    await sleep(500);
    const det = await page.evaluate(() => document.querySelector('.item-detail').textContent.replace(/\s+/g, ' ').trim());
    ok(/附魔：武力 \+5/.test(det), `详情区显示「附魔：武力 +5」`);

    // 装备栏的提示也要带当前装备的词条
    const eqTip = await page.evaluate(() => {
      const el = document.querySelector('#equipList .equip-slot[data-slot="weapon"]');
      tipTarget = el;
      showTip('w05', { clientX: 200, clientY: 400 });
      return document.querySelector('#tip').textContent.replace(/\s+/g, ' ').trim();
    });
    ok(/幸运 \+8/.test(eqTip) && /魅力 \+10/.test(eqTip), `装备栏提示带词条（${eqTip.slice(-50)}）`);

    await page.context().close();
  }

  console.log('\n=== 强化：作用在装备位那件 ===');
  {
    const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(x => x.json());
    if (ov.round.state !== 'running') {
      await fetch(BASE + '/api/admin/round', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
        body: JSON.stringify({ action: 'start' }),
      });
      await sleep(400);
    }
    const { user, page } = await newPlayer('ui12');
    await patchSave(user, c => {
      c.scene = 'map';
      c.pending = null;
      // 装备位 1 件 + 背包 2 件，全 +0
      c.equip = {
        weapon: { id: 'w27', dur: 100, mods: { sight: null, muzzle: null, grip: null } },
        head: null, body: null, hands: null, legs: null, face: null, feet: null, bag: null,
      };
      c.bag = [{ id: 'w27', n: 1 }, { id: 'w27', n: 1 }];
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);

    await page.evaluate(() => openBag());
    await sleep(700);
    await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="w27"]'); if (c) c.click(); });
    await sleep(500);

    const hint = await page.evaluate(() => {
      const el = document.querySelector('.enh-hint');
      return el ? el.textContent.trim() : '';
    });
    ok(/正在用的/.test(hint), `详情区说明会强化装备中那件（${hint.slice(0, 20)}…）`);

    const haveTxt = await page.evaluate(() => {
      const el = document.querySelector('.qty-row .qty-val');
      return el ? el.textContent.trim() : '';
    });
    ok(!/3\/2/.test(haveTxt), `件数不显示成 3/2（${haveTxt}）`);

    await page.evaluate(() => { const b = document.querySelector('[data-enh]'); if (b) b.click(); });
    await sleep(1800);

    const after = await page.evaluate(() => ({
      equipPlus: S.char.equip.weapon && S.char.equip.weapon.plus,
      bagCount: S.char.bag.filter(x => x.id === 'w27').length,
      weaponDmg: S.weapon && S.weapon.dmg,
      baseDmg: S.weapon && S.weapon.baseDmg,
      toast: (document.querySelector('.toast') || {}).textContent || '',
      log: (S.log.slice(-3).map(l => l.text).join(' | ')),
    }));
    ok(after.equipPlus === 1, `装备位那件强化到 +1（${after.equipPlus}）`);
    ok(after.bagCount === 1, `背包剩 1 件材料（${after.bagCount}）`);
    ok(after.weaponDmg > after.baseDmg, `武器伤害涨了（${after.baseDmg} → ${after.weaponDmg}）`);
    ok(/正在用的/.test(after.toast), `toast 说清强化了哪件（${after.toast}）`);
    ok(/装备中/.test(after.log), `日志标注了「装备中」（${after.log.slice(0, 40)}…）`);

    // 装备栏也要显示 +1
    const eqTxt = await page.evaluate(() => {
      const el = document.querySelector('#equipList .equip-slot[data-slot="weapon"]');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    ok(/\+1/.test(eqTxt), `装备栏显示 +1（${eqTxt}）`);

    await page.context().close();
  }

  console.log('\n=== 对局结束 → 自动切结算画面 ===');
  {
    // 曾经的 bug：时间到只弹一句「对局已结束。」，人还卡在游戏画面里
    const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + AT } }).then(x => x.json());
    if (ov.round.state !== 'running') {
      await fetch(BASE + '/api/admin/round', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
        body: JSON.stringify({ action: 'start' }),
      });
      await sleep(400);
    }
    const { page } = await newPlayer('ui10');

    const view = () => page.evaluate(() => ({
      game: !document.querySelector('#gameScreen').classList.contains('hidden'),
      wait: !document.querySelector('#waitScreen').classList.contains('hidden'),
      title: (document.querySelector('#waitTitle') || {}).textContent,
      hasS: !!S,
    }));

    const v0 = await view();
    ok(v0.game && !v0.wait, `开局后是游戏画面（game=${v0.game}）`);

    // 管理员结束本轮（等价于时间到）
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ action: 'end' }),
    });

    let v = await view();
    for (let i = 0; i < 20 && !v.wait; i++) { await sleep(500); v = await view(); }
    ok(v.wait && !v.game, `结束后自动切到等待区（game=${v.game}, wait=${v.wait}）`);
    ok(v.title === '本轮结束', `标题是「本轮结束」（${v.title}）`);
    ok(!v.hasS, '前端不再持有角色状态');

    // 刷新也不能弹回游戏画面
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    const v2 = await view();
    ok(v2.wait && !v2.game, `刷新后仍在等待区（${v2.title}）`);

    // 后端：结束后再操作要带 roundOver
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await page.evaluate(() => localStorage.getItem('br_token'))) };
    const act = await fetch(BASE + '/api/action', { method: 'POST', headers: H, body: JSON.stringify({ action: 'explore', payload: {} }) }).then(x => x.json());
    ok(act.roundOver === true, `结束后的操作返回 roundOver（${act.msg}）`);

    await page.context().close();
  }

  // ---------- 修理包：背包里必须能点「使用」----------
  // 回归用例：以前这里用 id 白名单判断，加了 sp_repairkit 忘了加进去，
  // 结果道具在背包里没有「使用」按钮，玩家根本用不了。
  console.log('\n=== 修理包：背包里能使用 ===');
  {
    // 上一段把轮次结束了，这里要先重开一轮，否则 newgame 失败、存档不会生成
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ action: 'start' }),
    });
    const { user, page } = await newPlayer('fix');
    await patchSave(user, c => {
      c.equip = c.equip || {};
      if (!c.equip.weapon) c.equip.weapon = { id: 'w12', dur: 10, mods: { sight: null, muzzle: null, grip: null } };
      c.equip.weapon.dur = 10;
      c.bag = c.bag || [];
      const ex = c.bag.find(i => i.id === 'sp_repairkit');
      if (ex) ex.n = 2; else c.bag.push({ id: 'sp_repairkit', n: 2 });
    });
    // 改完存档必须重新拉一次状态，否则前端 S 还是旧的，背包里看不到新塞的东西
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    await page.evaluate(() => openBag());
    await sleep(400);
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('.bag-cell[data-id="sp_repairkit"]');
      if (el) el.click();
      return !!el;
    });
    ok(clicked, '背包里有修理包格子');
    await sleep(350);
    const detail = await page.evaluate(() => (document.querySelector('#itemDetail') || {}).innerText || '');
    ok(/使用/.test(detail), '详情区有「使用」按钮');
    ok(/耐久\s*\d+\/\d+\s*→\s*\d+\/\d+/.test(detail), '详情区显示耐久预览');

    const readDur = () => page.evaluate(async () => {
      const j = await fetch('/api/state', {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') },
      }).then(r => r.json());
      return (j.state && j.state.weapon) ? j.state.weapon.dur : -1;
    });
    const before = await readDur();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#itemDetail .btn')].find(x => x.textContent.trim() === '使用');
      if (b) b.click();
    });
    await sleep(900);
    const after = await readDur();
    ok(after > before, `使用后耐久 ${before} → ${after}`);
    await page.context().close();
  }

  // ---------- 人质：挑逗按钮（回归：生育系统已整块换成唱歌/讲故事）----------
  console.log('\n=== 人质：挑逗按钮 ===');
  {
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ action: 'start' }),
    });
    const { user, page } = await newPlayer('host');
    await patchSave(user, c => {
      c.hostages = [{ name: '测试妹', at: Date.now(), mood: 'happy', moodUntil: Date.now() + 600000, songs: 0 }];
      c.scene = 'map';
      c.pending = null;
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    await page.evaluate(() => openHostages());
    await sleep(400);
    const txt = await page.evaluate(() => (document.querySelector('#modal') || {}).innerText || '');
    ok(/挑逗/.test(txt), '随行面板有「挑逗」按钮');
    ok(!/受孕|怀孕|孩子/.test(txt), '面板里不再出现生育相关字样');
    ok(/给你唱过/.test(txt), '显示唱歌次数');
    await page.context().close();
  }

    // 恢复设置 + 重开一轮，方便下次跑测试
    await fetch(BASE + '/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ sevenWaChance: 20 }),
    });
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AT },
      body: JSON.stringify({ action: 'start' }),
    });

  await browser.close();
  console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('测试异常:', e.message);
  process.exit(1);
});
