// NPC / 改装 / 移动端 截图
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
  await fetch(BASE + '/api/admin/round', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ action: 'start' }),
  });

  const user = 'sc' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);

  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '旅人' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  // 移到老韩那里 + 塞装备
  await fetch(BASE + '/api/admin/player', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ username: user, pos: 'z03', gold: 800 }),
  });
  for (const [id, n] of [['w32', 1], ['buff_scope', 1], ['buff_silencer', 1], ['buff_grip', 1], ['med01', 2]]) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n }),
    });
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  async function open() {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(t => localStorage.setItem('br_token', t), tk);
    await page.evaluate(u => localStorage.setItem('br_user', u), user);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
  }
  await open();

  // 装枪 + 配件
  await page.evaluate(async () => {
    const call = (action, payload) => fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') },
      body: JSON.stringify({ action, payload }),
    }).then(r => r.json());
    await call('equip', { itemId: 'w32' });
    await call('mod', { action: 'install', itemId: 'buff_scope' });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, 'n29-wpn-dur.png') });
  console.log('武器耐久条');

  // 改装界面
  await page.evaluate(() => document.querySelector('#btnMod')?.click());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'n30-mod.png') });
  console.log('改装界面');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // NPC
  await page.evaluate(() => document.querySelector('#btnNpc')?.click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'n31-npc.png') });
  console.log('NPC 界面');

  // 聊两句
  await page.evaluate(() => document.querySelector('#npcTalk')?.click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'n32-npc-talk.png') });
  console.log('NPC 对话后');

  // 背包里的 CSV 按钮
  await page.evaluate(() => document.querySelector('#npcLeave')?.click());
  await sleep(600);
  await page.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'n33-bag-csv.png') });
  console.log('背包 CSV 按钮');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // ===== 移动端 =====
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('MOBILE: ' + e.message));
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.evaluate(t => localStorage.setItem('br_token', t), tk);
  await mp.evaluate(u => localStorage.setItem('br_user', u), user);
  await mp.reload({ waitUntil: 'networkidle' });
  await sleep(1800);
  await mp.screenshot({ path: path.join(OUT, 'n34-mobile-main.png') });
  console.log('移动端主界面');

  await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(600);
  await mp.screenshot({ path: path.join(OUT, 'n35-mobile-scroll.png') });
  console.log('移动端下滑');

  await mp.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(800);
  await mp.screenshot({ path: path.join(OUT, 'n36-mobile-bag.png') });
  console.log('移动端背包');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
