// 第 19 轮验证：血量三档特效 / 开箱立绘 / 随行面板 / 弹窗居中
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';

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

  const user = 'r19' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: '1234' }),
  }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
    body: JSON.stringify({ name: '老陈' }),
  });
  await fetch(BASE + '/api/admin/bag', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
    body: JSON.stringify({ username: user, action: 'add', itemId: 'buff_charm', n: 1 }),
  });

  const setHp = async (hp, ep) => {
    await fetch(BASE + '/api/admin/player', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at },
      body: JSON.stringify({ username: user, hp, ep }),
    });
  };

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

  const max = await page.evaluate(() => S.char.hpMax);
  console.log('hpMax', max);

  // ---- 1. 四档血量 ----
  for (const [tag, pct] of [['high', 0.9], ['mid', 0.45], ['low', 0.22], ['crit', 0.08]]) {
    await setHp(Math.max(1, Math.round(max * pct)), Math.round(100 * pct));
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1200);
    const st = await page.evaluate(() => {
      const bar = document.querySelector('#hpBar').parentElement;
      const stage = document.querySelector('#heroStage');
      const img = stage.querySelector('img');
      return {
        bar: bar.className,
        txt: document.querySelector('#hpTxt').className,
        stage: stage.className,
        expr: window.PX ? PX.heroLook(S.char).expression : '?',
        crit: !!(window.PX && PX.heroLook(S.char).critical),
      };
    });
    console.log(`${tag}: bar="${st.bar}" txt="${st.txt}" 表情=${st.expr} 舞台="${st.stage}"`);
    await page.screenshot({ path: path.join(OUT, `r19-1-vital-${tag}.png`), clip: { x: 20, y: 90, width: 380, height: 330 } });
  }

  // 恢复满血
  await setHp(max, 100);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1200);

  // ---- 2. 开箱：立绘 + 提示 ----
  await page.route('**/api/state', async route => {
    const resp = await route.fetch();
    const j = await resp.json();
    if (j.state) {
      j.state.scene = 'box';
      j.state.pending = {
        items: [{ id: 'med01', n: 2 }, { id: 'w07', n: 1 }, { id: 'm_stone', n: 3 }],
        text: '一个军绿色的铁箱，锁被撬坏了。',
        zoneName: '十号地',
      };
    }
    await route.fulfill({ response: resp, json: j });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1400);
  const boxInfo = await page.evaluate(() => {
    const art = document.querySelector('.box-art img');
    const b = document.querySelector('.modal-box').getBoundingClientRect();
    return {
      hasArt: !!art,
      artW: art ? art.width : 0,
      modalTop: Math.round(b.top),
      modalH: Math.round(b.height),
      centerGap: Math.round(Math.abs((b.top + b.height / 2) - innerHeight / 2)),
    };
  });
  console.log('开箱:', JSON.stringify(boxInfo), boxInfo.hasArt ? '✓ 有箱子图' : '✗');
  await page.screenshot({ path: path.join(OUT, 'r19-2-box.png') });
  await page.unroute('**/api/state');

  // ---- 3. 随行面板 ----
  await page.route('**/api/state', async route => {
    const resp = await route.fetch();
    const j = await resp.json();
    if (j.state) {
      j.state.char.hostages = [
        { name: '林知夏', at: Date.now() - 300000, mood: 'happy', moodUntil: Date.now() + 600000, songs: 2 },
        { name: '苏念安', at: Date.now() - 120000, mood: 'sad', moodUntil: Date.now() + 600000, songs: 0 },
      ];
    }
    await route.fulfill({ response: resp, json: j });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1400);
  await page.hover('#hostLink');
  await sleep(500);
  const tipTxt = await page.$eval('#tip', el => el.innerText.replace(/\n+/g, ' | ')).catch(() => '(无)');
  console.log('随行悬浮:', tipTxt);
  await page.screenshot({ path: path.join(OUT, 'r19-3-host-tip.png') });
  await page.click('#hostLink');
  await sleep(600);
  const hostModal = await page.$eval('#modalBox', el => el.innerText.replace(/\n+/g, ' | ')).catch(() => '(无)');
  console.log('随行弹窗:', hostModal.slice(0, 120));
  await page.screenshot({ path: path.join(OUT, 'r19-4-host-modal.png') });
  await page.unroute('**/api/state');

  if (errors.length) console.log('页面错误:', errors.slice(0, 4));
  else console.log('无页面错误');
  await browser.close();
})();
