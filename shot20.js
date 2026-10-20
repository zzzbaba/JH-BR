// 第 18 轮验证：键盘操作（方向键选择 / 空格确认 / Esc 关闭）
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

  const user = 'kb' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '键盘' }),
  });
  for (const [id, n] of [['med01', 5], ['a13', 1], ['w07', 1]]) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
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

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);

  const focusText = () => page.evaluate(() => {
    const el = document.querySelector('.kbd-focus');
    if (!el) return null;
    return el.dataset.id || el.textContent.trim().slice(0, 10);
  });

  // ---- 1. 背包：方向键 ----
  await page.click('#btnBag');
  await sleep(500);
  await page.keyboard.press('ArrowDown');
  await sleep(150);
  const f1 = await focusText();
  await page.keyboard.press('ArrowDown');
  await sleep(150);
  const f2 = await focusText();
  await page.keyboard.press('ArrowRight');
  await sleep(150);
  const f3 = await focusText();
  console.log('背包焦点:', f1, '→', f2, '→', f3);
  await page.screenshot({ path: path.join(OUT, 'r18-1-bag-focus.png') });

  // ---- 2. 空格打开详情 ----
  await page.keyboard.press('Space');
  await sleep(400);
  console.log('空格打开详情:', await page.$eval('#itemDetail', el => el.innerText.length > 10).catch(() => false));

  // ---- 3. Esc 关闭 ----
  await page.keyboard.press('Escape');
  await sleep(300);
  console.log('Esc 关闭浮层:', await page.$eval('#modal', el => el.classList.contains('hidden')));

  // ---- 4. 用真实行动撞一次遭遇 ----
  const got = await page.evaluate(async () => {
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') };
    const call = (action, payload) => fetch('/api/action', { method: 'POST', headers: H, body: JSON.stringify({ action, payload }) }).then(r => r.json());
    const st = () => fetch('/api/state', { headers: H }).then(r => r.json());
    for (let i = 0; i < 60; i++) {
      const j = await st();
      const sc = j.state && j.state.scene;
      if (sc === 'encounter') return 'encounter';
      if (sc === 'battle') { await call('battle', { choice: 'flee' }); continue; }
      if (sc === 'loot' || sc === 'box') { await call('close'); continue; }
      if (sc === 'hostage') { await call('hostage', { choice: 'leave' }); continue; }
      if (sc === 'hostage_result') { await call('hostage_done'); continue; }
      if (sc === 'sevenwa') { await call('sevenwa', { choice: 'ignore' }); continue; }
      if (sc === 'map') { await call('explore'); continue; }
      return sc || 'none';
    }
    return 'timeout';
  });
  console.log('撞遭遇:', got);

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1400);
  await page.keyboard.press('ArrowDown');
  await sleep(250);
  console.log('遭遇默认焦点:', await focusText());
  await page.screenshot({ path: path.join(OUT, 'r18-2-encounter-focus.png') });

  // ---- 5. 空格 = 战斗 ----
  await page.keyboard.press('Space');
  await sleep(1300);
  const sc2 = await page.evaluate(async () => {
    const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
    return j.state && j.state.scene;
  });
  console.log('空格后场景:', sc2, (sc2 === 'battle' || sc2 === 'loot') ? '✓ 打了' : '✗');

  // ---- 6. 战斗里方向键 + 空格 ----
  if (sc2 === 'battle') {
    await page.keyboard.press('ArrowDown');
    await sleep(200);
    const b1 = await focusText();
    await page.keyboard.press('ArrowRight');
    await sleep(200);
    const b2 = await focusText();
    console.log('战斗焦点:', b1, '→', b2);
    await page.screenshot({ path: path.join(OUT, 'r18-3-battle-focus.png') });
  }

  if (errors.length) console.log('页面错误:', errors.slice(0, 4));
  else console.log('无页面错误');
  await browser.close();
})();
