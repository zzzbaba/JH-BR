// 图标 + 布局 + 表情 + 标签 综合截图
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';

function saveFile(user) {
  const safe = crypto.createHash('md5').update(user).digest('hex').slice(0, 16);
  return path.join(__dirname, 'store', 'saves', safe + '.json');
}
function patch(user, fn) {
  const f = saveFile(user);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(s.char);
  fs.writeFileSync(f, JSON.stringify(s, null, 2), 'utf8');
}

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

  const user = 'v3' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  const items = [
    ['w31', 1], ['a05', 1], ['a09', 1], ['m_alcohol', 2], ['m_plank', 2],
    ['m_nail', 4], ['med03', 2], ['t01', 3], ['ammo_762r', 20], ['buff_scope', 1],
  ];
  for (const [id, n] of items) {
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

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1700);

  // 装备
  await page.evaluate(async () => {
    const call = (action, payload) => fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('br_token') },
      body: JSON.stringify({ action, payload }),
    }).then(r => r.json());
    await call('equip', { itemId: 'w31' });
    await call('equip', { itemId: 'a05' });
    await call('equip', { itemId: 'a09' });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1800);
  await page.screenshot({ path: path.join(OUT, 'n70-main-full.png') });
  console.log('主界面（满血=开心）');

  // 半血
  patch(user, c => { c.hp = Math.round(c.hpMax * 0.5); c.ep = Math.round(c.epMax * 0.5); });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1700);
  await page.screenshot({ path: path.join(OUT, 'n71-mood-mid.png') });
  console.log('半血=担心');

  // 濒死
  patch(user, c => { c.hp = Math.round(c.hpMax * 0.15); c.ep = Math.round(c.epMax * 0.2); });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1700);
  await page.screenshot({ path: path.join(OUT, 'n72-mood-bad.png') });
  console.log('濒死=难过');

  // 恢复满血，看背包
  patch(user, c => { c.hp = c.hpMax; c.ep = c.epMax; });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);
  await page.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'n73-bag-icons.png') });
  console.log('背包图标');

  // 合成面板
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('#btnCraft')?.click());
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'n74-craft-disabled.png') });
  console.log('合成面板（材料不足按钮禁用）');

  // 全图标总览
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);
  await page.evaluate(async () => {
    const r = await fetch('/api/meta', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } });
    const { meta } = await r.json();
    const order = ['weapon', 'armor', 'bag', 'med', 'material', 'ammo', 'throwable', 'buff', 'special'];
    const its = Object.values(meta.items).sort((a, b) => {
      const ia = order.indexOf(a.type), ib = order.indexOf(b.type);
      return ia !== ib ? ia - ib : a.id.localeCompare(b.id);
    });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b0909;overflow:auto;padding:14px;' +
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px';
    its.forEach(it => {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:#141010;border:1px solid #352827;padding:5px 4px;text-align:center';
      const c = PX.itemCanvas(it.id, 44);
      c.style.cssText = 'margin:0 auto 3px;image-rendering:pixelated';
      cell.appendChild(c);
      const n = document.createElement('div');
      n.textContent = it.name;
      n.style.cssText = 'font-size:11px;color:#e2ddd7;line-height:1.25;word-break:break-all';
      cell.appendChild(n);
      wrap.appendChild(cell);
    });
    document.body.appendChild(wrap);
  });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'n75-icons-24.png') });
  console.log('全图标 24×24');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
