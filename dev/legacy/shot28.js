// 验证：丢弃比身上好的装备时弹二次确认
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';
const sp = u => path.join(__dirname, 'store', 'saves', crypto.createHash('md5').update(u).digest('hex').slice(0, 16) + '.json');

(async () => {
  const at = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'jianghan' }) }).then(r => r.json()).then(j => j.token);
  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + at } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at }, body: JSON.stringify({ action: 'start' }) });
    await sleep(300);
  }
  const user = 'dc' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '确认' }) });
  await sleep(250);

  const s = JSON.parse(fs.readFileSync(sp(user), 'utf8'));
  s.char.scene = 'map'; s.char.pending = null;
  s.char.bag = [
    { id: 'w07', n: 1 },   // 好武器（消防斧 22，比匕首 14 强）
    { id: 'm_scrap', n: 3 }, // 垃圾（不该弹确认）
  ];
  fs.writeFileSync(sp(user), JSON.stringify(s, null, 2));

  const browser = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);

  // 1) 丢垃圾：不该弹确认
  await page.evaluate(() => openBag());
  await sleep(600);
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="m_scrap"]'); if (c) c.click(); });
  await sleep(400);
  await page.evaluate(() => { const b = document.querySelector('[data-dropall]'); if (b) b.click(); });
  await sleep(900);
  const scrapGone = await page.evaluate(() => !S.char.bag.some(x => x.id === 'm_scrap'));
  const modalTitle1 = await page.evaluate(() => (document.querySelector('.m-title') || {}).textContent);
  console.log('丢废铁：直接丢掉了吗 =', scrapGone, '| 弹窗标题 =', modalTitle1);

  // 2) 丢好武器：应该弹确认
  await page.evaluate(() => openBag());
  await sleep(600);
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="w07"]'); if (c) c.click(); });
  await sleep(400);
  const pre = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-drop]')].map(b => ({ drop: b.dataset.drop, plus: b.dataset.dropplus, txt: b.textContent.trim() }));
    const detail = document.querySelector('.item-detail .t');
    return { btns: bs, title: detail ? detail.textContent.trim() : null, equip: S.char.equip.weapon, isUp: (function(){ try { return isUpgrade(META.items['w07'], 0); } catch(e) { return 'ERR '+e.message; } })() };
  });
  console.log('点丢之前的按钮:', JSON.stringify(pre));
  await page.evaluate(() => { const b = document.querySelector('[data-drop]'); if (b) b.click(); });
  await sleep(700);
  const confirmState = await page.evaluate(() => {
    const t = (document.querySelector('.m-title') || {}).textContent || '';
    const body = document.querySelector('.confirm-body');
    const btns = [...document.querySelectorAll('#mFoot .btn')].map(b => b.textContent.trim());
    const stillHas = S.char.bag.some(x => x.id === 'w07');
    return { title: t, body: body ? body.textContent.replace(/\s+/g, ' ').trim() : null, btns, stillHas };
  });
  console.log('丢消防斧：', JSON.stringify(confirmState));
  await page.screenshot({ path: path.join(OUT, 'r27-7-confirm.png'), clip: await page.evaluate(() => {
    const g = document.querySelector('.modal-box').getBoundingClientRect();
    return { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) };
  }) });

  // 3) 点取消 → 东西还在
  await page.evaluate(() => { const b = [...document.querySelectorAll('#mFoot .btn')].find(x => x.textContent.includes('取消')); if (b) b.click(); });
  await sleep(700);
  const afterCancel = await page.evaluate(() => S.char.bag.some(x => x.id === 'w07'));
  console.log('点取消后斧头还在:', afterCancel);

  // 4) 再丢一次，点确认 → 真的没了
  await page.evaluate(() => openBag());
  await sleep(600);
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="w07"]'); if (c) c.click(); });
  await sleep(400);
  await page.evaluate(() => { const b = document.querySelector('[data-drop]'); if (b) b.click(); });
  await sleep(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#mFoot .btn')].find(x => x.textContent.includes('还是丢掉')); if (b) b.click(); });
  await sleep(900);
  const afterOk = await page.evaluate(() => S.char.bag.some(x => x.id === 'w07'));
  console.log('点确认后斧头还在:', afterOk, '（应为 false）');

  console.log('页面错误:', errors.length ? errors.slice(0, 5) : '无');
  await browser.close();
})();
