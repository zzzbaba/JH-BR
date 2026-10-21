// 第 25 轮验证：合成台背包满时按钮变「背包满」，且不吞材料
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
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
  const user = 'cs' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '合成台' }) });
  await sleep(250);

  const s = JSON.parse(fs.readFileSync(sp(user), 'utf8'));
  s.char.scene = 'map';
  s.char.pending = null;
  s.char.attrs.int = 100;
  s.char.bag = [{ id: 'm_cloth', n: 10 }, { id: 'm_nail', n: 10 }];
  fs.writeFileSync(sp(user), JSON.stringify(s, null, 2));

  const browser = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('C:' + m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);

  const rowOf = () => page.evaluate(() => {
    const b = document.querySelector('[data-craft="r65"]');
    if (!b) return null;
    const row = b.closest('.recipe');
    return {
      btn: b.textContent.trim(), disabled: b.disabled,
      mat: row.querySelector('.rmat').textContent.replace(/\s+/g, ' ').trim(),
    };
  });

  // 1) 背包有空
  await page.evaluate(() => { craftCat = '防具'; openCraft(); });
  await sleep(700);
  console.log('背包有空:', JSON.stringify(await rowOf()));
  const b1 = await page.evaluate(() => {
    const g = document.querySelector('.modal-box').getBoundingClientRect();
    return { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) };
  });
  await page.screenshot({ path: path.join(OUT, 'r26-1-ok.png'), clip: b1 });

  // 2) 塞满
  const filled = await page.evaluate(() => {
    const cap = S.char.slots;
    let used = S.char.bag.reduce((s, it) => s + ((META.items[it.id] || {}).size || 1), 0);
    let g = 0;
    while (used < cap && g++ < 2000) { S.char.bag.push({ id: 'm_scrap', n: 1 }); used++; }
    craftCat = '防具';
    openCraft();
    return { cap, used };
  });
  await sleep(700);
  console.log('背包满:', JSON.stringify(filled), JSON.stringify(await rowOf()));
  const b2 = await page.evaluate(() => {
    const g = document.querySelector('.modal-box').getBoundingClientRect();
    return { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) };
  });
  await page.screenshot({ path: path.join(OUT, 'r26-2-full.png'), clip: b2 });

  // 3) 硬点一下，确认没吞材料
  const before = await page.evaluate(() => S.char.bag.filter(x => x.id === 'm_cloth').reduce((s, x) => s + x.n, 0));
  await page.evaluate(() => { const b = document.querySelector('[data-craft="r65"]'); if (b) b.click(); });
  await sleep(600);
  const after = await page.evaluate(() => ({
    jeans: S.char.bag.filter(x => x.id === 'a15').reduce((s, x) => s + x.n, 0),
    cloth: S.char.bag.filter(x => x.id === 'm_cloth').reduce((s, x) => s + x.n, 0),
    tail: S.log.slice(-1)[0] && S.log.slice(-1)[0].text,
  }));
  console.log(`\n点完之后：牛仔裤 ${after.jeans}，布条 ${before} → ${after.cloth}`);
  console.log('日志尾:', after.tail);
  console.log('页面错误:', errors.length ? errors.slice(0, 5) : '无');
  await browser.close();
})();
