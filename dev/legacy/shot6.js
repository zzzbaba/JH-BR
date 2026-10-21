// 悬浮提示 + 后台新页面截图
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

(async () => {
  const at = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'jianghan' }),
  }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/admin/round', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at },
    body: JSON.stringify({ action: 'start' }),
  });

  const user = 'tip' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);

  const ng = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  }).then(r => r.json());
  if (!ng.ok) { console.log('开局失败', ng.msg); process.exit(1); }

  // 塞装备：当前戴低级的，背包里放高级的用于对比
  const f = saveFile(user);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.char.equip.weapon = { id: 'w05' };      // 匕首
  s.char.equip.head = { id: 'a01' };        // 安全帽
  s.char.equip.body = { id: 'a06' };        // 皮夹克
  s.char.bag = [
    { id: 'w32', n: 1 },                    // 85式狙击步枪
    { id: 'w22', n: 1 },                    // 泵动霰弹枪
    { id: 'a05', n: 1 },                    // 军用钢盔
    { id: 'a10', n: 1 },                    // 重型防弹衣
    { id: 'med16', n: 2 },                  // 二锅头
    { id: 'med03', n: 2 },                  // 急救包
    { id: 'm_gunpowder', n: 5 },            // 火药
    { id: 'ammo_762r', n: 40 },             // 步枪弹
  ];
  fs.writeFileSync(f, JSON.stringify(s, null, 2), 'utf8');

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

  // 背包悬浮：武器对比
  await page.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(700);
  const cells = await page.$$('.bag-cell[data-idx]');
  if (cells[0]) {
    await cells[0].hover();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'n21-tip-weapon.png') });
    console.log('武器悬浮对比');
  }
  if (cells[2]) {
    await cells[2].hover();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'n22-tip-armor.png') });
    console.log('防具悬浮对比');
  }
  if (cells[4]) {
    await cells[4].hover();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'n23-tip-med.png') });
    console.log('药物悬浮');
  }
  if (cells[6]) {
    await cells[6].hover();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'n24-tip-material.png') });
    console.log('材料悬浮');
  }

  // 商店悬浮
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(400);
  await page.evaluate(() => document.querySelector('#btnShop')?.click());
  await sleep(800);
  const shopItems = await page.$$('.shop-item[data-tip]');
  if (shopItems[0]) {
    await shopItems[0].hover();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'n25-tip-shop.png') });
    console.log('商店悬浮');
  }

  // 后台
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('ADMIN: ' + e.message));
  await admin.goto(BASE + '/admin.html', { waitUntil: 'networkidle' });
  await sleep(400);
  await admin.fill('#pwd', 'jianghan');
  await admin.click('#btnLogin');
  await sleep(1600);

  // 运行页
  await admin.evaluate(() => document.querySelector('[data-tab="stats"]').click());
  await sleep(1200);
  await admin.screenshot({ path: path.join(OUT, 'n26-admin-stats.png') });
  console.log('后台运行页');

  // 数值页
  await admin.evaluate(() => document.querySelector('[data-tab="settings"]').click());
  await sleep(600);
  await admin.screenshot({ path: path.join(OUT, 'n27-admin-settings.png') });
  console.log('后台数值页');

  // GM 页
  await admin.evaluate(() => document.querySelector('[data-tab="gm"]').click());
  await sleep(800);
  await admin.screenshot({ path: path.join(OUT, 'n28-admin-gm.png') });
  console.log('后台 GM 页');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})();
