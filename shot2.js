// 新界面截图
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--font-render-hinting=none'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const user = 'shot' + Date.now().toString().slice(-6);

  await page.goto('http://127.0.0.1:8123', { waitUntil: 'networkidle' });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'n01-login.png') });

  // 注册
  await page.fill('#inUser', user);
  await page.fill('#inPass', '1234');
  await page.click('.tab[data-tab="register"]');
  await page.click('#btnAuth');
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'n02-wait.png') });
  console.log('等待开局页');

  // 加入对局
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#waitActions .btn')].find(x => x.textContent.includes('加入对局'));
    if (b) b.click();
  });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'n03-main.png') });
  console.log('主界面');

  // 发几条聊天
  await page.evaluate(() => document.querySelector('.ctab[data-ctab="chat"]').click());
  await sleep(300);
  await page.fill('#chatText', '有人在十号地吗？我在军需官旁边');
  await page.click('#btnSend');
  await sleep(900);
  await page.fill('#chatText', '广华寺那边别去，钟楼上有人');
  await page.click('#btnSend');
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'n04-chat.png') });
  console.log('聊天面板');

  // 商店
  await page.evaluate(() => document.querySelector('#btnShop')?.click());
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'n05-shop.png') });
  console.log('商店');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // 探索几次，碰碰运气截图
  for (let i = 0; i < 10; i++) {
    const busy = await page.evaluate(() => {
      const m = document.querySelector('#modal');
      return m && !m.classList.contains('hidden');
    });
    if (busy) {
      const title = await page.evaluate(() => document.querySelector('.m-title')?.textContent || '');
      if (title.includes('人质')) {
        await page.screenshot({ path: path.join(OUT, 'n06-hostage.png') });
        console.log('人质界面');
      }
      await page.evaluate(() => {
        const btns = document.querySelectorAll('.m-foot .btn');
        if (btns.length) btns[0].click();
      });
      await sleep(500);
      continue;
    }
    await page.evaluate(() => document.querySelector('#btnExplore')?.click());
    await sleep(400);
  }

  // 成就
  await page.evaluate(() => {
    const m = document.querySelector('#modal');
    if (m && !m.classList.contains('hidden')) {
      const b = document.querySelector('.m-foot .btn');
      if (b) b.click();
    }
  });
  await sleep(500);
  await page.evaluate(() => document.querySelector('#btnAch')?.click());
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'n07-ach.png') });
  console.log('成就');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // 排行
  await page.evaluate(() => document.querySelector('.ctab[data-ctab="rank"]').click());
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'n08-rank.png') });
  console.log('排行');

  // 交易
  await page.evaluate(() => document.querySelector('#btnTrade')?.click());
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'n09-trade.png') });
  console.log('交易');
  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // 后台
  const admin = await ctx.newPage();
  admin.on('pageerror', e => errors.push('ADMIN: ' + e.message));
  await admin.goto('http://127.0.0.1:8123/admin.html', { waitUntil: 'networkidle' });
  await sleep(500);
  await admin.fill('#pwd', 'jianghan');
  await admin.click('#btnLogin');
  await sleep(1500);
  await admin.screenshot({ path: path.join(OUT, 'n10-admin.png') });
  console.log('后台');

  // 后台玩家编辑
  await admin.evaluate(() => {
    const tr = document.querySelector('#playerRows tr[data-u]');
    if (tr) tr.click();
  });
  await sleep(1200);
  await admin.screenshot({ path: path.join(OUT, 'n11-admin-edit.png') });
  console.log('后台编辑');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 8) : '无');
  await browser.close();
})();
