// 第 24 轮验证：战斗窗口立绘共享左上角头像的特效
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

  const user = 'fx' + Date.now().toString().slice(-6);
  const tk = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: '1234' }) }).then(r => r.json()).then(j => j.token);
  await fetch(BASE + '/api/newgame', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ name: '特效测试' }) });
  await sleep(200);

  // 直接钉一个战斗场景：敌人是「野狗群」，我方满血满精力
  const s = JSON.parse(fs.readFileSync(sp(user), 'utf8'));
  s.char.scene = 'battle';
  s.char.status = { id: 'normal', name: '正常', color: '#8a8a76', desc: '', leftMs: 0 };
  s.char.pending = {
    enemy: { id: 'e04', name: '野狗群', tier: 1, kind: 'animal', hp: 30, maxHp: 30, atk: 8, def: 0, dodge: 15, desc: '三条瘦得见骨的土狗。' },
    round: 1, zoneName: '十号地', noise: 0, wave: 1,
    log: ['你赤手空拳扑了上去。没打中。', '野狗群击中你，损失 6 点生命。'],
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

  // 让战斗窗口里的立绘和左上角头像对上：读两边的 class
  const probe = () => page.evaluate(() => {
    const pick = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { cls: el.className, anim: getComputedStyle(el).animationName };
    };
    return {
      scene: S.scene,
      left: pick('#heroStage'),
      my: pick('#btHeroStage'),
      foe: pick('#btFoeStage'),
      myImg: !!document.querySelector('#btHeroStage .px-art'),
      foeImg: !!document.querySelector('#btFoeStage .px-art'),
    };
  });

  // ---- A 满血满精力 ----
  await page.evaluate(() => { S.char.hp = S.char.hpMax; S.char.ep = S.char.epMax; S.char.status = { id: 'normal', name: '正常', color: '#8a8a76', desc: '', leftMs: 0 }; renderChar(); renderModal(); });
  await sleep(850);
  const A = await probe();
  console.log('\n=== A 满血满精力 ===');
  console.log('  左边头像:', A.left.cls);
  console.log('  战斗·你 :', A.my.cls);
  console.log('  两边都有 full-aura:', /full-aura/.test(A.left.cls) && /full-aura/.test(A.my.cls) ? '✓' : '✗');
  console.log('  立绘都画出来了:', A.myImg && A.foeImg ? '✓' : '✗');
  await page.screenshot({ path: path.join(OUT, 'r24-1-full.png') });

  // ---- B 濒危 ----
  await page.evaluate(() => { S.char.hp = Math.round(S.char.hpMax * 0.1); renderChar(); renderModal(); });
  await sleep(850);
  const B = await probe();
  console.log('\n=== B 濒危（血量 10%）===');
  console.log('  左边头像:', B.left.cls, '| 动画', B.left.anim);
  console.log('  战斗·你 :', B.my.cls, '| 动画', B.my.anim);
  console.log('  两边都是 vital-crit + 同一个闪红动画:', /vital-crit/.test(B.left.cls) && /vital-crit/.test(B.my.cls) && B.left.anim === B.my.anim ? '✓' : '✗');
  await page.screenshot({ path: path.join(OUT, 'r24-2-crit.png') });

  // ---- C 中毒 ----
  await page.evaluate(() => {
    S.char.hp = Math.round(S.char.hpMax * 0.5);
    S.char.status = { id: 'poisoned', name: '中毒', color: '#6aa040', desc: '每回合掉血', leftMs: 60000 };
    renderChar(); renderModal();
  });
  await sleep(850);
  const C = await probe();
  console.log('\n=== C 中毒 ===');
  console.log('  左边头像:', C.left.cls);
  console.log('  战斗·你 :', C.my.cls);
  const cloud = await page.evaluate(() => {
    const el = document.querySelector('#btHeroStage');
    const st = getComputedStyle(el, '::after');
    return { content: st.content, bg: st.backgroundImage.slice(0, 60), anim: st.animationName };
  });
  console.log('  战斗窗口的乌云 ::after:', JSON.stringify(cloud));
  console.log('  两边都挂 st-poisoned:', /st-poisoned/.test(C.left.cls) && /st-poisoned/.test(C.my.cls) ? '✓' : '✗');
  await page.screenshot({ path: path.join(OUT, 'r24-3-poison.png') });

  // ---- D 敌人残血 ----
  await page.evaluate(() => {
    S.char.status = { id: 'normal', name: '正常', color: '#8a8a76', desc: '', leftMs: 0 };
    S.char.hp = S.char.hpMax;
    S.pending.enemy.hp = Math.round(S.pending.enemy.maxHp * 0.12);
    renderChar(); renderModal();
  });
  await sleep(850);
  const D = await probe();
  console.log('\n=== D 敌人残血 ===');
  console.log('  战斗·敌 :', D.foe.cls, '| 动画', D.foe.anim);
  console.log('  敌人也有濒危闪红:', /vital-crit/.test(D.foe.cls) ? '✓' : '✗');
  await page.screenshot({ path: path.join(OUT, 'r24-4-foe-low.png') });

  // ---- E 受击震动同步 ----
  await page.evaluate(() => { S.char.hp = S.char.hpMax; S.char.status = { id: 'normal', name: '正常', color: '#8a8a76', desc: '', leftMs: 0 }; renderChar(); renderModal(); });
  await sleep(400);
  const shake = await page.evaluate(async () => {
    const before = S.char.hp;
    S.char.hp = before - 18;      // 模拟挨了 18 点
    renderChar(); renderModal();
    const el = document.querySelector('#btHeroStage');
    const got = el.className.includes('hit-hard');
    return { before, after: S.char.hp, cls: el.className, got };
  });
  console.log('\n=== E 受击震动 ===');
  console.log('  掉血后战斗立绘的 class:', shake.cls);
  console.log('  战斗窗口也抖了:', shake.got ? '✓' : '✗');
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'r24-5-hit.png') });

  console.log('\n页面错误:', errors.length ? errors.slice(0, 5) : '无');
  await browser.close();
})();
