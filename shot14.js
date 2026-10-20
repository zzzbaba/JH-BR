// 七娃 / 刘颖 特殊立绘截图
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

  const user = 'sp2' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

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

  // 七娃
  patch(user, c => { c.scene = 'sevenwa'; c.pending = { zoneName: '十号地' }; });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n67-sevenwa.png') });
  console.log('七娃');

  // 刘颖
  patch(user, c => {
    c.scene = 'liuying';
    c.pending = {
      stage: 'pill', color: null, correct: false, zoneName: '十号地',
      question: { q: '抽油机在油田上俗称什么？', a: '磕头机', opts: ['磕头机', '摇臂机', '抽水机'], correct: 0 },
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, 'n68-liuying.png') });
  console.log('刘颖（整幅立绘）');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
