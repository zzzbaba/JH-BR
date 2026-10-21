// 界面截图验证
const { chromium } = require('playwright-core');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://127.0.0.1:8123', { waitUntil: 'networkidle' });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, '01-login.png') });
  console.log('登录页已截图');

  // 注册
  const user = 'shot' + Date.now().toString().slice(-6);
  await page.fill('#inUser', user);
  await page.fill('#inPass', '1234');
  await page.click('.tab[data-tab="register"]');
  await page.click('#btnAuth');
  await sleep(900);

  // 开局
  const startBtn = await page.$('.m-foot .btn.primary');
  if (startBtn) {
    await page.screenshot({ path: path.join(OUT, '02-start.png') });
    await startBtn.click();
    await sleep(700);
  }
  await page.screenshot({ path: path.join(OUT, '03-main.png') });
  console.log('主界面已截图');

  // 连续探索，直到出现遭遇/战斗
  let gotEncounter = false, gotBattle = false, gotBox = false;
  for (let i = 0; i < 26; i++) {
    const modalVisible = await page.evaluate(() => {
      const m = document.querySelector('#modal');
      return m && !m.classList.contains('hidden');
    });
    if (modalVisible) {
      const title = await page.evaluate(() => document.querySelector('.m-title')?.textContent || '');
      if (title.includes('遭遇') && !gotEncounter) {
        await page.screenshot({ path: path.join(OUT, '04-encounter.png') });
        gotEncounter = true;
        console.log('遭遇界面已截图');
        // 选择战斗
        const fightBtn = await page.$('.m-foot .btn.danger');
        if (fightBtn) { await fightBtn.click(); await sleep(500); }
        continue;
      }
      if (title.includes('战斗') && !gotBattle) {
        await page.screenshot({ path: path.join(OUT, '05-battle.png') });
        gotBattle = true;
        console.log('战斗界面已截图');
      }
      if (title.includes('开箱') && !gotBox) {
        await page.screenshot({ path: path.join(OUT, '06-box.png') });
        gotBox = true;
        console.log('开箱界面已截图');
      }
      // 处理当前弹窗
      const btns = await page.$$('.m-foot .btn');
      if (btns.length) { await btns[btns.length - 1].click(); await sleep(350); }
      continue;
    }
    // 地图状态：探索
    const dead = await page.evaluate(() => document.body.innerText.includes('出 局'));
    if (dead) break;
    const exp = await page.$('#btnExplore:not([disabled])');
    if (exp) { await exp.click(); await sleep(320); }
    else break;
  }

  // 用新账号截 UI 面板（新开局必然是地图场景）
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(600);
  const user2 = 'ui' + Date.now().toString().slice(-6);
  await page.fill('#inUser', user2);
  await page.fill('#inPass', '1234');
  await page.click('.tab[data-tab="register"]');
  await page.click('#btnAuth');
  await sleep(1000);
  const sb = await page.$('.m-foot .btn.primary');
  if (sb) { await sb.click(); await sleep(800); }
  await page.screenshot({ path: path.join(OUT, '07-main2.png') });

  // 背包
  await page.evaluate(() => document.querySelector('#btnBag')?.click());
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '08-bag.png') });
  console.log('背包界面已截图');

  await page.evaluate(() => document.querySelector('.bag-cell')?.click());
  await sleep(350);
  await page.screenshot({ path: path.join(OUT, '09-item.png') });
  console.log('物品详情已截图');

  await page.evaluate(() => document.querySelector('#mClose')?.click());
  await sleep(300);

  // 合成
  await page.evaluate(() => document.querySelector('#btnCraft')?.click());
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '10-craft.png') });
  console.log('合成界面已截图');

  console.log('\n控制台错误:', errors.length ? errors.slice(0, 10) : '无');
  await browser.close();
})();
