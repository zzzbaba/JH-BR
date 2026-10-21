// 第 25 轮验证：战斗窗口血条和左上角血条同档位同特效
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8123';
const sp = u => path.join(__dirname, 'store', 'saves', crypto.createHash('md5').update(u).digest('hex').slice(0, 16) + '.json');

(async () => {
  const at = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'jianghan' }) }).then(r => r.json()).then(j => j.token);
  const ov = await fetch(BASE + '/api/admin/overview', { headers: { Authorization: 'Bearer ' + at } }).then(r => r.json());
  if (ov.round.state !== 'running') {
    await fetch(BASE + '/api/admin/round', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + at }, body: JSON.stringify({ action: 'start' }) });
  }
  const user = 'hb' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '血条测试' }) });
  await sleep(200);

  const s = JSON.parse(fs.readFileSync(sp(user), 'utf8'));
  s.char.scene = 'battle';
  s.char.status = { id: 'normal', name: '正常', color: '#8a8a76', desc: '', leftMs: 0 };
  s.char.pending = {
    enemy: { id: 'e04', name: '野狗群', tier: 1, kind: 'animal', hp: 30, maxHp: 30, atk: 8, def: 0, dodge: 15, desc: '三条瘦得见骨的土狗。' },
    round: 1, zoneName: '十号地', noise: 0, wave: 1,
    log: ['你赤手空拳扑了上去。没打中。'],
    firstStrike: false, stun: 0, enemyStun: 0, smoke: 0, guaranteed: false,
    hostage: null, npc: null, boss: false, pvp: null,
  };
  fs.writeFileSync(sp(user), JSON.stringify(s, null, 2));

  const browser = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('C:' + m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(t => localStorage.setItem('br_token', t), tk);
  await page.evaluate(u => localStorage.setItem('br_user', u), user);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1600);

  // 读左上角血条 和 战斗窗口血条 的 class + 计算样式
  const probe = () => page.evaluate(() => {
    // 左上角：#hpBar 是 .bar-fill 本身，往上两层才是 .bar 和 .vital
    const fillL = document.querySelector('#hpBar');
    const barL = fillL ? fillL.parentElement : null;
    const wrapL = barL ? barL.parentElement : null;
    const desc = (bar, wrap, fill) => {
      if (!bar) return null;
      const cs = getComputedStyle(bar);
      const after = fill ? getComputedStyle(fill, '::after') : null;
      return {
        bar: bar.className,
        wrap: wrap ? wrap.className : null,
        anim: cs.animationName,
        shadow: cs.boxShadow.slice(0, 42),
        fillBg: fill ? getComputedStyle(fill).backgroundImage.slice(0, 46) : null,
        march: after ? after.animationName : null,
      };
    };
    const left = desc(barL, wrapL, fillL);

    const btVital = document.querySelector('#btHeroStage')?.closest('.fighter')?.querySelector('.vital');
    let bt = null;
    if (btVital) {
      const bar = btVital.querySelector('.bar');
      const fill = bar.querySelector('.bar-fill');
      bt = desc(bar, btVital, fill);
      const num = btVital.parentElement.querySelector('.mini-row .num-hp');
      bt.num = num ? num.className : null;
      bt.numColor = num ? getComputedStyle(num).color : null;
      bt.rowCls = btVital.parentElement.querySelector('.mini-row').className;
    }
    return { left, bt };
  });

  const stOf = s => (/state-(high|mid|low|crit)/.exec(s || '') || [])[1];

  const cases = [
    { name: '满血满精力', fn: () => { S.char.hp = S.char.hpMax; S.char.ep = S.char.epMax; }, file: 'r25-1-full.png' },
    { name: '中血 50%', fn: () => { S.char.hp = Math.round(S.char.hpMax * 0.5); S.char.ep = S.char.epMax; }, file: 'r25-2-mid.png' },
    { name: '低血 22%', fn: () => { S.char.hp = Math.round(S.char.hpMax * 0.22); S.char.ep = S.char.epMax; }, file: 'r25-3-low.png' },
    { name: '濒危 8%', fn: () => { S.char.hp = Math.round(S.char.hpMax * 0.08); S.char.ep = S.char.epMax; }, file: 'r25-4-crit.png' },
  ];

  for (const c of cases) {
    await page.evaluate(c.fn);
    await page.evaluate(() => { renderChar(); renderModal(); });
    await sleep(850);
    const r = await probe();
    const L = r.left, B = r.bt;
    const lSt = stOf(L.wrap), bSt = stOf(B.wrap);
    const same = lSt && bSt && lSt === bSt
      && L.bar.split(' ').sort().join(' ') === B.bar.split(' ').sort().join(' ')
      && L.march === B.march
      && L.anim === B.anim;
    console.log(`\n=== ${c.name} ===`);
    console.log('  左上角 条:', L.bar, '| 包裹:', L.wrap, '| 动画:', L.anim, '| 跑马灯:', L.march);
    console.log('  战斗   条:', B.bar, '| 包裹:', B.wrap, '| 动画:', B.anim, '| 跑马灯:', B.march);
    console.log('  数字颜色:', B.numColor, '| 行 class:', B.rowCls);
    console.log('  两边档位/动画/跑马灯一致:', same ? '✓' : `✗ (${lSt} vs ${bSt})`);
    await page.screenshot({ path: path.join(OUT, c.file) });
  }

  console.log('\n页面错误:', errors.length ? errors.slice(0, 5) : '无');
  await browser.close();
})();
