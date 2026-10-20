// 第 26 轮验证：强化 / 勾选丢弃 / 对敌道具 / 火器射击模式 / 配件生效说明
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
  const user = 'v' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '验证' }) });
  await sleep(250);

  const s = JSON.parse(fs.readFileSync(sp(user), 'utf8'));
  s.char.scene = 'map';
  s.char.pending = null;
  s.char.bag = [
    { id: 'w05', n: 1 }, { id: 'w05', n: 1 }, { id: 'w05', n: 1, plus: 2 },
    { id: 'w20', n: 1 },                       // 一把步枪，看射击模式
    { id: 'a01', n: 1 }, { id: 'a01', n: 1 },
    { id: 'h01', n: 2 }, { id: 'h05', n: 2 }, { id: 'h02', n: 1 },
    { id: 'buff_silencer', n: 1 }, { id: 'buff_charm', n: 1 },
    { id: 'med01', n: 5 }, { id: 'med03', n: 2 },
    { id: 'm_scrap', n: 8 },
  ];
  s.char.attrs.int = 60;
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

  const clipBox = () => page.evaluate(() => {
    const g = document.querySelector('.modal-box').getBoundingClientRect();
    return { x: Math.max(0, Math.round(g.x)), y: Math.max(0, Math.round(g.y)), width: Math.round(g.width), height: Math.round(g.height) };
  });

  // 1. 背包：+N 标记
  await page.evaluate(() => openBag());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'r27-1-bag-plus.png'), clip: await clipBox() });
  const plusTags = await page.evaluate(() => [...document.querySelectorAll('.bag-cell .plus-tag')].map(e => e.textContent));
  console.log('背包里的强化标记:', JSON.stringify(plusTags));

  // 2. 点开 +2 的匕首 → 强化行
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="w05"][data-plus="2"]'); if (c) c.click(); });
  await sleep(500);
  const enh = await page.evaluate(() => {
    const b = document.querySelector('[data-enh]');
    return b ? { text: b.textContent.trim(), disabled: b.disabled, plus: b.dataset.enhplus } : null;
  });
  console.log('+2 匕首的强化按钮:', JSON.stringify(enh));
  await page.screenshot({ path: path.join(OUT, 'r27-2-enhance.png'), clip: await clipBox() });

  // 3. 点开 +0 匕首 → 应该有可用的强化（背包里还有 2 把 +0）
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="w05"][data-plus="0"]'); if (c) c.click(); });
  await sleep(500);
  const enh0 = await page.evaluate(() => {
    const b = document.querySelector('[data-enh]');
    return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
  });
  console.log('+0 匕首的强化按钮:', JSON.stringify(enh0));

  // 4. 勾选模式
  await page.evaluate(() => { const b = document.querySelector('#btnPickBag'); if (b) b.click(); });
  await sleep(600);
  await page.evaluate(() => {
    ['w05|0', 'h02|0', 'm_scrap|0'].forEach(k => {
      const c = document.querySelector(`.bag-cell[data-key="${k}"]`);
      if (c) c.click();
    });
  });
  await sleep(400);
  const pick = await page.evaluate(() => ({
    bar: !!document.querySelector('.bag-pickbar'),
    picked: document.querySelectorAll('.bag-cell.picked').length,
    count: (document.querySelector('.bag-pickbar b') || {}).textContent,
  }));
  console.log('勾选模式:', JSON.stringify(pick));
  await page.screenshot({ path: path.join(OUT, 'r27-3-pick.png'), clip: await clipBox() });

  // 5. 对敌道具
  await page.evaluate(() => { const b = document.querySelector('#btnPickExit'); if (b) b.click(); });
  await sleep(400);
  await page.evaluate(() => { const b = document.querySelector('[data-bagcat="hostile"]'); if (b) b.click(); });
  await sleep(500);
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="h01"]'); if (c) c.click(); });
  await sleep(500);
  const hostile = await page.evaluate(() => {
    const use = document.querySelector('[data-use2]');
    const trap = document.querySelector('[data-trap]');
    return {
      use: use ? { text: use.textContent.trim(), disabled: use.disabled } : null,
      trap: trap ? { text: trap.textContent.trim(), disabled: trap.disabled } : null,
    };
  });
  console.log('地图上点开液氮罐:', JSON.stringify(hostile));
  await page.screenshot({ path: path.join(OUT, 'r27-4-hostile.png'), clip: await clipBox() });

  // 6. 火器详情：射击模式
  await page.evaluate(() => { const b = document.querySelector('[data-bagcat="all"]'); if (b) b.click(); });
  await sleep(400);
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="w20"]'); if (c) c.click(); });
  await sleep(500);
  const gun = await page.evaluate(() => {
    const el = document.querySelector('.item-detail');
    return el ? el.textContent.replace(/\s+/g, ' ').slice(0, 260) : null;
  });
  console.log('\n步枪详情:', gun);
  await page.screenshot({ path: path.join(OUT, 'r27-5-gun.png'), clip: await clipBox() });

  // 7. 配件：消音器详情要说清「必须装上」
  await page.evaluate(() => { const c = document.querySelector('.bag-cell[data-id="buff_silencer"]'); if (c) c.click(); });
  await sleep(500);
  const mod = await page.evaluate(() => {
    const el = document.querySelector('.item-detail');
    return el ? el.textContent.replace(/\s+/g, ' ').slice(0, 220) : null;
  });
  console.log('\n消音器详情:', mod);
  await page.screenshot({ path: path.join(OUT, 'r27-6-mod.png'), clip: await clipBox() });

  console.log('\n页面错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
