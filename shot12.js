// 天气 / 人质表情 / BOSS 截图
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

  const user = 'wx' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  for (const id of ['w31', 'a05', 'a09']) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n: 1 }),
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

  async function open() {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(t => localStorage.setItem('br_token', t), tk);
    await page.evaluate(u => localStorage.setItem('br_user', u), user);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1600);
  }
  await open();

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
  await sleep(1700);
  await page.screenshot({ path: path.join(OUT, 'n61-weather.png') });
  console.log('主界面（天气标签）');

  // 人质问话
  patch(user, c => {
    c.scene = 'hostage';
    c.pending = {
      hostage: { name: '林知夏', taken: false },
      drops: [], enemyName: '拾荒者', chain: false, wave: 1, zoneName: '后巷',
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n62-hostage-ask.png') });
  console.log('人质问话（可怜巴巴）');

  // 同意
  patch(user, c => {
    c.scene = 'hostage_result';
    c.pending = {
      hostage: { name: '林知夏', taken: true, done: true }, taken: true, asked: true,
      drops: [], enemyName: '拾荒者', chain: false, wave: 1, zoneName: '后巷',
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1900);
  await page.screenshot({ path: path.join(OUT, 'n63-hostage-yes.png') });
  console.log('人质同意（亮晶晶）');

  // 拒绝
  patch(user, c => {
    c.scene = 'hostage_result';
    c.pending = {
      hostage: { name: '林知夏', taken: false, done: true }, taken: false, asked: true,
      drops: [], enemyName: '拾荒者', chain: false, wave: 1, zoneName: '后巷',
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1900);
  await page.screenshot({ path: path.join(OUT, 'n64-hostage-no.png') });
  console.log('人质拒绝（低头）');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
