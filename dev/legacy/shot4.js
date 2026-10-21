// 状态 / 七娃 / 刘颖 界面截图（直接改存档注入场景）
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
  // 保证有一轮在跑
  const adminR = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'jianghan' }),
  });
  const at = (await adminR.json()).token;
  const stR = await fetch(BASE + '/api/state', {
    headers: { Authorization: 'Bearer ' + at },
  }).then(r => r.json()).catch(() => ({}));
  await fetch(BASE + '/api/admin/round', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ action: 'start' }),
  });

  const user = 'sp' + Date.now().toString().slice(-6);
  const reg = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  });
  const tk = (await reg.json()).token;
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败:', ng.msg); process.exit(1); }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  async function open() {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(t => localStorage.setItem('br_token', t), tk);
    await page.evaluate(u => localStorage.setItem('br_user', u), user);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1200);
  }

  // 1. 状态：给背包塞道具并使用
  patchSave(user, c => {
    c.bag.push({ id: 'med16', n: 2 });
    c.bag.push({ id: 'med17', n: 1 });
    c.bag.push({ id: 'med18', n: 1 });
    c.bag.push({ id: 'med19', n: 1 });
    c.bag.push({ id: 'med20', n: 1 });
  });
  await open();
  await page.evaluate(async () => {
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') },
      body: JSON.stringify({ action: 'use', payload: { itemId: 'med16' } }),
    });
  });
  await sleep(800);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'n12-status-drunk.png') });
  console.log('醉酒状态');

  // 2. 刘颖 - 选药丸
  patchSave(user, c => {
    c.scene = 'liuying';
    c.pending = {
      stage: 'pill', color: null, correct: false, zoneName: '十号地',
      question: { q: '抽油机在油田上俗称什么？', a: '磕头机', opts: ['磕头机', '摇臂机', '抽水机'], correct: 0 },
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1300);
  await page.screenshot({ path: path.join(OUT, 'n13-liuying-pill.png') });
  console.log('刘颖 - 药丸');

  // 3. 刘颖 - 答题
  await page.evaluate(() => {
    const b = document.querySelector('[data-pill="red"]');
    if (b) b.click();
  });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'n14-liuying-quiz.png') });
  console.log('刘颖 - 答题');

  // 4. 刘颖 - 结果
  await page.evaluate(() => {
    const b = document.querySelector('[data-ans="0"]');
    if (b) b.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'n15-liuying-result.png') });
  console.log('刘颖 - 结果');

  // 5. 七娃
  patchSave(user, c => {
    c.scene = 'sevenwa';
    c.pending = { zoneName: '十号地' };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1300);
  await page.screenshot({ path: path.join(OUT, 'n16-sevenwa.png') });
  console.log('七娃');

  // 6. 七娃胜利
  patchSave(user, c => {
    c.scene = 'sevenwin';
    c.pending = { total: 3, name: '七娃' };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1300);
  await page.screenshot({ path: path.join(OUT, 'n17-sevenwin.png') });
  console.log('七娃胜利');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 5) : '无');
  await browser.close();
})();
