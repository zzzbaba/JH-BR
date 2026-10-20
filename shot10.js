// 批量使用滑块截图
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

  const user = 'qty' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  for (const [id, n] of [['med01', 6], ['med08', 4]]) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
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

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);

  await page.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(700);

  // 点第一个绷带
  await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.bag-cell[data-id]')];
    const c = cells.find(x => x.textContent.includes('绷带'));
    if (c) c.click();
  });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'n54-qty-1.png') });
  console.log('滑块默认 1');

  // 拖到 3
  await page.evaluate(() => {
    const el = document.querySelector('#useQty');
    if (el) {
      el.value = 3;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'n55-qty-3.png') });
  console.log('滑块拖到 3');

  // 实际使用
  await page.evaluate(() => document.querySelector('[data-usen]')?.click());
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'n56-qty-after.png') });
  console.log('使用后');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
