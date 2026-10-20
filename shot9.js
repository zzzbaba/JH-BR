// 遭遇 / 战斗 / 人质 立绘截图（直接注入场景）
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

const ENEMY = {
  id: 'e05', name: '落单的学生', kind: 'human', tier: 2,
  hp: 42, maxHp: 42, atk: 9, def: 2, dodge: 12, flee: 70, w: 2,
  desc: '校服上全是泥，握着一根拖把杆，手一直在抖。',
};

(async () => {
  const at = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'jianghan' }),
  }).then(r => r.json()).then(j => j.token);
  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + at } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({ action: 'start' }),
    });
  }

  const user = 'sc2' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  // 装备
  for (const id of ['w31', 'a05', 'a09']) {
    await fetch(BASE + '/api/admin/bag', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
      body: JSON.stringify({ username: user, action: 'add', itemId: id, n: 1 }),
    });
  }
  await fetch(BASE + '/api/admin/player', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ username: user, gold: 300 }),
  });

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
    await sleep(1500);
  }
  await open();

  // 先装备（走 API）
  await page.evaluate(async () => {
    const call = (action, payload) => fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('br_token') },
      body: JSON.stringify({ action, payload }),
    }).then(r => r.json());
    await call('equip', { itemId: 'w31' });
    await call('equip', { itemId: 'a05' });
    await call('equip', { itemId: 'a09' });
  });

  // 1. 普通遭遇
  patch(user, c => {
    c.scene = 'encounter';
    c.pending = { enemy: JSON.parse(JSON.stringify(ENEMY)), source: 'move', zoneName: '后巷', noise: 0, wave: 1 };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n47-encounter.png') });
  console.log('遭遇');

  // 2. 战斗
  patch(user, c => {
    c.scene = 'battle';
    c.pending = {
      enemy: Object.assign(JSON.parse(JSON.stringify(ENEMY)), { hp: 26 }),
      round: 3,
      log: ['你迎了上去。', '你用85式狙击步枪开火。造成 41 点伤害。', '落单的学生击中你，损失 7 点生命。'],
      noise: 6, wave: 1, hostage: null, npc: null, boss: false,
      stun: 0, enemyStun: 0, smoke: 0, guaranteed: false,
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n48-battle.png') });
  console.log('战斗');

  // 3. 人质
  patch(user, c => {
    c.scene = 'hostage';
    c.pending = {
      hostage: { name: '周敏', taken: false },
      drops: [], enemyName: '拾荒者', chain: false, wave: 1, zoneName: '后巷',
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n49-hostage.png') });
  console.log('人质');

  // 4. 七娃
  patch(user, c => {
    c.scene = 'sevenwa';
    c.pending = { zoneName: '十号地' };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n50-sevenwa.png') });
  console.log('七娃');

  // 5. 刘颖
  patch(user, c => {
    c.scene = 'liuying';
    c.pending = {
      stage: 'pill', color: null, correct: false, zoneName: '十号地',
      question: { q: '抽油机在油田上俗称什么？', a: '磕头机', opts: ['磕头机', '摇臂机', '抽水机'], correct: 0 },
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'n51-liuying.png') });
  console.log('刘颖');

  // 6. 主界面（干净状态）
  patch(user, c => { c.scene = 'map'; c.pending = null; c.pos = 'z33'; });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, 'n52-main.png') });
  console.log('主界面');

  // 7. 登录页
  const p2 = await ctx.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.evaluate(() => localStorage.clear());
  await p2.reload({ waitUntil: 'networkidle' });
  await sleep(600);
  await p2.screenshot({ path: path.join(OUT, 'n53-login.png') });
  console.log('登录页');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
