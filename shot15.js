// 全部物品图标总览
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

  const user = 'ico' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '看图标' }),
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);

  await page.evaluate(async () => {
    const r = await fetch('/api/meta', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } });
    const { meta } = await r.json();
    const order = ['weapon', 'armor', 'bag', 'med', 'material', 'ammo', 'throwable', 'buff', 'special'];
    const items = Object.values(meta.items).sort((a, b) => {
      const ia = order.indexOf(a.type), ib = order.indexOf(b.type);
      if (ia !== ib) return ia - ib;
      return a.id.localeCompare(b.id);
    });

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b0909;overflow:auto;padding:14px;' +
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px';
    items.forEach(it => {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:#141010;border:1px solid #352827;padding:5px 4px;text-align:center';
      const c = PX.itemCanvas(it.id, 40);
      c.style.margin = '0 auto 3px';
      c.style.imageRendering = 'pixelated';
      cell.appendChild(c);
      const n = document.createElement('div');
      n.textContent = it.name;
      n.style.cssText = 'font-size:10px;color:#e2ddd7;line-height:1.25;word-break:break-all';
      cell.appendChild(n);
      wrap.appendChild(cell);
    });
    document.body.appendChild(wrap);
  });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'n69-icons-all.png') });
  console.log('全物品图标总览');

  // 只截武器区
  await page.evaluate(() => {
    const w = document.querySelector('div[style*="position:fixed"]');
    if (w) w.scrollTop = 0;
  });
  await sleep(300);

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
