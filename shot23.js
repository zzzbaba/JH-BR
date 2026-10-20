// 第 21 轮验证：Enter 探索 / 空格战斗 / 提示条切换
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';

(async () => {
  const at = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'jianghan' }) }).then(r => r.json()).then(j => j.token);
  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + at } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at }, body: JSON.stringify({ action: 'start' }) });
  }
  const user = 'r21' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '键盘侠' }) });

  const browser = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);

  const st = () => page.evaluate(async () => {
    const j = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('br_token') } }).then(r => r.json());
    return { scene: j.state.scene, ep: j.state.char.ep, turn: j.state.char.turn, logs: j.state.log.length };
  });

  const hints = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('.kbd-hint')];
    return els.filter(e => !e.classList.contains('hidden')).map(e => e.textContent);
  });

  console.log('地图提示条:', (await hints()).join(' | '));

  const a = await st();
  await page.keyboard.press('Enter');
  await sleep(900);
  const b = await st();
  console.log('Enter 前:', JSON.stringify(a), '后:', JSON.stringify(b),
    (b.turn > a.turn || b.ep < a.ep || b.scene !== 'map') ? '✓ 有动作' : '✗ 没反应');

  // 一直按 Enter 直到离开地图
  let cur = b, tries = 0;
  while (cur.scene === 'map' && tries < 25) {
    await page.keyboard.press('Enter');
    await sleep(750);
    cur = await st();
    tries++;
  }
  console.log(`按了 ${tries} 次 Enter 后场景:`, cur.scene);
  await page.screenshot({ path: path.join(OUT, 'r22-1-enter.png') });

  // 遭遇 → 空格 = 战斗
  if (cur.scene === 'encounter') {
    console.log('弹窗提示条:', (await hints()).join(' | '));
    await page.keyboard.press('Space');
    await sleep(1200);
    const c = await st();
    console.log('空格后场景:', c.scene, (c.scene === 'battle' || c.scene === 'loot') ? '✓ 打起来了' : '✗');
    await page.screenshot({ path: path.join(OUT, 'r22-2-space-fight.png') });
    if (c.scene === 'battle') {
      const hp0 = await st();
      await page.keyboard.press('Space');
      await sleep(1200);
      const hp1 = await st();
      console.log('战斗里再按空格: 场景', hp1.scene, '回合变化', hp1.turn !== hp0.turn ? '✓' : '(可能没变)');
    }
  }

  console.log('页面错误:', errors.length ? errors.slice(0, 3) : '无');
  await browser.close();
})();
