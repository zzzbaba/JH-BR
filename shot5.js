// 属性面板改造截图：全套装备 + 状态
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
function patchSave(user, fn) {
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
  await fetch(BASE + '/api/admin/round', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ action: 'start' }),
  });

  const user = 'panel' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);

  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  // 全套装备 + 弹药 + 状态道具
  patchSave(user, c => {
    c.attrs = { sta: 46, str: 52, cha: 38, int: 44, luk: 31 };
    c.equip = {
      weapon: { id: 'w32' },      // 85式狙击步枪
      head: { id: 'a05' },        // 军用钢盔
      body: { id: 'a10' },        // 重型防弹衣
      hands: { id: 'a14' },       // 战术手套
      legs: { id: 'a18' },        // 战术裤
      face: { id: 'a21' },        // 战术面罩
      feet: { id: 'a25' },        // 战术靴
      bag: { id: 'b05' },         // 战术背囊
    };
    c.bag = [
      { id: 'ammo_762r', n: 40 },
      { id: 'med16', n: 1 },
      { id: 'med03', n: 2 },
      { id: 'med20', n: 1 },
      { id: 'm_gunpowder', n: 5 },
    ];
    c.hp = 132; c.ep = 88;
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n18-panel-geared.png') });
  console.log('全套装备面板');

  // 醉酒状态对比
  await page.evaluate(async () => {
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') },
      body: JSON.stringify({ action: 'use', payload: { itemId: 'med16' } }),
    });
  });
  await sleep(900);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n19-panel-drunk.png') });
  console.log('醉酒状态面板');

  // 只截右栏，看清细节
  const box = await page.evaluate(() => {
    const el = document.querySelector('.col-char');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 720) };
  });
  await page.screenshot({ path: path.join(OUT, 'n20-panel-detail.png'), clip: box });
  console.log('右栏细节');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 5) : '无');
  await browser.close();
})();
