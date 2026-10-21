// 第 16 轮验证：双击装备 / 升级绿点 / 道具实际效果 / 剧情 NPC 标题
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';

(async () => {
  const at = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'jianghan' }),
  }).then(r => r.json()).then(j => j.token);

  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + at } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
      body: JSON.stringify({ action: 'start' }),
    });
  }

  const user = 'r16' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  for (const [id, n] of [['a13', 1], ['w07', 1], ['a11', 1], ['med01', 2]]) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n }),
    });
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);

  const call = (action, payload) => page.evaluate(([a, p]) => fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('br_token') },
    body: JSON.stringify({ action: a, payload: p }),
  }).then(r => r.json()), [action, payload]);

  // 先戴劳保手套，让防割手套有对比对象
  await call('equip', { itemId: 'a11' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1400);

  // ---- 1. 背包：升级绿点 ----
  await page.click('#btnBag');
  await sleep(600);
  const dots = await page.$$eval('.bag-cell .up-dot', els => els.length);
  console.log('升级绿点数量:', dots);
  await page.screenshot({ path: path.join(OUT, 'r16-1-bag-dots.png') });

  // ---- 2. 点防割手套看详情（换上去的变化） ----
  await page.click('.bag-cell[data-id="a13"]');
  await sleep(300);
  const detailTxt = await page.$eval('#itemDetail', el => el.innerText.replace(/\n+/g, ' | '));
  console.log('详情:', detailTxt);
  await page.screenshot({ path: path.join(OUT, 'r16-2-armor-detail.png') });

  // ---- 3. 双击装备 ----
  await page.dblclick('.bag-cell[data-id="a13"]');
  await sleep(900);
  const equipped = await page.evaluate(async () => {
    const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
    return j.state.char.equip.hands ? j.state.char.equip.hands.id : null;
  });
  console.log('双击后 hands 槽:', equipped, equipped === 'a13' ? '✓ 装备成功' : '✗ 没装上');
  await page.screenshot({ path: path.join(OUT, 'r16-3-after-dblclick.png') });

  // ---- 4. 绷带：接近满血时的实际效果 ----
  await fetch(BASE + '/api/admin/player', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
    body: JSON.stringify({ username: user, hp: 60 }),
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1200);
  await page.click('#btnBag');
  await sleep(500);
  await page.click('.bag-cell[data-id="med01"]');
  await sleep(300);
  const medTxt = await page.$eval('#itemDetail', el => el.innerText.replace(/\n+/g, ' | '));
  console.log('绷带详情:', medTxt);
  await page.screenshot({ path: path.join(OUT, 'r16-4-med-detail.png') });

  // ---- 5. 剧情遭遇：小孩不该显示成疯女人 ----
  const npcState = {
    scene: 'encounter',
    pending: {
      enemy: { id: 'e09', name: '循声而来的疯女人', kind: 'human', tier: 2, hp: 45, maxHp: 45, atk: 14, def: 1, dodge: 18, flee: 30, desc: '', w: 2 },
      npc: {
        id: 'npc_kid', title: '拿着玩具枪的孩子',
        text: '一个七八岁的孩子举着一把塑料枪对着你，嘴里"砰"了一声。他身后没有大人。',
        talk: '蹲下来跟他说话',
      },
      zoneName: '十号地', wave: 1, source: 'npc',
    },
  };
  await page.route('**/api/state', async route => {
    const resp = await route.fetch();
    const j = await resp.json();
    if (j.state) {
      j.state.scene = npcState.scene;
      j.state.pending = npcState.pending;
    }
    await route.fulfill({ response: resp, json: j });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);
  const encTxt = await page.$eval('#modal', el => el.innerText.replace(/\n+/g, ' | '));
  console.log('遭遇弹窗:', encTxt.slice(0, 160));
  await page.screenshot({ path: path.join(OUT, 'r16-5-encounter-kid.png') });

  if (errors.length) console.log('页面错误:', errors.slice(0, 5));
  else console.log('无页面错误');

  await browser.close();
})();
