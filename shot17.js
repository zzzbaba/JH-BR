// 多分辨率布局验证
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

  const user = 'v4' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  for (const [id, n] of [['w31', 1], ['a05', 1], ['a09', 1], ['med03', 2], ['ammo_762r', 20]]) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n }),
    });
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const sizes = [
    { w: 1080, h: 640, name: 'n76-1080' },
    { w: 1280, h: 720, name: 'n77-1280' },
    { w: 1600, h: 900, name: 'n78-1600' },
  ];

  for (const s of sizes) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(t => localStorage.setItem('br_token', t), tk);
    await page.evaluate(u => localStorage.setItem('br_user', u), user);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1500);

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
    await sleep(1600);

    // 检查关键元素是否在视口内
    const info = await page.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
      const map = document.querySelector('#map');
      const zone = document.querySelector('.zone-bar');
      const eq = document.querySelector('#equipFoot');
      const attrs = document.querySelectorAll('.attr-row');
      const firstAttr = attrs[0];
      const attrH = firstAttr ? Math.round(firstAttr.getBoundingClientRect().height) : 0;
      return {
        vh: innerHeight,
        map: r(map), zone: r(zone), equipFoot: r(eq),
        attrRowH: attrH,
        scrollH: document.querySelector('.col-left').scrollHeight,
        clientH: document.querySelector('.col-left').clientHeight,
      };
    });
    console.log(`\n${s.w}x${s.h}:`, JSON.stringify(info));

    await page.screenshot({ path: path.join(OUT, s.name + '.png') });
    if (errors.length) console.log('  错误:', errors.slice(0, 3));
    await ctx.close();
  }

  await browser.close();
})();
