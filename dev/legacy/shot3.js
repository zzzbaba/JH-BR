// 双人对局截图：交易 + 排行榜 + 死亡观战
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';

async function reg(name) {
  const r = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: '1234' }),
  });
  return (await r.json()).token;
}
async function newgame(tk, name) {
  const r = await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ name }),
  });
  return await r.json();
}

(async () => {
  const stamp = Date.now().toString().slice(-6);
  const uA = 'tradeA' + stamp, uB = 'tradeB' + stamp;
  const tA = await reg(uA), tB = await reg(uB);
  await newgame(tA, '老陈');
  await newgame(tB, '小杨');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  // A 的页面
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  await pageA.goto(BASE, { waitUntil: 'networkidle' });
  await pageA.evaluate(t => localStorage.setItem('br_token', t), tA);
  await pageA.evaluate(u => localStorage.setItem('br_user', u), uA);
  await pageA.reload({ waitUntil: 'networkidle' });
  await sleep(1400);

  // 打开交易
  await pageA.evaluate(() => document.querySelector('#btnTrade')?.click());
  await sleep(900);
  // 选中对方
  await pageA.evaluate(() => {
    const d = document.querySelector('#nearList div[data-pick]');
    if (d) d.click();
  });
  await sleep(500);
  // 勾选要给的东西
  await pageA.evaluate(() => {
    const g = document.querySelector('[data-give]');
    if (g) g.click();
  });
  await sleep(400);
  await pageA.screenshot({ path: path.join(OUT, 'n09-trade.png') });
  console.log('交易界面');

  // 发报价
  await pageA.evaluate(() => document.querySelector('#btnSendOffer')?.click());
  await sleep(900);
  await pageA.screenshot({ path: path.join(OUT, 'n09b-trade-sent.png') });

  // B 的页面：接受报价
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await ctxB.newPage();
  await pageB.goto(BASE, { waitUntil: 'networkidle' });
  await pageB.evaluate(t => localStorage.setItem('br_token', t), tB);
  await pageB.evaluate(u => localStorage.setItem('br_user', u), uB);
  await pageB.reload({ waitUntil: 'networkidle' });
  await sleep(1400);
  await pageB.evaluate(() => document.querySelector('#btnTrade')?.click());
  await sleep(900);
  await pageB.screenshot({ path: path.join(OUT, 'n09c-trade-incoming.png') });
  console.log('收到报价界面');

  // 排行榜
  await pageA.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);
  await pageA.evaluate(() => document.querySelector('.ctab[data-ctab="rank"]').click());
  await sleep(1200);
  await pageA.screenshot({ path: path.join(OUT, 'n08-rank.png') });
  console.log('排行榜');

  await browser.close();
})();
