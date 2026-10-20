// 第 17 轮验证：丢弃滑块 / 点遮罩关窗 / 称号分类 / 七娃框高 / 胜利结算
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

  const user = 'r17' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  });
  await fetch(BASE + '/api/admin/bag', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
    body: JSON.stringify({ username: user, action: 'add', itemId: 'med01', n: 5 }),
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);

  // ---- 1. 背包：丢弃滑块 ----
  await page.click('#btnBag');
  await sleep(500);
  await page.click('.bag-cell[data-id="med01"]');
  await sleep(300);
  const hasDropQty = await page.$('#dropQty');
  console.log('丢弃滑块存在:', !!hasDropQty);
  if (hasDropQty) {
    await page.$eval('#dropQty', el => { el.value = 3; el.dispatchEvent(new Event('input')); });
    await sleep(200);
    const btnTxt = await page.$eval('[data-dropn]', el => el.textContent);
    console.log('按钮文案:', btnTxt);
  }
  await page.screenshot({ path: path.join(OUT, 'r17-1-drop-qty.png') });

  // ---- 2. 点遮罩关窗 ----
  await page.mouse.click(30, 450);
  await sleep(300);
  const closed = await page.$eval('#modal', el => el.classList.contains('hidden'));
  console.log('点遮罩后关闭:', closed);

  // ---- 3. 称号分类 ----
  await page.click('#btnAch');
  await sleep(600);
  const cats = await page.$$eval('.ach-cat span', els => els.map(e => e.textContent));
  const achCount = await page.$$eval('.ach-item', els => els.length);
  console.log('称号分类:', cats.join('/'), '· 条目', achCount);
  await page.screenshot({ path: path.join(OUT, 'r17-2-ach-cats.png') });
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(30, 450);
  await sleep(300);

  // ---- 4. 七娃弹窗：立绘框高度 ----
  await page.route('**/api/state', async route => {
    const resp = await route.fetch();
    const j = await resp.json();
    if (j.state) { j.state.scene = 'sevenwa'; j.state.pending = {}; }
    await route.fulfill({ response: resp, json: j });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const artBox = await page.$eval('.enc-art', el => {
    const r = el.getBoundingClientRect();
    const img = el.querySelector('img');
    return { boxH: Math.round(r.height), imgH: img ? Math.round(img.getBoundingClientRect().height) : 0 };
  });
  console.log('七娃立绘框:', JSON.stringify(artBox), artBox.boxH - artBox.imgH <= 30 ? '✓ 贴合' : '✗ 仍有空白');
  await page.screenshot({ path: path.join(OUT, 'r17-3-sevenwa-box.png') });

  // ---- 5. 胜利画面 + 结算跳等待区 ----
  await page.unroute('**/api/state');
  await page.route('**/api/state', async route => {
    const resp = await route.fetch();
    const j = await resp.json();
    if (j.state) { j.state.scene = 'sevenwin'; j.state.pending = { total: 3, name: '七娃' }; }
    await route.fulfill({ response: resp, json: j });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const winTitle = await page.$eval('.win-title', el => el.textContent.trim());
  console.log('胜利标题:', winTitle);
  await page.screenshot({ path: path.join(OUT, 'r17-4-sevenwin.png') });

  await page.unroute('**/api/state');
  await page.click('.m-foot .btn');
  await sleep(1800);
  const afterSettle = await page.evaluate(() => ({
    waitVisible: !document.querySelector('#waitScreen').classList.contains('hidden'),
    gameHidden: document.querySelector('#gameScreen').classList.contains('hidden'),
    title: (document.querySelector('#waitTitle') || {}).textContent,
  }));
  console.log('结算后:', JSON.stringify(afterSettle));

  // 接口层确认：settled 的角色不再返回给前端
  const st = await fetch(BASE + '/api/state', { headers: { Authorization: 'Bearer ' + tk } }).then(r => r.json());
  console.log('settle 后 /api/state:', JSON.stringify({ hasSave: st.hasSave, settled: st.settled, state: st.state }));

  // 真实「本轮结束」的等待区（管理员结束本轮）
  await fetch(BASE + '/api/admin/round', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
    body: JSON.stringify({ action: 'end' }),
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const endedTitle = await page.$eval('#waitTitle', el => el.textContent);
  console.log('本轮结束后等待区标题:', endedTitle);
  await page.screenshot({ path: path.join(OUT, 'r17-5-after-settle.png') });

  if (errors.length) console.log('页面错误:', errors.slice(0, 5));
  else console.log('无页面错误');
  await browser.close();
})();
