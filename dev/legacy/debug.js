// 单局详细追踪
const MAPD = require('./data/map');
const G = require('./game');
const ITEMS = G.ITEMS;

const c = G.createChar('调试');
console.log(`初始：HP ${c.hp}/${G.hpMax(c)}  EP ${c.ep}  属性 ${JSON.stringify(c.attrs)}`);
console.log(`武器：${c.equip.weapon ? ITEMS[c.equip.weapon.id].name : '空手'}  背包 ${c.bag.map(b => ITEMS[b.id].name + 'x' + b.n).join(', ')}`);

let lastLogLen = 0;
function dumpNew() {
  const l = c.log || [];
  for (let i = lastLogLen; i < l.length; i++) console.log('   · ' + l[i].text);
  lastLogLen = l.length;
}

for (let step = 0; step < 600 && c.scene !== 'dead'; step++) {
  const sc = c.scene;
  let r;
  if (sc === 'map') {
    if (c.ep < 22) { r = G.act(c, 'rest'); }
    else {
      const nb = MAPD.neighbors(MAPD.BY_ID[c.pos].x, MAPD.BY_ID[c.pos].y);
      const roll = Math.random();
      if (roll < 0.5) { const t = nb[Math.floor(Math.random() * nb.length)]; console.log(`\n[移动] → ${t.name} (危险${t.danger})`); r = G.act(c, 'move', { x: t.x, y: t.y }); }
      else if (roll < 0.88) { console.log('\n[探索] ' + MAPD.BY_ID[c.pos].name); r = G.act(c, 'explore'); }
      else { console.log('\n[休息]'); r = G.act(c, 'rest'); }
    }
  } else if (sc === 'encounter') {
    const e = c.pending.enemy;
    console.log(`  >> 遭遇 ${e.name} HP${e.hp} ATK${e.atk} DEF${e.def} DODGE${e.dodge}`);
    const hpPct = c.hp / G.hpMax(c);
    const med = c.bag.find(i => ITEMS[i.id].type === 'med' && ITEMS[i.id].hp > 0);
    if (hpPct < 0.5 && med) r = G.act(c, 'encounter', { choice: 'item', itemId: med.id });
    else if (Math.random() < 0.4) r = G.act(c, 'encounter', { choice: 'spare' });
    else r = G.act(c, 'encounter', { choice: 'fight' });
  } else if (sc === 'battle') {
    const hpPct = c.hp / G.hpMax(c);
    const med = c.bag.find(i => ITEMS[i.id].type === 'med' && ITEMS[i.id].hp > 0);
    if (hpPct < 0.4 && med) r = G.act(c, 'battle', { choice: 'item', itemId: med.id });
    else if (hpPct < 0.35) r = G.act(c, 'battle', { choice: 'flee' });
    else r = G.act(c, 'battle', { choice: 'attack' });
  } else if (sc === 'loot' || sc === 'box') {
    r = G.act(c, sc, { all: true });
  } else break;

  dumpNew();
  if (sc === 'battle') {
    const p = c.pending;
    if (p && p.log) {
      const nl = p.log.slice(-2);
      nl.forEach(t => console.log('      ' + t));
    }
  }
  if (r && r.ok === false) console.log('  !! 失败:', r.msg);
  if (c.scene === 'dead') break;
  console.log(`  [HP ${Math.round(c.hp)} EP ${Math.round(c.ep)} 背包${G.usedSlots(c)}/${G.slots(c)}]`);
}

console.log('\n=== 结束 ===');
console.log('场景:', c.scene, '原因:', c.pending && c.pending.reason);
console.log('回合:', c.turn, '击杀:', c.kills);
