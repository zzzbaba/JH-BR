// 第 20 轮验证：战斗中使用道具支持一次吃多个
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';

(async () => {
  const at = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'jianghan' }) }).then(r => r.json()).then(j => j.token);
  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + at } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at }, body: JSON.stringify({ action: 'start' }) });
  }
  const user = 'r20' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '多吃' }) });
  for (const [id, n] of [['med01', 4], ['med08', 3]]) {
    await fetch(BASE + '/api/admin/bag', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at }, body: JSON.stringify({ username: user, action: 'add', itemId: id, n }) });
  }
  await fetch(BASE + '/api/admin/player', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at }, body: JSON.stringify({ username: user, hp: 25, ep: 40 }) });

  const browser = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);

  // 撞出一次真实遭遇并开打
  const got = await page.evaluate(async () => {
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') };
    const call = (action, payload) => fetch('/api/action', { method: 'POST', headers: H, body: JSON.stringify({ action, payload }) }).then(r => r.json());
    const st = () => fetch('/api/state', { headers: H }).then(r => r.json());
    for (let i = 0; i < 60; i++) {
      const j = await st(); const sc = j.state && j.state.scene;
      if (sc === 'encounter') { await call('encounter', { choice: 'fight' }); const k = await st(); if (k.state.scene === 'battle') return 'battle'; continue; }
      if (sc === 'battle') return 'battle';
      if (sc === 'loot' || sc === 'box') { await call('close'); continue; }
      if (sc === 'hostage') { await call('hostage', { choice: 'leave' }); continue; }
      if (sc === 'hostage_result') { await call('hostage_done'); continue; }
      if (sc === 'sevenwa') { await call('sevenwa', { choice: 'ignore' }); continue; }
      if (sc === 'liuying') { await call('liuying', { choice: 'red', answer: 0 }); continue; }
      if (sc === 'map') { await call('explore'); continue; }
      return sc || 'none';
    }
    return 'timeout';
  });
  console.log('进入战斗:', got);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1400);

  const before = await page.evaluate(async () => {
    const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
    const c = j.state.char;
    return { hp: c.hp, n: c.bag.filter(i => i.id === 'med01').reduce((s, i) => s + i.n, 0) };
  });

  // 打开道具面板
  const btn = await page.$('.m-foot .btn:nth-child(2)');   // 攻击/使用道具/换武器/防御/逃跑
  const labels = await page.$$eval('.m-foot .btn', els => els.map(e => e.textContent));
  console.log('战斗按钮:', labels.join('/'));
  const itemBtn = (await page.$$('.m-foot .btn')).find(async () => true);
  await page.click('text=使用道具');
  await sleep(600);

  const selCount = await page.$$eval('.qty-sel', els => els.length);
  const rowCount = await page.$$eval('.recipe', els => els.length);
  const names = await page.$$eval('.rname', els => els.map(e => e.textContent.trim()));
  console.log('道具行:', names.join(' | '), '| 下拉框:', selCount);
  await page.screenshot({ path: path.join(OUT, 'r20-1-picker.png') });

  // 选 3 个绷带
  await page.selectOption('[data-sel="med01"]', '3');
  await sleep(200);
  const btnTxt = await page.$eval('[data-use="med01"]', el => el.textContent);
  console.log('按钮文案:', btnTxt);
  await page.screenshot({ path: path.join(OUT, 'r20-2-picker-3.png') });
  await page.click('[data-use="med01"]');
  await sleep(1300);

  const after = await page.evaluate(async () => {
    const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
    const c = j.state.char;
    return { hp: c.hp, n: c.bag.filter(i => i.id === 'med01').reduce((s, i) => s + i.n, 0), scene: j.state.scene };
  });
  console.log('使用前:', JSON.stringify(before), '使用后:', JSON.stringify(after));
  console.log('消耗 3 个:', before.n - after.n === 3 ? '✓' : '✗ 实际 ' + (before.n - after.n));
  console.log('回血:', after.hp - before.hp, after.hp > before.hp ? '✓' : '✗');
  await page.screenshot({ path: path.join(OUT, 'r20-3-after.png') });
  console.log('页面错误:', errors.length ? errors.slice(0, 3) : '无');
  await browser.close();
})();
