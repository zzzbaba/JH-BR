// 三栏布局 + 合成红点截图
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

  const user = 'lay' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  // 装备 + 能合成的材料
  const items = [
    ['w31', 1], ['a05', 1], ['a09', 1],
    ['m_alcohol', 2], ['m_plank', 2], ['m_nail', 4], ['m_feather', 2],
    ['m_scrap', 2], ['m_oil', 1], ['m_tape', 2],
    ['med03', 1], ['ammo_762r', 15],
  ];
  for (const [id, n] of items) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n }),
    });
  }
  await fetch(BASE + '/api/admin/player', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ username: user, gold: 400 }),
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);

  // 装备
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
  await sleep(1700);

  await page.screenshot({ path: path.join(OUT, 'n57-layout.png') });
  console.log('三栏布局');

  // 悬浮合成按钮
  await page.hover('#btnCraft');
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'n58-craft-tip.png') });
  console.log('合成悬浮提示');

  // 打开合成面板
  await page.evaluate(() => document.querySelector('#btnCraft')?.click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'n59-craft-panel.png') });
  console.log('合成面板');

  // 点知道了
  const hasSeen = await page.evaluate(() => !!document.querySelector('#btnCraftSeen'));
  if (hasSeen) {
    await page.evaluate(() => document.querySelector('#btnCraftSeen')?.click());
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'n60-craft-seen.png') });
    console.log('点知道了之后');
  } else {
    console.log('没有"知道了"按钮（可能没有可合成项）');
  }

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
