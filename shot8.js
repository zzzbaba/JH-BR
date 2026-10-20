// 新主题 + 像素美术 截图
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
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({ action: 'start' }),
    });
  }

  const user = 'v2' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);

  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  // 给点装备和物品
  for (const [id, n] of [['w31', 1], ['a05', 1], ['a09', 1], ['buff_scope', 1], ['med03', 2], ['m_gunpowder', 3], ['ammo_762r', 20]]) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n }),
    });
  }
  await fetch(BASE + '/api/admin/player', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ username: user, gold: 600 }),
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  // 登录页
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'n40-login.png') });
  console.log('登录页');

  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);

  // 装武器和甲
  await page.evaluate(async () => {
    const call = (action, payload) => fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') },
      body: JSON.stringify({ action, payload }),
    }).then(r => r.json());
    await call('equip', { itemId: 'w31' });
    await call('equip', { itemId: 'a05' });
    await call('equip', { itemId: 'a09' });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, 'n41-main.png') });
  console.log('主界面');

  // 背包
  await page.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'n42-bag.png') });
  console.log('背包（图标+分类）');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // 商店
  await page.evaluate(() => document.querySelector('#btnShop')?.click());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'n43-shop.png') });
  console.log('商店');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // 探索触发遭遇
  let gotEnc = false, gotBattle = false;
  for (let i = 0; i < 14 && !gotBattle; i++) {
    const vis = await page.evaluate(() => {
      const m = document.querySelector('#modal');
      return m && !m.classList.contains('hidden');
    });
    if (vis) {
      const title = await page.evaluate(() => document.querySelector('.m-title')?.textContent || '');
      if (title.includes('遭遇') && !gotEnc) {
        await page.screenshot({ path: path.join(OUT, 'n44-encounter.png') });
        gotEnc = true;
        console.log('遭遇（敌人模型）');
        await page.evaluate(() => {
          const b = document.querySelector('.m-foot .btn.danger');
          if (b) b.click();
        });
        await sleep(800);
        continue;
      }
      if (title.includes('战斗')) {
        await page.screenshot({ path: path.join(OUT, 'n45-battle.png') });
        gotBattle = true;
        console.log('战斗（双方模型+自动攻击）');
        break;
      }
      await page.evaluate(() => {
        const bs = document.querySelectorAll('.m-foot .btn');
        if (bs.length) bs[bs.length - 1].click();
      });
      await sleep(500);
      continue;
    }
    await page.evaluate(() => document.querySelector('#btnExplore')?.click());
    await sleep(420);
  }

  // NPC
  await page.evaluate(() => {
    const m = document.querySelector('#modal');
    if (m && !m.classList.contains('hidden')) {
      const bs = document.querySelectorAll('.m-foot .btn');
      if (bs.length) bs[bs.length - 1].click();
    }
  });
  await sleep(400);
  await fetch(BASE + '/api/admin/player', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ username: user, pos: 'z03', resetScene: true }),
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.evaluate(() => document.querySelector('#btnNpc')?.click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'n46-npc.png') });
  console.log('NPC（模型）');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
