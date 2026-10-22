// 江汉BR —— 前端
const $ = s => document.querySelector(s);
const CELL = 100, N = 8, MAP_PX = 800;

let META = null;
let S = null;
let ROUND = null;
let TOKEN = localStorage.getItem('br_token') || '';
let USERNAME = localStorage.getItem('br_user') || '';
let IS_GM = false;
let authMode = 'login';
let bagSel = null;
let craftCat = '全部';
let chatCh = 'info';   // info = 个人日志 + 公共频道
let chatSince = 0;
let chatMsgs = [];
let rankTimer = null, pollTimer = null, tickTimer = null, lobbyTimer = null;

const canvas = $('#map');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ================= 基础 =================
async function api(path, body) {
  const opt = {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
  };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(path, opt);
  const j = await r.json();
  if (r.status === 401) { logout(); throw new Error(j.msg || '请重新登录'); }
  return j;
}

let toastTimer = null;
let lastToastMsg = '', lastToastAt = 0;
// 提示条贴着地图下沿显示。
// 以前写死 bottom:40px，会压住区域栏的按钮，而且离「事情发生的地方」（地图）太远。
// 等待/结算界面没有地图，退回底部居中。
// 提示条定位：**不能盖住能点的东西**。
// 1) 有弹窗（战斗/遭遇/背包…）→ 贴弹窗框下沿；下面放不下就翻到框上面
// 2) 没弹窗 → 贴地图下沿（不碰区域栏的按钮）
// 3) 等待/结算界面没有地图 → 退回屏幕底部
function positionToast(el) {
  const h = el.offsetHeight || 44;
  const w = el.offsetWidth || 320;
  // .toast 有 translateX(-50%)，left 必须留出半个宽度才不会出屏
  const clampX = cx => Math.round(Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, cx)));

  const modal = $('#modal');
  const box = $('#modalBox');
  if (modal && !modal.classList.contains('hidden') && box) {
    const r = box.getBoundingClientRect();
    el.style.bottom = 'auto';
    el.style.left = clampX(r.left + r.width / 2) + 'px';
    const below = r.bottom + 10;
    if (below + h <= window.innerHeight - 8) {
      el.style.top = Math.round(below) + 'px';
    } else {
      const above = r.top - h - 10;
      el.style.top = Math.round(above >= 8 ? above : window.innerHeight - h - 6) + 'px';
    }
    return;
  }

  const wrap = document.querySelector('.map-wrap');
  const r = wrap ? wrap.getBoundingClientRect() : null;
  if (!r || !r.height) {
    el.style.top = 'auto';
    el.style.bottom = '40px';
    return;
  }
  el.style.bottom = 'auto';
  el.style.left = clampX(r.left + r.width / 2) + 'px';
  el.style.top = Math.round(Math.max(8, r.bottom - h - 8)) + 'px';
}

function toast(msg) {
  const now = Date.now();
  // 同一句话短时间内重复触发就忽略——否则自动战斗这种循环会把提示闪成频闪灯
  if (msg === lastToastMsg && now - lastToastAt < 1200) return;
  lastToastMsg = msg; lastToastAt = now;
  document.querySelectorAll('.toast').forEach(e => e.remove());
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  document.body.appendChild(d);
  positionToast(d);
  // 弹窗的 margin-top 是算出来的，可能晚一帧才定下来 —— 再校一次
  requestAnimationFrame(() => { if (d.isConnected) positionToast(d); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => d.remove(), 2400);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 像素美术辅助
function pxPerson(opts, w) {
  if (!window.PX) return '';
  const h = Math.round(w * 32 / 24);
  // 缓存：战斗每回合都会重建 DOM，不缓存的话每次都要重新画 + toDataURL
  const key = 'p_' + w + '_' + JSON.stringify(opts);
  if (!iconCache[key]) iconCache[key] = PX.personCanvas(opts, w, h).toDataURL();
  return `<img class="px-art" src="${iconCache[key]}" width="${w}" height="${h}" alt="">`;
}
const iconCache = {};
function pxItem(id, size) {
  if (!window.PX) return '';
  const key = id + '_' + size;
  if (!iconCache[key]) iconCache[key] = PX.itemCanvas(id, size).toDataURL();
  return `<img class="px-item" src="${iconCache[key]}" width="${size}" height="${size}" alt="">`;
}

// 特殊角色（七娃 / 刘颖）：高精度绘制
function pxSpecial(who, w) {
  if (!window.PX || !PX.specialCanvas) return '';
  const key = 'sp_' + who + '_' + w;
  if (!iconCache[key]) iconCache[key] = PX.specialCanvas(who, w).toDataURL();
  return `<img class="px-art" src="${iconCache[key]}" width="${w}" alt="">`;
}

// 宝箱图标（按箱子文字挑外观）
function boxKind(text) {
  const t = String(text || '');
  if (t.includes('铁箱')) return 0;
  if (t.includes('木箱')) return 1;
  if (t.includes('行李箱')) return 2;
  if (t.includes('储物柜')) return 3;
  return 4;
}
function pxBox(kind, size) {
  if (!window.PX || !PX.boxCanvas) return '';
  const key = 'box_' + kind + '_' + size;
  if (!iconCache[key]) iconCache[key] = PX.boxCanvas(kind, size).toDataURL();
  return `<img class="px-art" src="${iconCache[key]}" width="${size}" height="${size}" alt="">`;
}

function fmtTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60), s = t % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ================= 道具悬浮说明 =================
const TYPE_CN = {
  weapon: '武器', armor: '防具', bag: '背包', med: '药物',
  material: '材料', ammo: '弹药', throwable: '暗器', buff: '配件', special: '特殊',
};

let tipTarget = null;
// 悬浮提示里「一次用几个」的临时状态（战斗/遭遇的道具面板会设置它）
let tipQty = 1, tipQtyId = null, lastMouse = { clientX: 0, clientY: 0 };

function tipRow(label, v, curV, better) {
  let cmp = '';
  if (curV !== null && curV !== undefined && !isNaN(curV)) {
    const diff = v - curV;
    if (diff === 0) {
      cmp = '<span class="tip-cmp same">=</span>';
    } else {
      const good = better === 'low' ? diff < 0 : diff > 0;
      const arrow = diff > 0 ? '↑' : '↓';
      cmp = `<span class="tip-cmp ${good ? 'up' : 'down'}">${arrow}${diff > 0 ? '+' : ''}${diff}</span>`;
    }
  }
  return `<div class="tip-row"><span>${label}</span><b>${v}${cmp}</b></div>`;
}

function itemById(id) { return META.items[id] || null; }

// 人质心情表（后端 META.moods 优先，取不到就用这份）
const MOOD_CN = {
  happy: { name: '开心', color: '#6fa84f' },
  normal: { name: '一般', color: '#c8a03a' },
  sad: { name: '不开心', color: '#c8453a' },
};
function moodOf(id) { return (META.moods && META.moods[id]) || MOOD_CN[id] || MOOD_CN.normal; }

// 随行面板（鼠标悬停「随行」时显示）
function hostagesTipHtml() {
  const hs = (S && S.char && S.char.hostages) || [];
  const head = `<div class="tip-head"><div class="th-txt">
    <div class="tip-name">随行 ${hs.length} 人<span class="tip-type">点开可互动</span></div>
  </div></div>`;
  if (!hs.length) return head + '<div class="tip-cur">还没有人跟着你。遇到人质时选择「问她愿不愿意」。</div>';
  const rows = hs.map(h => {
    const m = moodOf(h.mood);
    return `<div class="tip-row"><span>${esc(h.name)}</span>
      <b style="color:${m.color}">${m.name}${h.songs ? ` · 唱过 ${h.songs} 次` : ''}</b></div>`;
  }).join('');
  return head + '<div class="tip-sep"></div>' + rows
    + '<div class="tip-cur">心情会自己变。她开心的时候才愿意搭理你。</div>';
}

function attrTipHtml(k) {
  const name = (META.attrNames && META.attrNames[k]) || k;
  const tip = (META.attrTips && META.attrTips[k]) || '';
  const eff = S && S.char && S.char.eff ? S.char.eff[k] : null;
  return `<div class="tip-head"><div class="th-txt">
      <div class="tip-name">${esc(name)}${eff != null ? `<span class="tip-type">当前 ${eff}</span>` : ''}</div>
    </div></div><div class="tip-sep"></div><div class="tip-note">${esc(tip)}</div>`;
}

// 属性用途小注（道具说明里用）
function attrNotes(keys) {
  const tips = META.attrTips || {};
  const rows = (keys || []).filter(k => tips[k]).map(k =>
    `<div class="tip-note" style="margin-top:4px"><b style="color:var(--accent3);font-weight:normal">${esc(META.attrNames[k])}</b>：${esc(tips[k])}</div>`);
  return rows.join('');
}

// 悬停的格子到底是哪一件实例：装备栏按槽位，背包按 id|plus 精确匹配
function entryOfTarget(el) {
  const c = S && S.char;
  if (!c || !el || !el.dataset) return null;
  if (el.dataset.slot) return c.equip[el.dataset.slot] || null;
  const key = el.dataset.key;
  if (key) {
    const [id, p] = key.split('|');
    return c.bag.find(x => x.id === id && plusOfEntry(x) === (+p || 0)) || null;
  }
  return null;
}

// 按 id + 强化等级找到具体那件实例，用来读附魔词条
function findEntry(id, plus) {
  const c = S && S.char;
  const d = META.items[id];
  if (!c || !d) return null;
  const p = Math.max(0, Math.min(3, plus || 0));
  const slot = d.type === 'weapon' ? 'weapon' : d.slot;
  const eq = slot ? c.equip[slot] : null;
  if (eq && eq.id === id && plusOfEntry(eq) === p) return eq;
  return c.bag.find(x => x.id === id && plusOfEntry(x) === p) || null;
}
// 强化品质：+1 优秀 / +2 史诗 / +3 传说
const GRADE_CN = { 1: '优秀', 2: '史诗', 3: '传说' };
function gradeHtml(plus, entry) {
  const p = Math.max(0, Math.min(3, plus || 0));
  if (!p) return '';
  // 标签里带上附魔词条，不用往下翻才知道加了什么
  const afx = affixTxt(entry);
  const sub = afx ? `<i>${afx}</i>` : '';
  return `<span class="tip-grade g${p}"><b>${GRADE_CN[p]}</b>${sub}</span>`;
}

// 词条文案：「魅力 +6 · 体力 +10」
function affixTxt(entry) {
  const a = (entry && entry.affix) || [];
  if (!a.length) return '';
  return a.map(x => `${META.attrNames[x.k] || x.k} +${x.v}`).join(' · ');
}

function tipHtml(itemId, plus, entry) {
  if (itemId === 'hostages') return hostagesTipHtml();
  if (itemId.startsWith('attr_')) return attrTipHtml(itemId.slice(5));
  const d = itemById(itemId);
  if (!d) return '';
  const c = S ? S.char : null;
  const p = Math.max(0, Math.min(3, plus || 0));
  const parts = [];

  const myEntry = entry || findEntry(itemId, p);
  const grade = (d.type === 'weapon' || d.type === 'armor' || d.type === 'bag') ? gradeHtml(p, myEntry) : '';
  // 品质标签放描述行右边 —— 塞进标题行会把「88式狙击步枪 +3 武器」挤成竖排
  parts.push(`<div class="tip-head">
    ${pxItem(itemId, 32)}
    <div class="th-txt">
      <div class="tip-name">${esc(d.name)}${p ? `<b class="plus-tag">+${p}</b>` : ''}<span class="tip-type">${TYPE_CN[d.type] || d.type}</span></div>
      ${(d.desc || grade) ? `<div class="tip-subrow">
        ${d.desc ? `<div class="tip-desc">${esc(d.desc)}</div>` : '<div class="tip-desc"></div>'}
        ${grade}
      </div>` : ''}
    </div>
  </div>`);

  if (d.type === 'weapon') {
    const curEntry = c && c.equip.weapon ? c.equip.weapon : null;
    const cur = curEntry ? itemById(curEntry.id) : null;
    const myDmg = effDmgOf(itemId, p);
    const curDmg = curEntry ? effDmgOf(curEntry.id, curEntry.plus) : null;
    parts.push('<div class="tip-sep"></div>');
    parts.push(tipRow('伤害', myDmg, curDmg, 'high'));
    if (p) parts.push(`<div class="tip-row"><span>强化</span><b>+${p}（基础 ${d.dmg}）</b></div>`);
    const afx = affixTxt(entry || findEntry(itemId, p));
    if (afx) parts.push(`<div class="tip-row tip-affix"><span>附魔</span><b>${afx}</b></div>`);
    parts.push(tipRow('噪音', d.noise, cur ? cur.noise : null, 'low'));
    if (d.ammo && itemById(d.ammo)) {
      parts.push(`<div class="tip-row"><span>弹药</span><b>${esc(itemById(d.ammo).name)}</b></div>`);
    } else {
      parts.push('<div class="tip-row"><span>弹药</span><b>不需要</b></div>');
    }
    if (cur) {
      const curAfx = affixTxt(curEntry);
      parts.push(`<div class="tip-cur">当前：${esc(cur.name)}${plusTxt(curEntry.plus)}（伤害 ${curDmg} · 噪音 ${cur.noise}${curAfx ? ' · 附魔 ' + curAfx : ''}）</div>`);
    }
    else parts.push('<div class="tip-cur">当前：空手（伤害 5）</div>');
    if (d.noise >= 8) parts.push('<div class="tip-warn">开火噪音大，容易引来附近的人</div>');
    else if (d.noise <= 2) parts.push('<div class="tip-use">几乎无声，不会引发连续遭遇</div>');
  } else if (d.type === 'armor') {
    const curEntry = c && c.equip[d.slot] ? c.equip[d.slot] : null;
    const cur = curEntry ? itemById(curEntry.id) : null;
    const myDef = effDefOf(itemId, p);
    const curDef = curEntry ? effDefOf(curEntry.id, curEntry.plus) : 0;
    parts.push('<div class="tip-sep"></div>');
    parts.push(tipRow('防御', myDef, curDef, 'high'));
    if (p) parts.push(`<div class="tip-row"><span>强化</span><b>+${p}（基础 ${d.defense}）</b></div>`);
    const afx2 = affixTxt(entry || findEntry(itemId, p));
    if (afx2) parts.push(`<div class="tip-row tip-affix"><span>附魔</span><b>${afx2}</b></div>`);
    parts.push(`<div class="tip-row"><span>部位</span><b>${META.slotNames[d.slot]}</b></div>`);
    const curAfx2 = affixTxt(curEntry);
    parts.push(`<div class="tip-cur">当前：${cur ? esc(cur.name) + plusTxt(curEntry.plus) + '（+' + curDef + (curAfx2 ? ' · 附魔 ' + curAfx2 : '') + '）' : '未装备'}</div>`);
  } else if (d.type === 'bag') {
    const cur = c && c.equip.bag ? itemById(c.equip.bag.id) : null;
    parts.push('<div class="tip-sep"></div>');
    parts.push(tipRow('容量', d.bagBonus, cur ? cur.bagBonus : 0, 'high'));
    parts.push(`<div class="tip-cur">当前：${cur ? esc(cur.name) + '（+' + cur.bagBonus + '）' : '无（基础 ' + META.baseSlots + ' 格）'}</div>`);
  } else if (d.type === 'med') {
    parts.push('<div class="tip-sep"></div>');
    const cc = S ? S.char : null;
    // 战斗/遭遇面板里选了 N 个，提示也要按 N 算（不然写着 +12 实际 +36）
    const times = (itemId === tipQtyId && tipQty > 1) ? tipQty : 1;
    if (times > 1) parts.push(`<div class="tip-cur" style="color:var(--accent3)">按一次用 ${times} 个计算</div>`);
    if (d.hp) {
      if (cc) {
        const total = d.hp * times;
        const got = Math.max(0, Math.min(total, cc.hpMax - cc.hp));
        const waste = total - got;
        parts.push(`<div class="tip-row"><span>生命</span><b><span class="tip-cmp ${got > 0 ? 'up' : 'down'}">+${got}</span></b></div>`);
        parts.push(`<div class="tip-cur">${cc.hp}/${cc.hpMax} → ${Math.min(cc.hpMax, cc.hp + total)}/${cc.hpMax}${waste > 0 ? `（${waste} 点溢出，浪费）` : ''}</div>`);
      } else parts.push(`<div class="tip-row"><span>生命</span><b>+${d.hp * times}</b></div>`);
    }
    if (d.ep) {
      if (cc) {
        const total = d.ep * times;
        const next = Math.max(0, Math.min(cc.epMax, cc.ep + total));
        const got = next - cc.ep;
        parts.push(`<div class="tip-row"><span>精力</span><b><span class="tip-cmp ${got > 0 ? 'up' : (got < 0 ? 'down' : 'same')}">${got > 0 ? '+' : ''}${got}</span></b></div>`);
        parts.push(`<div class="tip-cur">${cc.ep}/${cc.epMax} → ${next}/${cc.epMax}</div>`);
      } else parts.push(`<div class="tip-row"><span>精力</span><b>${d.ep > 0 ? '+' : ''}${d.ep * times}</b></div>`);
    }
    if (d.buff) {
      for (const k in d.buff) {
        parts.push(`<div class="tip-row"><span>${META.attrNames[k]}（本局）</span><b>${d.buff[k] > 0 ? '+' : ''}${d.buff[k]}</b></div>`);
      }
      parts.push(attrNotes(Object.keys(d.buff)));
    }
    if (d.perm) {
      for (const k in d.perm) {
        parts.push(`<div class="tip-row"><span>${META.attrNames[k]}（永久）</span><b>+${d.perm[k]}</b></div>`);
      }
      parts.push(attrNotes(Object.keys(d.perm)));
    }
    if (d.setStatus && META.status && META.status[d.setStatus]) {
      const st = META.status[d.setStatus];
      parts.push(`<div class="tip-note">状态：${esc(st.name)}（5 分钟）<br>${esc(st.desc)}</div>`);
    }
    if (d.cureStatus) {
      const names = d.cureStatus.map(x => (META.status[x] ? META.status[x].name : x)).join('、');
      parts.push(`<div class="tip-note">解除状态：${esc(names)}</div>`);
    }
  } else if (d.type === 'material') {
    const used = (META.recipes || []).filter(r => r.inp.some(([id]) => id === itemId));
    if (used.length) {
      parts.push('<div class="tip-sep"></div>');
      parts.push(`<div class="tip-use">用于合成：${used.slice(0, 6).map(r => esc(r.name)).join('、')}${used.length > 6 ? ' 等' : ''}</div>`);
    } else {
      parts.push('<div class="tip-use">暂时没有配方用到它，可以卖给商人</div>');
    }
  } else if (d.type === 'ammo') {
    const guns = Object.values(META.items).filter(i => i.type === 'weapon' && i.ammo === itemId);
    parts.push('<div class="tip-sep"></div>');
    parts.push(`<div class="tip-row"><span>可堆叠</span><b>${d.stack}</b></div>`);
    if (guns.length) {
      parts.push(`<div class="tip-use">适用武器：${guns.slice(0, 5).map(g => esc(g.name)).join('、')}${guns.length > 5 ? ' 等' : ''}</div>`);
    }
  } else if (d.type === 'throwable') {
    parts.push('<div class="tip-sep"></div>');
    if (d.dmg) parts.push(tipRow('伤害', d.dmg, null, 'high'));
    if (d.noise) parts.push(tipRow('噪音', d.noise, null, 'low'));
    parts.push('<div class="tip-use">遭遇或战斗中投掷使用</div>');
  } else if (d.type === 'buff') {
    parts.push('<div class="tip-sep"></div>');
    if (d.defBonus) parts.push(`<div class="tip-row"><span>防御</span><b>+${d.defBonus}</b></div>`);
    if (d.accBonus) parts.push(`<div class="tip-row"><span>命中</span><b>+${d.accBonus}%</b></div>`);
    if (d.lukBonus) parts.push(`<div class="tip-row"><span>幸运</span><b>+${d.lukBonus}</b></div>`);
    if (d.noiseCut) parts.push(`<div class="tip-row"><span>降噪</span><b>-${d.noiseCut}</b></div>`);
    if (d.lukBonus) parts.push(attrNotes(['luk']));
    parts.push('<div class="tip-use">放在背包里即可生效</div>');
  }

  return parts.join('');
}

function positionTip(e) {
  const t = $('#tip');
  const pad = 16;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
  // 两边都夹进视口，别让提示框被屏幕边缘裁掉
  t.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  t.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}

function showTip(itemId, e) {
  const t = $('#tip');
  // 格子带强化等级时，提示里也要按强化后的数值算
  const tp = tipTarget && tipTarget.dataset ? (+tipTarget.dataset.tipPlus || 0) : 0;
  const entry = entryOfTarget(tipTarget);
  const html = itemId === 'craft' ? craftTipHtml() : tipHtml(itemId, tp, entry);
  if (!html) { hideTip(); return; }
  t.innerHTML = html;
  t.classList.remove('hidden');
  positionTip(e);
}

function hideTip() {
  const t = $('#tip');
  if (t) t.classList.add('hidden');
  tipTarget = null;
}

document.addEventListener('mousemove', e => {
  lastMouse = { clientX: e.clientX, clientY: e.clientY };
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) {
    if (tipTarget) hideTip();
    return;
  }
  if (el !== tipTarget) {
    tipTarget = el;
    showTip(el.dataset.tip, e);
  } else {
    positionTip(e);
  }
});

document.addEventListener('scroll', hideTip, true);

// ================= 登录 =================
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    authMode = t.dataset.tab;
    $('#btnAuth').textContent = authMode === 'login' ? '进入游戏' : '注册并进入游戏';
    $('#authMsg').textContent = '';
  };
});

$('#btnAuth').onclick = doAuth;
$('#inPass').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });

async function doAuth() {
  const u = $('#inUser').value.trim();
  const p = $('#inPass').value;
  const m = $('#authMsg');
  if (!u || !p) { m.textContent = '账号和密码都要填。'; return; }
  try {
    const j = await api('/api/' + authMode, { username: u, password: p });
    if (!j.ok) { m.textContent = j.msg || '失败'; return; }
    TOKEN = j.token; USERNAME = j.username;
    IS_GM = !!j.isGM;
    localStorage.setItem('br_token', TOKEN);
    localStorage.setItem('br_user', USERNAME);
    await enterGame();
  } catch (e) { m.textContent = e.message; }
}

function logout() {
  TOKEN = ''; USERNAME = ''; S = null;
  localStorage.removeItem('br_token');
  localStorage.removeItem('br_user');
  clearTimers();
  $('#gameScreen').classList.add('hidden');
  $('#modal').classList.add('hidden');
  lobbyState = null;
  showLobby(null);
}

function clearTimers() {
  if (rankTimer) clearInterval(rankTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (tickTimer) clearInterval(tickTimer);
  if (lobbyTimer) clearInterval(lobbyTimer);
  rankTimer = pollTimer = tickTimer = lobbyTimer = null;
}

$('#btnLogout').onclick = () => { api('/api/logout', {}).catch(() => {}); logout(); };

// ================= 进入 =================
async function enterGame() {
  if (!META) {
    const m = await api('/api/meta');
    META = m.meta;
    window.META = META;   // pixel.js 通过 window.META 读物品定义，必须同步
    IS_GM = !!m.isGM;
  }
  const st = await api('/api/state');
  ROUND = st.round;
  IS_GM = !!st.isGM;

  $('#tUser').textContent = USERNAME;

  if (st.hasSave && st.state) {
    S = st.state;
    if (S.char.alive === false || S.scene === 'dead') {
      showDeadWait(st);
      startTimers();
      return;
    }
    showGame();
    render();
    startTimers();
    // 移动端进游戏时回到顶部，避免浏览器恢复上次滚动位置
    requestAnimationFrame(() => {
      const lay = document.querySelector('.layout');
      if (lay) lay.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  } else {
    S = null;
    showLobby(st);
  }
  requestAnimationFrame(loop);
}

function showGame() {
  if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null; }
  roundOverShown = false;   // 新一轮开始了，允许再次触发结算切换
  $('#lobbyScreen').classList.add('hidden');
  $('#gameScreen').classList.remove('hidden');
}

// ================= 大厅（登录 + 看板 + 成就榜 + 开局状态） =================
// 以前这里是个只能点「刷新」的死界面：新玩家不知道这游戏在干嘛、上一轮谁赢了、
// 现在能不能进。现在把登录、看板、成就榜、开局状态和倒计时全放到一页里。
let lobbyData = null;      // /api/lobby 的结果
let lobbyState = null;     // /api/state 的结果（判断有没有存档）
let boardSig = '';         // 看板内容签名，没变就不重建 DOM
let achSig = '';           // 成就榜内容签名

// 胜负判定：reason 只说明「怎么结束的」，这里补上「算谁赢」和「为什么」
// boss / sevenwa 有明确赢家 → 胜利；wiped 全灭 → 失败；
// timeout 没人杀掉广播员也没人逃出去 → 时间到（不分胜负）；manual 是管理员中止
const VERDICT = {
  boss:    { v: '胜利', cls: 'win',  why: '广播员被击杀',  tip: '判定依据：有玩家杀掉了钟楼上的广播员，通关。' },
  sevenwa: { v: '胜利', cls: 'win',  why: '七娃被带出油田', tip: '判定依据：有玩家带着七娃离开了油田，逃出去了。' },
  wiped:   { v: '失败', cls: 'lose', why: '全员出局',      tip: '判定依据：所有玩家都出局了，没人活下来。' },
  timeout: { v: '时间到', cls: 'time', why: '没人通关',    tip: '判定依据：时间耗尽，没人杀掉广播员，也没人带七娃离开。' },
  manual:  { v: '中止', cls: 'void', why: '管理员结束',    tip: '被管理员手动结束，不计胜负。' },
};

function fmtClock(ms) {
  const t = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

// 看板上的时间：同一天只显示一次日期，跨天就各带日期
function fmtHM(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtRange(start, end) {
  if (!start && !end) return '';
  if (!start) return `结束 ${fmtHM(end)}`;
  if (!end) return `开始 ${fmtHM(start)}`;
  const s = new Date(start), e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const p = n => String(n).padStart(2, '0');
  return sameDay
    ? `${fmtHM(start)} → ${p(e.getHours())}:${p(e.getMinutes())}`
    : `${fmtHM(start)} → ${fmtHM(end)}`;
}

// lite=true：只取轮次状态和在场人数。称号图鉴（4.5KB）是静态的，每 3 秒重发纯浪费。
async function loadLobby(lite) {
  try {
    const j = await api('/api/lobby' + (lite ? '?lite=1' : ''));
    if (j && j.ok) {
      if (lite && lobbyData) {
        lobbyData.now = j.now;
        lobbyData.round = j.round;
        lobbyData.online = j.online;
      } else {
        lobbyData = j;
      }
    }
  } catch (e) { /* 断网时保留上一次的数据，别把页面清空 */ }
  return lobbyData;
}

function renderLobbyHead() {
  const st = $('#lobbyState'), tm = $('#lobbyTimer');
  if (!st) return;
  if (!lobbyData) { st.textContent = '连接中…'; st.className = ''; tm.textContent = ''; return; }
  const r = lobbyData.round;
  if (r.state === 'running') {
    st.textContent = `第 ${r.id} 轮 · 进行中`;
    st.className = 'lh-live';
    tm.textContent = `剩 ${fmtClock(r.leftMs)} · ${lobbyData.online} 人在场`;
  } else if (r.state === 'ended') {
    st.textContent = `第 ${r.id} 轮 · 已结束`;
    st.className = 'lh-over';
    tm.textContent = r.nextInMs > 0 ? `下一轮 ${fmtClock(r.nextInMs)} 后` : '等待管理员开下一轮';
  } else {
    st.textContent = '等待开局';
    st.className = '';
    tm.textContent = r.nextInMs > 0 ? `${fmtClock(r.nextInMs)} 后开始` : '管理员随时会开';
  }
}

function renderLobbyBoard() {
  const box = $('#lobbyBoard');
  if (!box) return;
  const list = (lobbyData && lobbyData.history) || [];
  if (!list.length) {
    box.innerHTML = '<div class="hint">还没有历史对局。第一轮打完，这里就会有记录。</div>';
    boardSig = '';
    return;
  }
  const sig = JSON.stringify(list);
  if (sig === boardSig) return;      // 内容没变就别重建，否则会打断悬浮/选中状态
  boardSig = sig;

  // 顶部小计：近 N 轮赢了几次、输了几次
  const tally = { win: 0, lose: 0, time: 0, void: 0 };
  for (const h of list) {
    const vd = VERDICT[h.reason] || VERDICT.manual;
    tally[vd.cls]++;
  }
  const sub = $('#boardSub');
  if (sub) {
    sub.textContent = `胜 ${tally.win} · 败 ${tally.lose}` + (tally.time ? ` · 时间到 ${tally.time}` : '');
  }

  box.innerHTML = list.map(h => {
    const vd = VERDICT[h.reason] || { v: '结束', cls: 'void', why: h.reason || '结束', tip: '' };
    const durMin = (h.startedAt && h.endedAt) ? Math.round((h.endedAt - h.startedAt) / 60000) : 0;
    // 前三名：名次做成小方块徽章，分数后面明确写「分」
    const top = (h.top || []).slice(0, 3).map((p, i) =>
      `<span class="tk"><em class="rk r${i + 1}">${i + 1}</em><span class="nm">${esc(p.name)}</span><b>${p.score}</b><i>分</i></span>`
    ).join('');
    return `<div class="brow">
      <div class="br-head">
        <span class="vd vd-${vd.cls}" data-hint="${esc(vd.tip)}">${esc(vd.v)}</span>
        <span class="br-id">#${h.roundId}</span>
        <span class="br-reason">${esc(vd.why)}</span>
        <span class="br-meta">
          ${durMin ? `<span>时长 ${durMin} 分</span>` : ''}
          <span>${h.players} 人参与</span>
          <span class="br-time">${esc(fmtRange(h.startedAt, h.endedAt))}</span>
        </span>
      </div>
      <div class="br-top">${top || '<i class="dim">没有记录</i>'}</div>
      <div class="br-detail">${(h.top || []).map((p, i) => `
        <div class="bd-row">
          <em class="bd-rk${i === 0 ? ' bd1' : ''}">${i + 1}</em>
          <span class="bd-nm">${esc(p.name)}</span>
          <b class="bd-sc">${p.score || 0}</b><i class="bd-unit">分</i>
          <span class="bd-meta">${p.kills || 0} 杀 · ${p.turn || 0} 回合${p.boss ? ' · 杀过 BOSS' : ''}${p.alive ? '' : ' · 出局'}</span>
        </div>`).join('') || '<div class="bd-row dim">没有记录</div>'}</div>
      <div class="bd-tip">点击展开全部 ${(h.top || []).length} 人</div>
    </div>`;
  }).join('');
}

function renderLobbyAch() {
  const box = $('#lobbyAch');
  if (!box) return;
  const cat = (lobbyData && lobbyData.catalog) || [];
  if (!cat.length) {
    box.innerHTML = '<div class="hint">称号数据加载中…</div>';
    achSig = '';
    return;
  }
  const un = new Set((lobbyData && lobbyData.unlocked) || []);
  const cnts = (lobbyData && lobbyData.titleCount) || {};
  const sig = cat.length + '|' + [...un].sort().join(',') + '|' + JSON.stringify(cnts);
  if (sig === achSig) return;
  achSig = sig;

  const sub = $('#achSub');
  if (sub) sub.textContent = `已解锁 ${un.size} / ${cat.length}`;

  const cats = (lobbyData && lobbyData.cats) || [];
  let html = '';
  for (const c of cats) {
    const items = cat.filter(a => a.c === c);
    if (!items.length) continue;
    const got = items.filter(a => un.has(a.id)).length;
    html += `<div class="ach-cat"><span>${esc(c)}</span><em>${got}/${items.length}</em></div>`;
    html += '<div class="ach-grid">' + items.map(a => {
      const has = un.has(a.id);
      // 神秘类的没解锁就藏名字，留个念想
      const hidden = !has && a.c === '神秘';
      const stars = '★'.repeat(a.t) + '☆'.repeat(Math.max(0, 4 - a.t));
      const cnt = cnts[a.id] || 0;
      const tip = hidden
        ? `???\n${a.c} · ${stars}\n还没有人拿到过这个称号。`
        : `${a.n}\n${a.c} · ${stars}\n${a.d}\n条件：${a.h}\n${cnt ? `已解锁 · ${cnt} 人拿过` : '还没人拿过'}`;
      return `<div class="achrow${has ? ' got' : ''}" data-id="${esc(a.id)}" data-hint="${esc(tip)}">
        <span class="an">${esc(hidden ? '???' : a.n)}</span>
        <span class="as">${stars}</span>
      </div>`;
    }).join('') + '</div>';
  }
  box.innerHTML = html;
}

// 轮次刚结束时在顶部横一条：这是「这个服还活着」的最直接信号
function renderLobbyBanner() {
  const el = $('#lobbyBanner');
  if (!el) return;
  const d = lobbyData;
  const r = d && d.round;
  if (!r || r.state !== 'ended' || !r.endedAt) { el.classList.add('hidden'); return; }
  const ago = (d.now || Date.now()) - r.endedAt;
  if (ago > 90000) { el.classList.add('hidden'); return; }   // 只挂 90 秒，之后交给看板
  const vd = VERDICT[r.endReason] || { v: '结束', cls: 'void', why: '' };
  const h0 = (d.history || [])[0];
  const champ = h0 && h0.roundId === r.id ? (h0.top || [])[0] : null;
  el.className = `lobby-banner lb-${vd.cls}`;
  el.innerHTML = `<b>第 ${r.id} 轮结束</b>`
    + `<span class="lb-vd">${esc(vd.v)}</span>`
    + `<span class="lb-why">${esc(vd.why)}</span>`
    + (champ ? `<span class="lb-champ">冠军 ${esc(champ.name)} · ${champ.score} 分</span>` : '')
    + `<span class="lb-next">${r.nextInMs > 0 ? fmtClock(r.nextInMs) + ' 后开下一轮' : '等管理员开下一轮'}</span>`;
}

function renderLobbyMe() {
  const login = $('#lobbyLogin'), me = $('#lobbyMe');
  if (!login || !me) return;
  const loggedIn = !!TOKEN;
  login.classList.toggle('hidden', loggedIn);
  me.classList.toggle('hidden', !loggedIn);
  const uEl = $('#lobbyUser');
  if (uEl) uEl.textContent = loggedIn ? USERNAME : '';   // 顶栏用户名（账号栏移到上面后可能没有这个元素）
  if (!loggedIn) return;

  const r = (lobbyData && lobbyData.round) || ROUND || {};
  // 注意：大厅轮询用 ?lobby=1，不带完整快照，所以这里只能看 hasSave / dead 两个标记
  const hasSave = !!(lobbyState && lobbyState.hasSave);
  const dead = !!(lobbyState && lobbyState.dead);
  $('#lmUser').textContent = `你好，${USERNAME}`;
  const hint = $('#lmHint'), acts = $('#lmActions'), rep = $('#lmReport');
  acts.innerHTML = '';
  rep.innerHTML = '';

  const btn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.textContent = label;
    b.onclick = fn;
    acts.appendChild(b);
  };

  if (r.state === 'running' && dead) {
    hint.textContent = '你出局了 —— 这一轮还能看着别人打完';
    if (META) btn('看排行榜', '', () => openRankModal());
  } else if (r.state === 'running' && !hasSave) {
    hint.textContent = `第 ${r.id} 轮正在进行 · ${lobbyData ? lobbyData.online : '?'} 人在场`;
    btn('加入本局', 'primary', joinRound);
  } else if (r.state === 'running' && hasSave) {
    hint.textContent = `第 ${r.id} 轮正在进行`;
    btn('进入游戏', 'primary', () => enterGame());
  } else if (r.state === 'ended') {
    hint.textContent = (lobbyData && lobbyData.round.nextInMs > 0)
      ? `下一轮 ${fmtClock(lobbyData.round.nextInMs)} 后开始`
      : '等待管理员开始下一轮';
    if (META) btn('看排行榜', '', () => openRankModal());
  } else {
    hint.textContent = '还没有开局，你可以先开一轮';
    btn('加入对局', 'primary', joinRound);
  }

  // 切换账号 = 退出登录回到大厅的登录框
  const sw = document.createElement('button');
  sw.className = 'btn tiny lm-switch';
  sw.textContent = '切换账号';
  sw.onclick = switchAccount;
  acts.appendChild(sw);

  // 个人跨轮战绩（career 是每轮结束时累加的）
  const car = (lobbyState && lobbyState.career) || {};
  const rec = (lobbyState && lobbyState.recent) || [];
  const stEl = $('#lmStats'), rcEl = $('#lmRecent');
  if (stEl) {
    stEl.textContent = car.rounds
      ? `累计 ${car.rounds} 轮 · 胜 ${car.wins || 0} 次 · 击杀 ${car.kills || 0} · 最好 ${car.bestScore || 0} 分`
      : '还没有战绩，这一轮是你的第一场';
  }
  if (rcEl) {
    rcEl.innerHTML = rec.length
      ? '<em>最近：</em>' + rec.map(x => {
          const vd = VERDICT[x.reason] || { v: '结束', cls: 'void' };
          return `<span class="rc rc-${vd.cls}">${esc(vd.v)} #${x.roundId} · 第${x.rank}名 · ${x.score}分</span>`;
        }).join('')
      : '';
  }

  // 上一轮战报（结算页搬过来的，现在常驻在大厅底部）
  const lines = (lobbyState && lobbyState.report) || [];
  const sum = (lobbyState && lobbyState.summary) || null;
  if (lines.length) {
    rep.innerHTML = `<div class="report-box">
      <div class="report-title">战 报</div>
      ${lines.map(l => `<p class="report-line">${esc(l)}</p>`).join('')}
      ${sum ? `<div class="report-sum">${sum.turn} 回合 · ${sum.kills} 杀 · Lv.${sum.level} · ¥${sum.gold}</div>` : ''}
    </div>`;
  }
}

async function switchAccount() {
  try { await api('/api/logout', {}); } catch (e) { /* 网络问题也照样退出 */ }
  TOKEN = ''; USERNAME = ''; S = null; IS_GM = false;
  localStorage.removeItem('br_token');
  localStorage.removeItem('br_user');
  clearTimers();
  lobbyState = null;
  $('#lobbyLogin') && $('#inUser') && ($('#inUser').value = '');
  $('#authMsg') && ($('#authMsg').textContent = '');
  showLobby(null);
}

// 点称号 → 弹出「谁拿到的」
function openTitleDetail(id) {
  const cat = ((lobbyData && lobbyData.catalog) || []).find(a => a.id === id);
  if (!cat) return;
  const owners = ((lobbyData && lobbyData.titleOwners) || {})[id] || [];
  const stars = '★'.repeat(cat.t) + '☆'.repeat(Math.max(0, 4 - cat.t));
  openModal(cat.n, `
    <div class="title-detail">
      <div class="td-sub">${esc(cat.c)} · <span class="td-star">${stars}</span></div>
      <p class="td-desc">${esc(cat.d)}</p>
      <p class="td-cond">条件：${esc(cat.h)}</p>
      <div class="td-owners">
        ${owners.length
          ? owners.map(o => `<span>${esc(o)}</span>`).join('')
          : '<span class="dim">还没有人拿到</span>'}
      </div>
    </div>`, [{ label: '知道了', cls: 'primary', def: true, fn: closeModal }]);
}

// 大厅里的点击委托：看板行展开/收起，图鉴行看名单。
// 绑在 document 上而不是元素上 —— 两个列表每次刷新都会重建 DOM。
document.addEventListener('click', e => {
  if (!e.target.closest) return;
  const row = e.target.closest('#lobbyBoard .brow');
  if (row) { row.classList.toggle('open'); return; }
  const ach = e.target.closest('#lobbyAch .achrow');
  if (ach && ach.dataset.id) openTitleDetail(ach.dataset.id);
});

async function joinRound() {
  const j = await api('/api/newgame', { name: USERNAME });
  if (!j.ok) { toast(j.msg || '失败'); return; }
  S = j.state; ROUND = j.round; showGame(); render(); startTimers();
}

async function showLobby(st) {
  $('#gameScreen').classList.add('hidden');
  $('#lobbyScreen').classList.remove('hidden');
  if (st) lobbyState = st;

  // 已登录但没带状态（比如从游戏里返回大厅）→ 先拉一次。
  // 否则按钮会先按上一次的 hasSave 渲染，3 秒后轮询回来才纠正，看起来像闪了一下。
  if (TOKEN && !st) {
    try {
      lobbyState = await api('/api/state?lobby=1');
      ROUND = lobbyState.round;
    } catch (e) { /* 拉不到就等轮询 */ }
  }

  await loadLobby();
  renderLobbyHead();
  renderLobbyBanner();
  renderLobbyBoard();
  renderLobbyAch();
  renderLobbyMe();

  // 每 3 秒自己刷一次：倒计时、在场人数、新一轮是否开始，全都不用点「刷新」
  if (lobbyTimer) clearInterval(lobbyTimer);
  lobbyTimer = setInterval(async () => {
    const before = lobbyData ? lobbyData.round.id + '|' + lobbyData.round.state : '';
    await loadLobby(true);
    const after = lobbyData ? lobbyData.round.id + '|' + lobbyData.round.state : '';
    if (before !== after) {
      await loadLobby(false);   // 轮次变了（开局/结束）才重新拉看板和图鉴
      renderLobbyBoard();
      renderLobbyAch();
    }
    renderLobbyHead();
    renderLobbyBanner();
    if (TOKEN) {
      try {
        const s2 = await api('/api/state?lobby=1');
        lobbyState = s2;
        ROUND = s2.round;
        renderLobbyMe();
      } catch (e) { /* 网络抖动忽略 */ }
    }
  }, 3000);
}

// 轮次结束 / 存档作废 → 立刻切到结算（等待）画面。
// 以前只 toast 一句「对局已结束。」，人还留在死掉的游戏界面里，只能手动刷新。
let roundOverShown = false;
let endPolled = false;   // 倒计时归零后只问一次，别每秒打后端
function roundOverTo(st) {
  if (roundOverShown) return;
  roundOverShown = true;
  const wasPlaying = !!S;
  S = null;
  ROUND = (st && st.round) || ROUND;
  clearTimers();
  closeModal(true);
  showLobby(st || { round: ROUND });
  if (wasPlaying) toast('本轮结束，正在结算…');
}

// 轮询自己的状态：被别的玩家袭击时，这边不用动也能收到提示；
// 轮次结束也要靠它把人从游戏界面拉回结算画面
function startTimers() {
  clearTimers();
  endPolled = false;
  poll();
  // 合并轮询：2.5 秒一次，其中每两次带一次完整状态（≈5 秒），
  // 原来是 chatPoll 2.2s + pollState 5s 两个定时器两个请求
  pollTimer = setInterval(poll, 2500);
  loadRank();
  rankTimer = setInterval(() => { if (S) loadRank(); }, 8000);
  tickTimer = setInterval(tickRound, 1000);
}

function tickRound() {
  if (!ROUND || !S) return;
  // 黑市常驻提示：光靠公屏播报记不住，人走到那儿可能已经收摊了
  const zMk = $('#zMarket');
  if (zMk) {
    const mkLeft = S.market ? S.market.until - Date.now() : 0;
    if (S.market && mkLeft > 0) {
      const zn = ((META.map.find(z => z.id === S.market.zone)) || {}).name || '未知';
      const left = mkLeft;
      const here = S.char.pos === S.market.zone;
      zMk.textContent = here ? `黑市 ${fmtTime(left)}` : `黑市 ${zn} ${fmtTime(left)}`;
      zMk.classList.remove('hidden');
      zMk.classList.toggle('here', here);
    } else {
      zMk.classList.add('hidden');
    }
  }
  // 状态倒计时
  const st = S.char.status;
  if (st && st.id !== 'normal' && st.until) {
    const left = st.until - Date.now();
    const el = $('#statusLeft');
    if (el) el.textContent = left > 0 ? fmtTime(left) : '已失效';
  }
  const r = ROUND;
  if (r.state !== 'running') {
    $('#roundPill').className = 'round-pill ended';
    $('#tLeft').textContent = '已结束';
    return;
  }
  const end = r.extended ? r.hardEndsAt : r.endsAt;
  const left = end - Date.now();
  $('#tLeft').textContent = fmtTime(left);
  $('#roundPill').className = 'round-pill' + (r.extended ? ' ext' : '');
  if (left <= 0) {
    // 倒计时归零：立刻问一次后端，结束了就切结算画面（不用等 5 秒的轮询）
    if (endPolled) return;
    endPolled = true;
    api('/api/state').then(j => {
      if (j.round) ROUND = j.round;
      if (j.round && j.round.state === 'ended') { roundOverTo(j); return; }
      // 服务器每 5 秒才 tick 一次，还没结束就过一秒再问
      endPolled = false;
    }).catch(() => { endPolled = false; });
  }
}

// ================= 渲染 =================
let lastT = 0;
// ================= 天气图层 + 受击特效 =================
const WX_CANVAS = document.getElementById('wx');
const WX_CTX = WX_CANVAS ? WX_CANVAS.getContext('2d') : null;
let wxKind = '';
let wxP = [];
let wxLastT = 0, heroLastHp = null;

const WX_CFG = {
  clear:    { n: 16, cls: 'wx-clear' },
  overcast: { n: 0,  cls: 'wx-overcast' },
  windy:    { n: 70, cls: 'wx-windy' },
  rain:     { n: 220, cls: 'wx-rain' },
  fog:      { n: 8,  cls: 'wx-fog' },
  sand:     { n: 150, cls: 'wx-sand' },
};

function wxNew(kind) {
  const W = 800, H = 800;
  if (kind === 'rain') return { x: Math.random() * W, y: Math.random() * H, v: 9 + Math.random() * 7, l: 10 + Math.random() * 10, a: 0.25 + Math.random() * 0.35 };
  if (kind === 'windy') return { x: Math.random() * W, y: Math.random() * H, v: 7 + Math.random() * 9, l: 24 + Math.random() * 40, a: 0.1 + Math.random() * 0.18 };
  if (kind === 'sand') return { x: Math.random() * W, y: Math.random() * H, v: 2 + Math.random() * 3.5, r: 1 + Math.random() * 2, a: 0.15 + Math.random() * 0.3, ph: Math.random() * 6.28 };
  if (kind === 'fog') return { x: Math.random() * W, y: Math.random() * H, v: 0.25 + Math.random() * 0.5, r: 120 + Math.random() * 160, a: 0.05 + Math.random() * 0.08 };
  return { x: Math.random() * W, y: Math.random() * H, v: 0.15 + Math.random() * 0.35, r: 2 + Math.random() * 5, a: 0.15 + Math.random() * 0.35, ph: Math.random() * 6.28 };
}

function wxReset(kind) {
  wxKind = kind || 'clear';
  const cfg = WX_CFG[wxKind] || WX_CFG.clear;
  wxP = [];
  for (let i = 0; i < cfg.n; i++) wxP.push(wxNew(wxKind));
  const wrap = document.querySelector('.map-wrap');
  if (wrap) {
    wrap.classList.remove('wx-clear', 'wx-overcast', 'wx-windy', 'wx-rain', 'wx-fog', 'wx-sand');
    wrap.classList.add(cfg.cls);
  }
}

function drawWeather(dt) {
  if (!WX_CTX) return;
  const W = 800, H = 800;
  WX_CTX.clearRect(0, 0, W, H);
  if (!wxKind) return;
  const step = dt / 16.67;   // 以 60fps 为基准

  if (wxKind === 'clear') {
    for (const p of wxP) {
      p.y -= p.v * step; p.ph += 0.01 * step;
      if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
      const g = WX_CTX.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      g.addColorStop(0, `rgba(255,214,130,${p.a})`);
      g.addColorStop(1, 'rgba(255,214,130,0)');
      WX_CTX.fillStyle = g;
      WX_CTX.beginPath(); WX_CTX.arc(p.x, p.y, p.r * 6, 0, 6.283); WX_CTX.fill();
    }
    return;
  }
  if (wxKind === 'overcast') return;   // 阴天只靠边框压暗

  if (wxKind === 'rain') {
    WX_CTX.lineWidth = 1.4;
    for (const p of wxP) {
      p.y += p.v * step; p.x += 1.2 * step;
      if (p.y > H) { p.y = -20; p.x = Math.random() * W; }
      if (p.x > W) p.x -= W;
      WX_CTX.strokeStyle = `rgba(150,190,230,${p.a})`;
      WX_CTX.beginPath(); WX_CTX.moveTo(p.x, p.y); WX_CTX.lineTo(p.x + 2, p.y + p.l); WX_CTX.stroke();
    }
    // 偶尔一道闪电
    if (Math.random() < 0.004) {
      WX_CTX.fillStyle = 'rgba(200,220,255,0.22)';
      WX_CTX.fillRect(0, 0, W, H);
    }
    return;
  }
  if (wxKind === 'windy') {
    WX_CTX.lineWidth = 1.2;
    for (const p of wxP) {
      p.x += p.v * step;
      if (p.x > W + 40) { p.x = -40; p.y = Math.random() * H; }
      WX_CTX.strokeStyle = `rgba(200,220,220,${p.a})`;
      WX_CTX.beginPath(); WX_CTX.moveTo(p.x, p.y); WX_CTX.lineTo(p.x - p.l, p.y); WX_CTX.stroke();
    }
    return;
  }
  if (wxKind === 'sand') {
    for (const p of wxP) {
      p.x += p.v * step; p.ph += 0.03 * step;
      p.y += Math.sin(p.ph) * 0.6 * step;
      if (p.x > W + 10) { p.x = -10; p.y = Math.random() * H; }
      WX_CTX.fillStyle = `rgba(200,160,100,${p.a})`;
      WX_CTX.fillRect(p.x, p.y, p.r, p.r);
    }
    WX_CTX.fillStyle = 'rgba(180,140,80,0.06)';
    WX_CTX.fillRect(0, 0, W, H);
    return;
  }
  if (wxKind === 'fog') {
    for (const p of wxP) {
      p.x += p.v * step;
      if (p.x - p.r > W) p.x = -p.r;
      const g = WX_CTX.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(200,205,205,${p.a})`);
      g.addColorStop(1, 'rgba(200,205,205,0)');
      WX_CTX.fillStyle = g;
      WX_CTX.beginPath(); WX_CTX.arc(p.x, p.y, p.r, 0, 6.283); WX_CTX.fill();
    }
  }
}

// 受击：抖一下，大伤害再加全屏闪。
// 左上角头像和战斗窗口里的立绘都要抖 —— 所以抽成通用函数，两边共用
function shakeStage(el, dmg) {
  if (!el) return;
  el.classList.remove('hit', 'hit-hard');
  void el.offsetWidth;   // 强制重排，动画能重播
  el.classList.add(dmg >= 15 ? 'hit-hard' : 'hit');
  clearTimeout(el._shakeT);
  el._shakeT = setTimeout(() => el.classList.remove('hit', 'hit-hard'), 620);
}

function flashScreen() {
  const f = document.getElementById('fxFlash');
  if (!f) return;
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 520);
}

function hitFx(dmg) {
  shakeStage(document.getElementById('heroStage'), dmg);
  shakeStage(document.getElementById('btHeroStage'), dmg);
  if (dmg >= 15) flashScreen();
}

// 血量 / 精力 / 状态 → 舞台特效类。
// 左上角头像和战斗窗口共用这一套，保证「同一个状态，两处看起来一样」
function stageFxClass(c, look) {
  const st = (c.status && c.status.id) || 'normal';
  let s = 'mood-' + (look.mood || 'good');
  if (look.critical) s += ' vital-crit';
  if (st !== 'normal') s += ' st-' + st;
  const hpPct = c.hpMax ? c.hp / c.hpMax : 1;
  const epPct = c.epMax ? c.ep / c.epMax : 1;
  if (hpPct >= 0.999 && epPct >= 0.999) s += ' full-aura';   // 满状态：绿色跑马灯
  return s;
}

function loop(t) {
  const dt = Math.min(60, t - (wxLastT || t));
  wxLastT = t;
  if (S) { drawMap(t); drawWeather(dt); }
  requestAnimationFrame(loop);
}

function render() {
  if (!S) return;
  const c = S.char;
  // 黑市：只有站在那个区块里才显示按钮
  const mkt = S.market;
  const atMarket = !!(mkt && c.pos === mkt.zone && S.scene === 'map');
  $('#btnMarket').classList.toggle('hidden', !atMarket);
  // 佣兵招募点：固定区块，走到就有按钮
  const atCamp = !!(META.merc && c.pos === META.merc.zone && S.scene === 'map');
  $('#btnMerc').classList.toggle('hidden', !atCamp);
  $('#tTurn').textContent = c.turn;
  $('#tKills').textContent = c.kills;
  $('#tGold').textContent = '¥' + (c.gold || 0);
  if (ROUND) {
    $('#tRound').textContent = 'R' + ROUND.id;
    $('#roundPill').className = 'round-pill' + (ROUND.extended ? ' ext' : '') + (ROUND.state === 'ended' ? ' ended' : '');
  }
  // 天气
  if (S.weather && S.weather.id !== wxKind) wxReset(S.weather.id);
  const wp = $('#weatherPill');
  if (wp && S.weather) {
    const w = S.weather;
    wp.innerHTML = `<span class="wicon">${w.icon}</span>${esc(w.name)}`;
    wp.style.color = w.color;
    wp.title = w.tip ? `${w.desc}（${w.tip}）` : w.desc;
  }
  $('#invTag').classList.toggle('hidden', !c.invincible);
  $('#hostVal').textContent = (c.hostages || []).length;
  $('#achCount').textContent = Object.keys(c.achievements || {}).length;

  // 等级与经验
  const lv = c.level || 1;
  const lvBadge = $('#lvBadge');
  if (lvBadge) {
    lvBadge.textContent = 'Lv.' + lv;
    if (lv >= 30) {
      $('#lvExpBar').style.width = '100%';
      $('#lvExpTxt').textContent = 'MAX';
    } else {
      const need = c.expNext || 40;
      $('#lvExpBar').style.width = Math.min(100, (c.exp / need) * 100) + '%';
      $('#lvExpTxt').textContent = `${c.exp}/${need}`;
    }
  }

  renderZone();
  renderChar();
  renderLog();
  renderModal();
  updateCraftDot();
  noticeLatestLog();
  updateHints();
}

// 剧情 / 人物 / 事件 / 互动结果 / 拾取 → 底部红字提示，跟右侧记录保持一致
let lastLogKey = '';
const NOTICE_KINDS = ['story', 'npc', 'good', 'bad', 'warn', 'loot'];
function noticeLatestLog() {
  const arr = (S && S.log) || [];
  if (!arr.length) return;
  // 先定位「上一次看到的那条」，它之后的全是新的
  let start = 0;
  if (lastLogKey) {
    const idx = arr.findIndex(l => ((l.t || 0) + '|' + (l.text || '')) === lastLogKey);
    start = idx >= 0 ? idx + 1 : Math.max(0, arr.length - 3);
  }
  const fresh = arr.slice(start);
  if (!fresh.length) return;
  const last = fresh[fresh.length - 1];
  lastLogKey = (last.t || 0) + '|' + (last.text || '');

  // 一批日志里取「最后一条值得弹的」：剧情后面常跟一句没标签的环境描写，不能因此吞掉提示。
  // 有损失（bad）优先弹损失——少东西比多东西更需要让玩家看见
  let pick = null, pickBad = null;
  for (const l of fresh) {
    if (!NOTICE_KINDS.includes(l.kind)) continue;
    if (String(l.text || '').startsWith('解锁称号')) continue;
    pick = l;
    if (l.kind === 'bad') pickBad = l;
  }
  if (pickBad) pick = pickBad;
  if (!pick) return;
  const txt = String(pick.text || '');
  if (!txt) return;
  toast(txt.length > 64 ? txt.slice(0, 63) + '…' : txt);
}

// 血量/精力档位：>60 高 / 30-60 中 / 15-30 低 / <15 濒危。
// 左上角血条和战斗窗口血条都调它，保证两处的档位判断完全一致
function vitalStateOf(p) {
  return p < 0.15 ? 'crit' : (p < 0.3 ? 'low' : (p < 0.6 ? 'mid' : 'high'));
}

// 血条/精力条的三档外观：条本身发光，低血量闪，数字跟着变色
function applyVitalState(barSel, txtSel, state, full) {
  const fill = $(barSel), txt = $(txtSel);
  if (!fill) return;
  const bar = fill.parentElement;
  const wrap = bar && bar.parentElement;
  const cls = ['state-high', 'state-mid', 'state-low', 'state-crit'];
  if (bar) { bar.classList.remove(...cls); bar.classList.add('state-' + state); }
  // 外层 .vital 也带上，用来给「生命 / 精力」这几个字上色
  if (wrap && wrap.classList.contains('vital')) {
    wrap.classList.remove(...cls, 'state-full');
    wrap.classList.add('state-' + state);
    if (full) wrap.classList.add('state-full');
  }
  if (txt) {
    txt.classList.remove('low', 'crit');
    if (state === 'low') txt.classList.add('low');
    if (state === 'crit') txt.classList.add('crit');
  }
}

function renderZone() {
  const z = S.zone;
  const reg = META.regions[z.region];
  $('#zRegion').textContent = reg.name;
  $('#zRegion').style.background = reg.color;
  $('#zName').textContent = z.name;
  $('#zDesc').textContent = z.desc;
  const busy = S.scene !== 'map';
  $('#btnExplore').disabled = busy;
  $('#btnRest').disabled = busy;

  const hasShop = !!S.merchant;
  $('#zShop').classList.toggle('hidden', !hasShop);
  $('#btnShop').classList.toggle('hidden', !hasShop);
  $('#btnShop').disabled = busy;

  const hasNpc = !!S.npc;
  const npcBtn = $('#btnNpc');
  if (npcBtn) {
    npcBtn.classList.toggle('hidden', !hasNpc);
    npcBtn.disabled = busy;
    if (hasNpc) npcBtn.textContent = `交谈 · ${S.npc.name}`;
  }

  // 空投标记：不管人在哪都显示位置，站在空投区块上时高亮
  const sup = $('#zSupply');
  if (sup) {
    if (S.supplyZone) {
      sup.classList.remove('hidden');
      sup.classList.toggle('here', !!S.supplyHere);
      sup.textContent = S.supplyHere
        ? `空投在此 ${fmtTime(S.supplyLeftMs || 0)}`
        : `空投 ${S.supplyZone}`;
      sup.title = S.supplyHere
        ? '补给箱就在这个区块，点「探索」去翻'
        : `补给箱在「${S.supplyZone}」，${fmtTime(S.supplyLeftMs || 0)} 后收走`;
    } else {
      sup.classList.add('hidden');
    }
  }

  $('#bossMark').classList.toggle('hidden', !S.bossHere || !S.bossSpawned);
}

function renderChar() {
  const c = S.char;
  const cb = c.combat || {};

  const hpPct = c.hpMax ? c.hp / c.hpMax : 0;
  const epPct = c.epMax ? c.ep / c.epMax : 0;
  $('#hpTxt').textContent = `${c.hp}/${c.hpMax}`;
  $('#epTxt').textContent = `${c.ep}/${c.epMax}`;
  $('#hpBar').style.width = Math.max(0, hpPct * 100) + '%';
  $('#epBar').style.width = Math.max(0, epPct * 100) + '%';

  // 三档状态：>60 高 / 30-60 中 / 15-30 低 / <15 濒危（条会闪，数字变红）
  const allFull = hpPct >= 0.999 && epPct >= 0.999;   // 满血满精力 → 绿色跑马灯
  applyVitalState('#hpBar', '#hpTxt', vitalStateOf(hpPct), allFull);
  applyVitalState('#epBar', '#epTxt', vitalStateOf(epPct), allFull);

  // 实战数值（已计入装备与状态）
  $('#cAtk').textContent = cb.attack || 0;
  $('#cDef').textContent = cb.defense || 0;
  $('#cHit').textContent = (cb.hit || 0) + '%';
  $('#cCrit').textContent = (cb.crit || 0) + '%';

  // 武器耐久
  const wp = S.weapon;
  const wn = $('#wpnName'), wb = $('#wpnDurBar'), wt = $('#wpnDurTxt');
  if (wp) {
    wn.textContent = wp.name + (wp.plus ? ' +' + wp.plus : '');
    wn.style.color = wp.plus ? '#ffd76a' : '';
    const pct = wp.maxDur ? (wp.dur / wp.maxDur) * 100 : 0;
    wb.style.width = Math.max(0, pct) + '%';
    wb.className = pct <= 20 ? 'low' : (pct <= 50 ? 'mid' : '');
    wt.textContent = `${wp.dur}/${wp.maxDur}`;
    wt.style.color = pct <= 20 ? 'var(--bad)' : (pct <= 50 ? 'var(--accent)' : 'var(--dim)');
  } else {
    wn.textContent = '空手';
    wn.style.color = '';
    wb.style.width = '0%';
    wb.className = '';
    wt.textContent = '—';
    wt.style.color = 'var(--dim)';
  }

  $('#hostVal').textContent = (c.hostages || []).length;
  $('#goldVal').textContent = c.gold || 0;
  $('#bagCount').textContent = `${c.used}/${c.slots}`;

  const names = META.attrNames;
  const al = $('#attrList');
  al.innerHTML = '';
  const effectOf = {
    sta: () => `血 ${c.hpMax}`,
    str: () => `攻 ${cb.attack || 0}`,
    cha: () => `交涉 ${cb.spare || 0}%`,
    int: () => `合成 ${cb.craft || 0}%`,
    luk: () => `暴击 ${cb.crit || 0}%`,
  };
  for (const k of ['sta', 'str', 'cha', 'int', 'luk']) {
    const base = c.attrs[k], eff = c.eff[k];
    const diff = eff - base;
    const row = document.createElement('div');
    row.className = 'attr-row' + (base >= 100 ? ' maxed' : '');
    row.dataset.tip = 'attr_' + k;   // 悬停解释这个属性到底管什么
    row.innerHTML = `
      <span class="attr-name">${names[k]}</span>
      <span class="attr-num ${diff > 0 ? 'up' : (diff < 0 ? 'down' : '')}">${eff}</span>
      <div class="attr-track"><div class="attr-fill" style="width:${eff}%"></div></div>
      <span class="attr-effect">${effectOf[k]()}</span>`;
    al.appendChild(row);
  }

  const el = $('#equipList');
  el.innerHTML = '';
  const order = ['weapon', 'head', 'body', 'hands', 'legs', 'face', 'feet', 'bag'];
  let gearDef = 0, gearCount = 0;
  for (const slot of order) {
    const it = c.equip[slot];
    const d = document.createElement('div');
    d.className = 'equip-slot' + (it ? ' filled' : '');
    d.dataset.slot = slot;   // 武器槽要跨两列，名字最长
    const ip = it ? plusOfEntry(it) : 0;
    const idata = it ? META.items[it.id] : null;
    // +N 单独成一个 flex 项，别塞进会被省略号裁掉的名字里
    const nameHtml = it ? esc(idata.name) : '—';
    const plusHtml = ip ? `<i class="plus-tag">+${ip}</i>` : '';

    // 第二行：耐久 + 配套弹药。放在名字外面，否则会被 .es-name 的省略号裁掉
    const sub = [];
    if (slot === 'weapon' && it && S.weapon) {
      if (S.weapon.maxDur) {
        const pct = (S.weapon.dur / S.weapon.maxDur) * 100;
        const cls = pct <= 20 ? 'low' : (pct <= 50 ? 'mid' : '');
        sub.push(`<span class="dur ${cls}">耐久 ${S.weapon.dur}</span>`);
      }
      if (idata && idata.ammo) {
        const have = countAmmo(idata.ammo);
        const aname = (META.items[idata.ammo] || {}).name || '弹药';
        sub.push(`<span class="ammo-left ${have > 0 ? '' : 'none'}" title="${esc(aname)}">${have} 发</span>`);
      }
    }

    d.innerHTML = `<div class="es-top"><span class="es-key">${META.slotNames[slot]}</span>`
      + `<b class="es-name">${nameHtml}</b>${plusHtml}</div>`
      + (sub.length ? `<div class="es-sub">${sub.join('')}</div>` : '');
    // 点一下就能脱下来放回背包
    if (it) {
      d.dataset.tip = it.id;
      d.dataset.tipPlus = ip;
      d.title = '点击脱下';
      d.onclick = async () => {
        if (S.scene !== 'map') { toast('战斗中不能脱装备'); return; }
        const r = await doAct('unequip', { slot });
        if (r && r.ok === false && r.msg) toast(r.msg);
      };
    }
    el.appendChild(d);
    if (it && idata && idata.defense) {
      gearDef += effDefOf(it.id, ip);
      gearCount++;
    }
  }
  const foot = $('#equipFoot');
  if (foot) {
    foot.innerHTML = `<span>已穿 ${gearCount} 件 · 装备防御 <b>+${gearDef}</b></span>
      <span>实际防御 <b>${cb.defense || 0}</b></span>`;
  }

  // 状态
  const st = c.status || { id: 'normal', name: '正常', color: '#8a8a76', desc: '', leftMs: 0 };
  const tag = $('#statusTag');
  tag.textContent = st.name;
  tag.style.color = st.color;
  tag.classList.toggle('on', st.id !== 'normal');
  const left = st.leftMs > 0 ? fmtTime(st.leftMs) : '';
  const frozen = c.frozenLeftMs > 0 ? `冻结 ${Math.ceil(c.frozenLeftMs / 1000)}s` : '';
  $('#statusLeft').textContent = [left, frozen].filter(Boolean).join(' · ');
  $('#statusDesc').textContent = st.id === 'normal' ? '' : st.desc;

  // 主角形象（状态 / 装备 / 血量档位变了才重绘）
  const stage = $('#heroStage');
  if (stage && window.PX) {
    const look = PX.heroLook(c);
    const sig = JSON.stringify([st.id, look.mood, look.critical, look.expression, c.equip.weapon, c.equip.head, c.equip.body, c.equip.hands, c.equip.legs, c.equip.face, c.equip.feet]);
    // 特效类和战斗窗口共用 stageFxClass，两边永远一致
    stage.className = 'hero-stage ' + stageFxClass(c, look);
    if (sig !== heroSig) {
      heroSig = sig;
      stage.innerHTML = `<span class="hs-face">${esc(st.name)}</span>`
        + `<img class="px-art" src="${PX.personCanvas(look, 116, 155).toDataURL()}" width="116" height="155" alt="">`;
      const face = stage.querySelector('.hs-face');
      if (face) face.style.color = st.color;
    }
  }

  // 掉血 → 人物震动（必须放在 className 赋值之后，否则会被覆盖掉）
  if (heroLastHp != null && c.hp < heroLastHp) hitFx(heroLastHp - c.hp);
  heroLastHp = c.hp;
}

let heroSig = '';

const LOG_TAG = {
  sys: ['系统', 't-sys'],
  move: ['场景', 't-sys'],
  flavor: ['环境', 't-sys'],
  story: ['剧情', 't-story'],
  npc: ['人物', 't-npc'],
  battle: ['战斗', 't-battle'],
  loot: ['拾取', 't-loot'],
  ach: ['成就', 't-ach'],
  good: ['事件', 't-loot'],
  bad: ['事件', 't-battle'],
  warn: ['事件', 't-story'],
  info: ['', ''],
};

function renderLog() {
  const box = $('#logList');
  if (!box) return;   // 日志已经并进「信息」窗口，不再单独渲染
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = '';
  for (const l of S.log) {
    const d = document.createElement('div');
    d.className = 'log-item ' + (l.kind || 'info');
    const t = LOG_TAG[l.kind];
    if (t && t[0]) {
      const tag = document.createElement('span');
      tag.className = 'ltag ' + t[1];
      tag.textContent = t[0];
      d.appendChild(tag);
    }
    d.appendChild(document.createTextNode(l.text));
    box.appendChild(d);
  }
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

// ================= 像素地图 =================
function hash2(x, y, s) {
  let h = x * 374761393 + y * 668265263 + s * 1442695040;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

function drawMap(t) {
  if (!S || !META) return;
  const cur = S.zone;
  const nb = S.neighbors.map(n => `${n.x},${n.y}`);
  ctx.clearRect(0, 0, MAP_PX, MAP_PX);

  for (const z of META.map) {
    const px = z.x * CELL, py = z.y * CELL;
    const reg = META.regions[z.region];
    const isCur = z.x === cur.x && z.y === cur.y;
    const isNb = nb.includes(`${z.x},${z.y}`);

    let base = reg.color;
    if (!isCur && !isNb) base = shade(reg.color, -12);
    ctx.fillStyle = base;
    ctx.fillRect(px, py, CELL, CELL);

    for (let i = 0; i < 26; i++) {
      const rx = hash2(z.x * 7 + i, z.y * 13, i);
      const ry = hash2(z.x * 3, z.y * 5 + i, i + 99);
      const v = hash2(z.x + i, z.y + i, 7);
      ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
      const s = 3 + Math.floor(v * 5);
      ctx.fillRect(px + Math.floor(rx * (CELL - s)), py + Math.floor(ry * (CELL - s)), s, s);
    }

    drawIcon(ctx, z.type, px + CELL / 2, py + CELL / 2 - 9, isCur || isNb ? 1 : 0.6);

    // 商人标记：右上角一枚小金币
    if (META.merchants[z.id]) {
      ctx.beginPath();
      ctx.arc(px + CELL - 11, py + 11, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212,163,64,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 黑市：右上角一枚红点 + 光晕（限时的东西要显眼，玩家常常找不到）
    if (S && S.market && S.market.zone === z.id) {
      const cx = px + CELL - 12, cy = py + 23;
      // 光晕
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 13);
      g.addColorStop(0, 'rgba(255,90,90,0.55)');
      g.addColorStop(1, 'rgba(255,90,90,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // 本体
      ctx.beginPath();
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(240,64,64,1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,220,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 佣兵招募点：右上角一枚蓝点（常驻）
    if (META.merc && META.merc.zone === z.id) {
      ctx.beginPath();
      ctx.arc(px + CELL - 22, py + 11, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(94,166,224,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.font = 'bold 16px "SimHei","Microsoft YaHei",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    let label = z.name;
    if (label.length > 6) label = label.slice(0, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(label, px + CELL / 2 + 1, py + CELL - 5 + 1);
    ctx.fillStyle = isCur ? '#ffe9a8' : (isNb ? '#f0ecd8' : 'rgba(225,220,205,0.62)');
    ctx.fillText(label, px + CELL / 2, py + CELL - 5);

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);

    if (isNb) {
      ctx.strokeStyle = 'rgba(212,163,64,0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.setLineDash([]);
    }

    if (isCur) {
      const pulse = 0.45 + 0.35 * Math.sin(t / 260);
      ctx.strokeStyle = `rgba(255,225,140,${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
    }
  }

  const cx = cur.x * CELL + CELL / 2;
  const cy = cur.y * CELL + CELL / 2 - 4;
  drawPlayer(cx, cy, t);
}

function drawPlayer(cx, cy, t) {
  const bob = Math.sin(t / 300) * 1.2;
  const x = Math.round(cx), y = Math.round(cy + bob);
  ctx.beginPath();
  ctx.arc(x, y + 10, 15, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,225,140,${0.3 + 0.2 * Math.sin(t / 260)})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - 7, y + 11, 14, 4);
  ctx.fillStyle = '#2b2b22';
  ctx.fillRect(x - 6, y - 2, 12, 13);
  ctx.fillStyle = '#e8e4d0';
  ctx.fillRect(x - 5, y - 1, 10, 6);
  ctx.fillStyle = '#c9a26b';
  ctx.fillRect(x - 4, y - 12, 8, 8);
  ctx.fillStyle = '#1a1a14';
  ctx.fillRect(x - 4, y - 13, 8, 3);
  ctx.fillRect(x - 2, y - 8, 1, 2);
  ctx.fillRect(x + 2, y - 8, 1, 2);
  ctx.fillStyle = '#3b3b30';
  ctx.fillRect(x - 5, y + 11, 4, 6);
  ctx.fillRect(x + 1, y + 11, 4, 6);
  if (S.weapon) {
    ctx.fillStyle = S.weapon.noise >= 8 ? '#d46a4a' : '#a8b0a0';
    ctx.fillRect(x + 6, y - 2, 2, 9);
  }
}

const ICON_DEFS = {
  town: [[2,3,4,4],[1,2,6,2],[3,1,2,3]],
  street: [[1,5,6,1],[3,3,1,3]],
  village: [[2,4,4,3],[3,2,2,2]],
  field: [[1,4,6,1],[1,6,6,1],[3,2,1,3]],
  industrial: [[1,4,5,3],[5,1,2,4],[0,6,7,1]],
  warehouse: [[1,3,5,4],[2,4,3,1],[3,1,1,2]],
  hospital: [[3,2,2,5],[1,3,6,2]],
  school: [[1,3,6,4],[2,4,4,1],[2,6,4,1]],
  office: [[1,2,3,5],[4,1,3,6],[2,4,1,1],[5,4,1,1]],
  police: [[2,2,4,4],[3,1,2,2],[3,6,2,1]],
  station: [[1,4,6,1],[1,6,6,1],[2,2,4,1]],
  camp: [[1,4,6,3],[3,2,2,2]],
  spawn: [[2,2,4,4],[3,3,2,2]],
};

function drawIcon(g, type, cx, cy, alpha) {
  const pat = ICON_DEFS[type] || ICON_DEFS.street;
  const unit = 4.6;
  const ox = cx - 17, oy = cy - 15;
  g.globalAlpha = alpha;
  for (const [x, y, w, h] of pat) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(ox + x * unit - 1, oy + y * unit - 1, w * unit + 2, h * unit + 2);
    g.fillStyle = 'rgba(238,233,214,0.85)';
    g.fillRect(ox + x * unit, oy + y * unit, w * unit, h * unit);
  }
  g.globalAlpha = 1;
}

canvas.addEventListener('click', e => {
  if (!S || S.scene !== 'map') { toast('先处理眼前的事'); return; }
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * N);
  const y = Math.floor((e.clientY - r.top) / r.height * N);
  if (x === S.zone.x && y === S.zone.y) { doAct('explore'); return; }
  if (S.neighbors.some(n => n.x === x && n.y === y)) { doAct('move', { x, y }); return; }
  toast('只能移动到相邻区块');
});

canvas.addEventListener('mousemove', e => {
  if (!S) return;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * N);
  const y = Math.floor((e.clientY - r.top) / r.height * N);
  const z = META.map.find(m => m.x === x && m.y === y);
  const tip = $('#mapTip');
  if (z) {
    tip.classList.remove('hidden');
    let html = `${esc(z.name)} · 危险${z.danger} · 物资${z.loot}`;
    if (META.merchants[z.id]) html += ' · 有商人';
    if (z.id === META.bossZone) html += ' · BOSS';
    // 黑市 / 佣兵：地图上只有一个小圆点，鼠标移上来必须说清楚
    if (S && S.market && S.market.zone === z.id) {
      const left = Math.max(0, S.market.until - Date.now());
      html += `<div class="mt-market">★ 黑市在此 · 剩 ${fmtTime(left)} · 高级武器三倍价</div>`;
    }
    if (META.merc && META.merc.zone === z.id) {
      html += `<div class="mt-merc">★ 佣兵招募点 · 200 / 400 / 800</div>`;
    }
    tip.innerHTML = html;
    tip.style.left = (e.clientX - r.left + 14) + 'px';
    tip.style.top = (e.clientY - r.top + 14) + 'px';
  } else tip.classList.add('hidden');
});
canvas.addEventListener('mouseleave', () => $('#mapTip').classList.add('hidden'));

// ================= 行动 =================
async function doAct(action, payload = {}) {
  try {
    const j = await api('/api/action', { action, payload });
    if (j.round) ROUND = j.round;
    // 轮次已经结束：后端会带 roundOver 回来，直接切结算画面，别只弹一行红字
    if (j.roundOver) {
      toast(j.msg || '对局已结束。');
      setTimeout(() => roundOverTo({ round: ROUND }), 800);
      return j;
    }
    if (j.state) { S = j.state; render(); }
    if (j.achievements && j.achievements.length) {
      j.achievements.forEach(a => toast(`解锁称号：${a.title}`));
    }
    if (j.msg && !j.ok) toast(j.msg);
    if (ROUND && ROUND.state === 'ended' && S && S.scene !== 'sevenwin') {
      setTimeout(() => roundOverTo({ round: ROUND }), 1600);
    }
    return j;
  } catch (e) { toast(e.message); return { ok: false, msg: e.message }; }
}

$('#btnExplore').onclick = () => doAct('explore');
$('#btnRest').onclick = () => doAct('rest');
$('#btnShop').onclick = () => openShop();
$('#btnNpc').onclick = () => {
  if (!S || !S.npc) return;
  doAct('npc', { npcId: S.npc.id, choice: 'open' });
};
$('#btnMod').onclick = () => openMod();

// ================= 自动战斗 =================
let autoBattle = false;
let autoTimer = null;

function stopAutoBattle() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
}

function autoStep() {
  if (!autoBattle || !S || S.scene !== 'battle') { autoTimer = null; return; }
  if (S.char.hp <= S.char.hpMax * 0.25) {
    autoBattle = false;
    autoTimer = null;
    toast('血量低于 25%，自动战斗已停止');
    if (S.scene === 'battle') renderBattle();
    return;
  }
  if (S.char.ep < 2) {
    autoBattle = false;
    autoTimer = null;
    toast('精力见底，自动战斗已停止——可以防御、逃跑或用道具');
    if (S.scene === 'battle') renderBattle();
    return;
  }
  doAct('battle', { choice: 'attack' }).then(j => {
    if (!autoBattle) return;
    if (j && j.ok === false) {   // 打不动了（精力不够 / 状态限制）就别继续锤
      autoBattle = false;
      autoTimer = null;
      if (S && S.scene === 'battle') renderBattle();
      return;
    }
    autoTimer = setTimeout(autoStep, 620);
  });
}

function startAutoBattle() {
  stopAutoBattle();
  if (!autoBattle) return;
  autoTimer = setTimeout(autoStep, 260);
}

// ================= 弹窗框架 =================
let modalClosable = false;
function openModal(title, bodyHtml, buttons, noClose) {
  hideTip();
  tipQtyId = null; tipQty = 1;
  modalClosable = !noClose;
  $('#modalBox').className = 'modal-box';
  $('#modalBox').innerHTML = `
    <div class="m-head">
      <div class="m-title">${esc(title)}</div>
      ${noClose ? '' : '<button class="m-close" id="mClose">×</button>'}
    </div>
    <div class="m-body">${bodyHtml}</div>
    <div class="m-foot" id="mFoot"></div>`;
  const foot = $('#mFoot');
  const made = [];
  (buttons || []).forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.textContent = b.label;
    if (b.disabled) btn.disabled = true;
    btn.onclick = b.fn;
    foot.appendChild(btn);
    made.push({ el: btn, cfg: b });
  });
  // 空格键的默认目标：显式标 def 的优先；场景弹窗退化为「主按钮 / 第一个可用按钮」。
  // 浮层（背包/合成/称号）不设默认，避免空格误关窗口。
  const explicit = made.find(m => m.cfg.def && !m.el.disabled);
  const fallback = noClose ? (made.find(m => m.cfg.cls === 'primary' && !m.el.disabled) || made.find(m => !m.el.disabled)) : null;
  modalDefaultBtn = (explicit || fallback || {}).el || null;
  kbEl = null;
  const cl = $('#mClose');
  if (cl) cl.onclick = closeModal;
  $('#modal').classList.remove('hidden');
  updateHints();
  // 视觉居中：只算一次 margin-top。内容后续变高时盒子往下长，不会整体重排（双击才不会点空）
  requestAnimationFrame(() => {
    const box = $('#modalBox');
    if (!box) return;
    box.style.marginTop = '';
    const vh = window.innerHeight;
    const h = box.getBoundingClientRect().height;
    const top = Math.max(12, Math.round((vh - h) / 2));
    box.style.marginTop = top + 'px';
  });
  return $('#modalBox');
}

// 这些场景必须靠弹窗推进：直接关掉弹窗 = 玩家卡在「没弹窗、又不能在地图操作」
const BLOCKING_SCENES = ['encounter', 'battle', 'loot', 'box', 'hostage', 'hostage_result', 'npc', 'sevenwa', 'liuying'];

function closeModal(fromRender) {
  if (!fromRender && S && S.scene && BLOCKING_SCENES.includes(S.scene)) {
    renderModal();   // 场景还在，把弹窗重新画回来，避免死锁
    return;
  }
  $('#modal').classList.add('hidden');
  kbEl = null;
  bagReturn = false;
  updateHints();
}

// 键盘提示条（手机端由 CSS 隐藏）
const kbdHintEl = document.createElement('div');
kbdHintEl.className = 'kbd-hint hidden';
kbdHintEl.textContent = '↑↓←→ 选择 · 空格 确定 · Esc 关闭';
document.body.appendChild(kbdHintEl);

const mapHintEl = document.createElement('div');
mapHintEl.className = 'kbd-hint hidden';
mapHintEl.textContent = 'Enter 探索 · 空格 战斗 · B 背包 · M 合成';
document.body.appendChild(mapHintEl);

// 按当前状态决定显示哪条提示
function updateHints() {
  const modalOpen = !$('#modal').classList.contains('hidden');
  if (kbdHintEl) kbdHintEl.classList.toggle('hidden', !modalOpen);
  if (mapHintEl) mapHintEl.classList.toggle('hidden', modalOpen || !S || S.scene !== 'map');
}

// ================= 键盘操作（方向键选 / 空格确认） =================
let kbEl = null;              // 当前键盘焦点
let modalDefaultBtn = null;   // 空格默认触发的按钮

function kbFocusables() {
  const box = $('#modalBox');
  if (!box) return [];
  const raw = [...box.querySelectorAll('.btn, .bag-cell[data-id], .pill-btn, .shop-item')];
  return raw.filter(el => {
    if (el.disabled) return false;
    if (el.classList.contains('empty')) return false;
    if (el.classList.contains('m-close')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
}

function kbSet(el) {
  if (kbEl && kbEl !== el) kbEl.classList.remove('kbd-focus');
  kbEl = el;
  if (!el) return;
  el.classList.add('kbd-focus');
  if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// 第一次按方向键时落到哪：优先默认按钮；没有就从「内容区第一个」开始（跳过底部按钮和小工具按钮）
function kbInitial(els) {
  if (modalDefaultBtn && els.includes(modalDefaultBtn)) return modalDefaultBtn;
  const content = els.filter(el => !el.closest('.m-foot') && !el.classList.contains('tiny'));
  const pool = content.length ? content : els;
  let best = pool[0], bestKey = Infinity;
  for (const el of pool) {
    const r = el.getBoundingClientRect();
    const key = Math.round(r.top / 8) * 10000 + r.left;   // 先比行，再比列
    if (key < bestKey) { bestKey = key; best = el; }
  }
  return best;
}

// 按方向找最近的可聚焦元素（几何判定，网格/竖排/底部按钮都吃得下）
function kbMove(dir) {
  const els = kbFocusables();
  if (!els.length) return;
  if (!kbEl || !els.includes(kbEl)) {
    kbSet(kbInitial(els));
    return;
  }
  const cur = kbEl.getBoundingClientRect();
  const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of els) {
    if (el === kbEl) continue;
    const r = el.getBoundingClientRect();
    const dx = (r.left + r.width / 2) - cx;
    const dy = (r.top + r.height / 2) - cy;
    let primary, secondary;
    if (dir === 'up') { primary = -dy; secondary = Math.abs(dx); }
    else if (dir === 'down') { primary = dy; secondary = Math.abs(dx); }
    else if (dir === 'left') { primary = -dx; secondary = Math.abs(dy); }
    else { primary = dx; secondary = Math.abs(dy); }
    if (primary <= 4) continue;                  // 必须真的在那个方向上
    // 左右只在「同一行」里走，否则会从底部按钮斜着跳回网格，很晕
    if ((dir === 'left' || dir === 'right') && Math.abs(dy) > Math.max(cur.height, r.height) * 0.8) continue;
    const score = primary + secondary * 2;       // 偏离轴线要罚分，避免斜着跳
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) kbSet(best);
}

document.addEventListener('keydown', e => {
  if ($('#modal').classList.contains('hidden')) return;
  const ae = document.activeElement;
  const inField = !!ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName);
  const k = e.key;
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
    if (inField) return;   // 滑块/输入框自己要用方向键
    e.preventDefault();
    kbMove({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k]);
    return;
  }
  if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
    const isRange = inField && ae.tagName === 'INPUT' && ae.type === 'range';
    if (inField && !isRange) return;   // 文本框里空格要能打字
    if (e.repeat) return;
    e.preventDefault();
    if (kbEl && document.contains(kbEl)) { kbEl.click(); return; }
    if (modalDefaultBtn && !modalDefaultBtn.disabled && document.contains(modalDefaultBtn)) {
      modalDefaultBtn.click();
    }
    return;
  }
  if (k === 'Escape' && modalClosable) { e.preventDefault(); closeModal(); }
});

// 地图上的快捷操作：Enter 探索 / B 背包 / M 合成（配合弹窗里的空格，可以全程不碰鼠标）
document.addEventListener('keydown', e => {
  if (!$('#modal').classList.contains('hidden')) return;   // 弹窗里交给上面的处理
  if (!S || S.scene !== 'map') return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const ae = document.activeElement;
  if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) return;   // 聊天框里要能打字
  const k = String(e.key || '').toLowerCase();
  if (k === 'enter') {
    e.preventDefault();
    const b = $('#btnExplore');
    if (b && !b.disabled) b.click();   // 走按钮，探索的前置校验（精力、场景）都在后端
  }
  else if (k === 'b') { e.preventDefault(); openBag(false); }
  else if (k === 'm') { e.preventDefault(); openCraft(); }
});

// 点遮罩关窗：只对「浮层类」弹窗生效（背包/合成/商店/称号…）。
// 场景弹窗（遭遇/战斗/七娃）传了 noClose，点外面不能关，否则会把流程卡住。
$('#modal').addEventListener('click', e => {
  if (e.target && e.target.id === 'modal' && modalClosable) closeModal();
});

// ================= 场景弹窗 =================
// 兜底自愈：不管哪条路径把弹窗关掉了，只要场景还没结束，1 秒内自动画回来。
// 玩家永远不会卡在「没弹窗 + 地图按钮全灰」的状态里。
setInterval(() => {
  try {
    if (document.hidden) return;
    if (!S || !S.scene) return;
    if (!$('#modal').classList.contains('hidden')) return;
    if (!BLOCKING_SCENES.includes(S.scene)) return;
    renderModal();
  } catch (e) { /* 自愈失败就算了，别刷屏 */ }
}, 1000);

function renderModal() {
  if (!S) return;
  const sc = S.scene;
  // 离开战斗就把基准血量清掉，下一场才不会拿上一场的血对比、误触发震动
  if (sc !== 'battle') { btLastHp = null; btLastFoeHp = null; }
  if (sc === 'map') { closeModal(true); return; }
  if (sc === 'encounter') return renderEncounter();
  if (sc === 'battle') return renderBattle();
  if (sc === 'loot') return renderLoot();
  if (sc === 'box') return renderBox();
  if (sc === 'hostage') return renderHostage();
  if (sc === 'hostage_result') return renderHostageResult();
  if (sc === 'npc') return renderNpc();
  if (sc === 'sevenwa') return renderSevenWa();
  if (sc === 'liuying') return renderLiuying();
  if (sc === 'sevenwin') return renderSevenWin();
  if (sc === 'dead') return renderDead();
  closeModal();
}

// 战斗窗口的血条：结构和左上角完全一样（.vital > .bar > .bar-fill），
// 所以 state-high/mid/low/crit 的发光、脉冲、闪烁和 state-full 的绿跑马灯全部自动继承
function hpBarHtml(cur, max, cls, state, full) {
  const p = Math.max(0, Math.min(100, max ? cur / max * 100 : 0));
  const st = state || vitalStateOf(max ? cur / max : 1);
  return `<div class="vital${full ? ' state-full' : ''} state-${st}">
    <div class="bar state-${st}"><div class="bar-fill ${cls}" style="width:${p}%"></div></div>
  </div>`;
}

const TIER_NAME = { 1: '很弱', 2: '一般', 3: '难缠', 4: '危险', 5: '致命', 6: 'BOSS' };
function tierChip(tier) {
  const t = Math.max(1, Math.min(6, tier || 1));
  return `<span class="tier-chip t${t}">${TIER_NAME[t]} ${'★'.repeat(t)}</span>`;
}

function renderEncounter() {
  const p = S.pending, e = p.enemy;
  const npc = p.npc;
  const isAnimal = e.kind === 'animal';
  const isBoss = !!p.boss;
  const isPvp = !!p.pvp;
  const title = isBoss ? '钟楼' : (npc ? '剧情遭遇' : (isPvp ? '玩家遭遇' : '遭遇'));
  const text = isBoss ? (p.intro || e.desc) : (npc ? npc.text : e.desc);
  const spareLabel = npc ? npc.talk : (isAnimal ? '放我一马（无效）' : '放他一马');
  // 剧情 NPC：标题用事件自己的名字，不能显示随机敌人的名字（曾经出现「遇到小孩→疯女人」）
  const shownName = npc ? npc.title : e.name;
  const metaLine = isBoss ? '最终 BOSS'
    : (npc ? '剧情 · 谈崩了才会动手' : (isPvp ? '真人玩家 · 同区块' : '危险度 ' + e.tier));
  const look = (npc && window.PX && PX.NPC_EVENT_LOOK && PX.NPC_EVENT_LOOK[npc.id])
    ? Object.assign({ skin: '#c9a26b' }, PX.NPC_EVENT_LOOK[npc.id])
    : (window.PX ? PX.enemyLook(e) : {});

  const body = `
    <div class="enc-body">
      <div class="enc-info">
        <div class="enc-name" ${isBoss ? 'style="color:var(--accent)"' : ''}>${esc(shownName)}${isBoss ? tierChip(6) : tierChip(e.tier)}</div>
        <div class="enc-meta">${metaLine} · ${esc(p.zoneName)}${p.wave > 1 ? ' · 第 ' + p.wave + ' 波' : ''}</div>
        <div class="enc-text">${esc(text)}</div>
        ${p.hostage ? `<div class="enc-text" style="color:var(--accent2)">角落里有个被绑着的人，${esc(p.hostage.name)}，正看着你。</div>` : ''}
        <div class="enc-stats">
          <span>生命 <b>${e.hp}/${e.maxHp}</b></span>
          <span>攻击 <b>${e.atk}</b></span>
          <span>防御 <b>${e.def}</b></span>
        </div>
        ${npc ? `<div class="enc-foe">谈崩了动手的是：<b>${esc(e.name)}</b></div>` : ''}
        ${isPvp ? '<div class="hint" style="color:var(--warn)">真人对真人的遭遇：打赢了会真的打伤他、抢他一部分钱，他的屏幕上会收到提示。</div>' : ''}
        <div class="hint">交涉成功率取决于你的魅力（当前 ${S.char.eff.cha}）。${isBoss ? '这里没有退路。' : ''}</div>
      </div>
      <div class="enc-art">${pxPerson(look, 108)}</div>
    </div>`;

  const btns = [
    { label: isPvp ? '动手' : '战斗', cls: 'danger', def: true, fn: () => doAct('encounter', { choice: 'fight' }) },
    { label: spareLabel, cls: isAnimal ? '' : 'primary', disabled: isAnimal, fn: () => doAct('encounter', { choice: 'spare' }) },
    { label: '使用道具', fn: () => openItemPicker('encounter') },
  ];
  openModal(title, body, btns, true);
}

// 战斗窗口的立绘是每回合整块重建的，得自己记住上一次的血量才能判断「这一下是谁挨打」
let btLastHp = null, btLastFoeHp = null;

function renderBattle() {
  const p = S.pending, e = p.enemy;
  const logs = (p.log || []).slice(-40).map(t => `<div>${esc(t)}</div>`).join('');

  // 战斗窗口的立绘和左上角头像共用同一套特效类：血量档位光效 / 濒危闪红 / 状态笼罩 / 满状态跑马灯
  const myLook = PX.heroLook(S.char);
  const myFx = stageFxClass(S.char, myLook);
  // 血条也走同一套档位判断（含满状态跑马灯），否则战斗里血少了看不出来
  const myHpPct = S.char.hpMax ? S.char.hp / S.char.hpMax : 1;
  const myEpPct = S.char.epMax ? S.char.ep / S.char.epMax : 1;
  const myHpState = vitalStateOf(myHpPct);
  const myAllFull = myHpPct >= 0.999 && myEpPct >= 0.999;

  // 敌人没有精力和异常状态，只按血量算档位；BOSS 再加一层红晕
  const foePct = e.maxHp ? e.hp / e.maxHp : 1;
  const foeLook = { mood: foePct > 0.6 ? 'good' : (foePct > 0.3 ? 'mid' : 'bad'), critical: foePct < 0.15 };
  const foeState = vitalStateOf(foePct);
  // 绿跑马灯是「满血满精力」的意思，敌人没有精力，别给他挂
  const foeFx = stageFxClass({ hp: e.hp, hpMax: e.maxHp, ep: 1, epMax: 1, status: e.status || null }, foeLook)
    .replace('full-aura', '')
    + ' enemy-fx' + (p.boss ? ' boss-aura' : '');

  const body = `
    <div class="battle-grid">
      <div class="fighter">
        <div class="fighter-art">
          <div class="hero-stage fx-stage ${myFx}" id="btHeroStage">${pxPerson(myLook, 66)}</div>
        </div>
        <div class="fighter-name">你</div>
        ${hpBarHtml(S.char.hp, S.char.hpMax, 'hp', myHpState, myAllFull)}
        <div class="mini-row state-${myHpState}${myAllFull ? ' state-full' : ''}"><span class="num-hp">${S.char.hp}/${S.char.hpMax}</span><span>精力 ${S.char.ep}</span></div>
      </div>
      <div class="fighter">
        <div class="fighter-art">
          <div class="hero-stage fx-stage ${foeFx}" id="btFoeStage">${pxPerson(PX.enemyLook(e), 66)}</div>
        </div>
        <div class="fighter-name enemy">${esc(e.name)}${p.boss ? tierChip(6) : tierChip(e.tier)}</div>
        ${hpBarHtml(e.hp, e.maxHp, 'hp', foeState, false)}
        <div class="mini-row state-${foeState}"><span class="num-hp">${e.hp}/${e.maxHp}</span><span>攻 ${e.atk}</span></div>
      </div>
    </div>
    <div class="auto-row">
      <label><input type="checkbox" id="autoAtk" ${autoBattle ? 'checked' : ''}> 自动攻击</label>
      <span class="auto-hint ${autoBattle ? 'on' : ''}">${autoBattle
        ? '自动出手中，血量低于 25% 会自动停下'
        : '手动模式：每一步由你决定（攻击 / 道具 / 换武器 / 防御 / 逃跑）'}</span>
    </div>
    <div class="battle-log" id="bLog">${logs}</div>
    <div class="hint">第 ${p.round} 回合 · 噪音 ${p.noise}${p.smoke ? ' · 烟雾中' : ''}${p.wave > 1 ? ' · 第 ' + p.wave + ' 波' : ''}${p.boss ? ' · 最终 BOSS' : ''}</div>`;

  const btns = [
    { label: '攻击', cls: 'danger', def: true, fn: () => doAct('battle', { choice: 'attack' }) },
    { label: '使用道具', fn: () => openItemPicker('battle') },
    { label: '换武器', fn: () => openSwapPicker() },
    { label: '防御', fn: () => doAct('battle', { choice: 'defend' }) },
    { label: '逃跑', fn: () => doAct('battle', { choice: 'flee' }) },
  ];
  openModal('战斗', body, btns, true);
  const bl = $('#bLog');
  if (bl) bl.scrollTop = bl.scrollHeight;

  // 战斗窗口是整块重建的，所以受击震动必须在 openModal 之后补，否则刚加上就被覆盖掉
  const myStage = $('#btHeroStage');
  const foeStage = $('#btFoeStage');
  if (btLastHp != null && S.char.hp < btLastHp) shakeStage(myStage, btLastHp - S.char.hp);
  if (btLastFoeHp != null && e.hp < btLastFoeHp) shakeStage(foeStage, btLastFoeHp - e.hp);
  btLastHp = S.char.hp;
  btLastFoeHp = e.hp;

  const cb = $('#autoAtk');
  if (cb) cb.onchange = () => {
    autoBattle = cb.checked;
    if (autoBattle) startAutoBattle(); else stopAutoBattle();
    renderBattle();
  };
  // 从别的战斗延续过来的自动状态
  if (autoBattle) startAutoBattle();
}

function renderLoot() {
  const p = S.pending;
  const rows = (p.items || []).map((it, i) => {
    const d = META.items[it.id];
    if (!d) return '';   // 物品已被删除（老存档），跳过，别让渲染崩掉
    return `<div class="recipe" data-tip="${it.id}">
      ${pxItem(it.id, 28)}
      <div class="rname">${esc(d.name)}</div>
      <div class="rmat">${esc(d.desc || '')}</div>
      <div class="rrate">x${it.n}</div>
      <button class="btn" data-loot="${i}">拿</button>
    </div>`;
  }).join('') || '<div class="hint">什么都没有了。</div>';

  const body = `
    <div class="enc-meta">${esc(p.enemyName)}倒下了${p.bossWin ? '。整片油田安静下来' : ''}。</div>
    <div class="enc-text" style="margin-bottom:10px">${p.bossWin ? '钟楼上只剩下风声。你可以走了。' : '你蹲下去翻他的口袋。'}</div>
    ${rows}
    ${p.chain ? '<div class="hint" style="color:var(--bad)">枪声引来了别人——拿完东西就要接着打。</div>' : ''}`;

  openModal(p.bossWin ? '结束' : '战利品', body, [
    { label: '全部拿走', cls: 'primary', fn: () => doAct('loot', { all: true }) },
    { label: '背包', fn: () => openBagFromScene() },
    { label: '不拿了，走', fn: () => doAct('close') },
  ], true);

  document.querySelectorAll('[data-loot]').forEach(b => {
    b.onclick = () => doAct('loot', { index: +b.dataset.loot });
  });
}

function renderBox() {
  const p = S.pending;
  const rows = (p.items || []).map((it, i) => {
    const d = META.items[it.id];
    if (!d) return '';   // 同上
    return `<div class="recipe" data-tip="${it.id}">
      ${pxItem(it.id, 24)}
      <div class="rname">${esc(d.name)}</div>
      <div class="rmat">${esc(d.desc || '')}</div>
      <div class="rrate">x${it.n}</div>
      <button class="btn" data-box="${i}">拿</button>
    </div>`;
  }).join('') || '<div class="hint">箱子空了。</div>';

  const n = (p.items || []).length;
  const body = `
    <div class="box-head">
      <div class="box-art">${pxBox(boxKind(p.text), 76)}</div>
      <div class="box-say">
        <div class="enc-text" style="margin-bottom:6px">${esc(p.text || '')}</div>
        ${p.gold ? `<div class="hint" style="margin-top:0;color:var(--accent3)">箱子里有现金 ¥${p.gold}（已经揣兜里了）</div>` : ''}
        <div class="hint" style="margin-top:0">
          ${n ? `里面有 ${n} 样东西。点「拿」一件一件拿，或者「全部拿走」。` : '已经空了。'}
          ${p.items && p.items.length ? '背包满了就先点「背包」腾地方，关掉背包会回到这一页。' : ''}
        </div>
      </div>
    </div>
    ${rows}`;

  openModal('开箱', body, [
    { label: '全部拿走', cls: 'primary', def: true, fn: () => doAct('box', { all: true }) },
    { label: '背包', fn: () => openBagFromScene() },
    { label: '关掉', fn: () => doAct('close') },
  ], true);

  document.querySelectorAll('[data-box]').forEach(b => {
    b.onclick = () => doAct('box', { index: +b.dataset.box });
  });
}

function renderHostage() {
  const p = S.pending;
  const h = p.hostage;
  const body = `
    <div class="enc-body">
      <div class="enc-info">
        <div class="enc-name" style="color:var(--accent)">${esc(h.name)}</div>
        <div class="enc-meta">她手上的绳子还没解开</div>
        <div class="enc-text">
          她靠着墙，手被绑在身后，看着你，没有说话。<br>
          外面还很乱。带上她，路会难走一些，但至少有人能说话。
        </div>
        <div class="hint">她跟不跟你走，取决于你给人的感觉（魅力 ${S.char.eff.cha}）。</div>
      </div>
      <div class="enc-art">${pxPerson({ female: true, cloth: '#6a5a6a', hair: '#2a2018', expression: 'pitiful', headDown: true }, 128)}</div>
    </div>`;

  openModal('人质', body, [
    { label: '问她愿不愿意跟你走', cls: 'primary', fn: () => doAct('hostage', { choice: 'ask' }) },
    { label: '解开绳子，自己走', fn: () => doAct('hostage', { choice: 'leave' }) },
  ], true);
}

// 她的回答：先给表情，再给结果
function renderHostageResult() {
  const p = S.pending;
  const h = p.hostage;
  const taken = !!p.taken;
  const base = { female: true, cloth: '#6a5a6a', hair: '#2a2018' };

  openModal('她的回答', `
    <div class="enc-body">
      <div class="enc-info">
        <div class="enc-name" style="color:var(--accent)">${esc(h.name)}</div>
        <div class="enc-meta" id="hrMeta">她低着头，没有立刻回答</div>
        <div class="enc-text" id="hrText" style="color:var(--dim)">你等着。风从巷子口吹进来。</div>
      </div>
      <div class="enc-art" id="hrArt">${pxPerson({ ...base, expression: 'pitiful', headDown: true }, 128)}</div>
    </div>
  `, [], true);

  setTimeout(() => {
    const art = $('#hrArt');
    const meta = $('#hrMeta');
    const text = $('#hrText');
    const foot = $('#mFoot');
    if (!art || !meta || !text) return;

    if (taken) {
      art.innerHTML = pxPerson({ ...base, expression: 'sparkle' }, 128);
      meta.textContent = '她抬起头';
      meta.style.color = 'var(--good)';
      text.innerHTML = '她的眼睛慢慢亮起来，然后点了一下头。<br>你割断绳子，她站起来，跟在你身后。';
      text.style.color = 'var(--text)';
    } else {
      art.innerHTML = pxPerson({ ...base, expression: 'refuse', headDown: true }, 128);
      meta.textContent = '她低下头';
      meta.style.color = 'var(--bad)';
      text.innerHTML = '她摇了一下头，没有看你。<br>然后转身跑进了巷子，脚步声很快就听不见了。';
      text.style.color = 'var(--dim)';
    }
    art.classList.add('hr-flash');

    if (foot && !foot.querySelector('[data-hr]')) {
      const b = document.createElement('button');
      b.className = 'btn primary';
      b.dataset.hr = '1';
      b.textContent = '继续';
      b.onclick = () => doAct('hostage_done', {});
      foot.appendChild(b);
      // 按钮是后补的，openModal 那一刻还没有默认按钮，回车/空格会打空
      modalDefaultBtn = b;
    }
  }, 1300);
}

function renderDead() {
  const c = S.char;
  const reason = S.pending && S.pending.reason === 'ep'
    ? '精力耗尽。你倒在了半路上，再也没能站起来。'
    : '生命归零。你听见广播里念了另一个编号。';
  const titles = Object.keys(c.achievements || {}).length;
  const body = `
    <div class="dead-title">出 局</div>
    <div class="dead-text">${reason}</div>
    <div class="dead-stats">
      <div><b>${c.turn}</b>回合</div>
      <div><b>${c.kills}</b>击杀</div>
      <div><b>${titles}</b>称号</div>
      <div><b>¥${c.gold || 0}</b>金币</div>
    </div>
    <div class="hint" style="text-align:center">这一轮还没结束。你可以看着别人打完。</div>`;
  openModal('结果', body, [
    { label: '看排行榜', fn: () => openRankModal() },
    { label: '离开对局', fn: () => { closeModal(); showDeadWait(); } },
  ], true);
}

// 出局后回大厅：底部会显示「你出局了」+ 上一轮战报，看板照样能看
function showDeadWait(st) { showLobby(st || null); }

// ================= 特殊角色 =================
function renderSevenWa() {
  const sw = META.special.sevenWa;
  openModal('墙角的孩子', `
    <div class="enc-body">
      <div class="enc-info">
        <div class="enc-name" style="color:var(--accent)">${esc(sw.name)}</div>
        <div class="enc-meta">${sw.age} 岁 · ${esc(sw.title)}</div>
        <div class="enc-text">${esc(sw.desc)}</div>
        <div class="enc-text" style="color:var(--dim)">${(sw.lines || []).map(esc).join('<br>')}</div>
        <div class="hint">他愿不愿意跟你走，说不准。大概 ${sw.chance}% 的可能。带走他，这一轮就结束了。</div>
      </div>
      <div class="enc-art sw-art">${pxSpecial('sevenwa', 150)}</div>
    </div>
  `, [
    { label: '蹲下来跟他说话', cls: 'primary', fn: () => doAct('sevenwa', { choice: 'talk' }) },
    { label: '不管他，继续走', fn: () => doAct('sevenwa', { choice: 'ignore' }) },
  ], true);
}

function renderLiuying() {
  const p = S.pending;
  const ly = META.special.liuying;

  if (p.stage === 'pill') {
    const box = openModal('刘颖', `
      <div class="ly-stage">
        <div class="ly-portrait">${pxSpecial('liuying', 380)}</div>
        <div class="ly-overlay">
          <div class="ly-name">${esc(ly.name)}</div>
          <div class="ly-meta">${esc(ly.title)}</div>
          <div class="ly-text">${esc(ly.intro)}</div>
          <div class="ly-ask">${esc(ly.ask)}</div>
          <div class="pill-row">
            <button class="pill-btn red" data-pill="red"><b>红药丸</b><span>偏体魄</span></button>
            <button class="pill-btn blue" data-pill="blue"><b>蓝药丸</b><span>偏心智</span></button>
          </div>
          <div class="hint" style="text-align:center;margin-top:6px">吃完之后，她还会问你一个问题。</div>
        </div>
      </div>
    `, [], true);
    box.classList.add('ly-box');
    document.querySelectorAll('[data-pill]').forEach(b => {
      b.onclick = () => doAct('liuying', { choice: b.dataset.pill });
    });
    return;
  }

  if (p.stage === 'quiz') {
    const q = p.question;
    openModal('刘颖 · 问题', `
      <div class="enc-text" style="color:var(--dim)">${esc(ly.quizIntro)}</div>
      <div class="quiz-q">${esc(q.q)}</div>
      <div class="quiz-opts">
        ${q.opts.map((o, i) => `<button class="quiz-opt" data-ans="${i}"><b>${'ABC'[i]}</b>${esc(o)}</button>`).join('')}
      </div>
      <div class="hint">答对：负向概率 30%。答错：负向概率 80%。</div>
    `, [], true);
    document.querySelectorAll('[data-ans]').forEach(b => {
      b.onclick = () => doAct('liuying', { answer: +b.dataset.ans });
    });
    return;
  }

  if (p.stage === 'result') {
    const rows = (p.effects || []).map(e =>
      `<div class="effect-row ${e.v > 0 ? 'up' : 'down'}">
        <span>${META.attrNames[e.k]}</span>
        <span>${e.v > 0 ? '+' : ''}${e.v}</span>
      </div>`).join('');
    openModal('刘颖 · 结果', `
      <div class="enc-text" style="text-align:center;color:${p.negative ? 'var(--bad)' : 'var(--good)'}">
        ${p.correct ? '答对了。' : '答错了。'}${p.negative ? '药丸在胃里翻搅。' : '身体轻了一点。'}
      </div>
      <div class="effect-list">${rows}</div>
      <div class="hint">药效持续 10 分钟。这段时间里不会再遇到她。</div>
    `, [
      { label: '继续', cls: 'primary', fn: () => doAct('liuying', {}) },
    ], true);
  }
}

function renderSevenWin() {
  const p = S.pending || {};
  const n = p.total || 1;
  openModal('回家', `
    <div class="win-title">你 们 回 家 了</div>
    <div class="win-text">
      你牵着他的手，沿着铁轨一直往东走。<br>
      天快亮的时候，前面出现了几栋亮着灯的楼。<br>
      他抬头问你："我们到了吗？"<br>
      你说："到了。"<br><br>
      这是你第 ${n} 次带他回家。
      ${n >= 10 ? '<br><span style="color:var(--good)">「好爸爸」——十次，你一次都没落下。</span>' : ''}
    </div>
  `, [
    { label: '结算', cls: 'primary', fn: settleAndWait },
  ], true);
}

// 结算：落库标记 settled，然后回到下一轮等待区（刷新也不会再弹回胜利画面）
async function settleAndWait() {
  try { await api('/api/action', { action: 'settle' }); } catch (e) { /* 网络问题也不卡住玩家 */ }
  S = null;
  clearTimers();
  try {
    const st = await api('/api/state');
    ROUND = st.round;
    showLobby(st);
  } catch (e) { location.reload(); }
}

// ================= 常驻 NPC =================
function renderNpc() {
  const p = S.pending;
  const n = S.npc;
  if (!n) { closeModal(); return; }

  const logs = (p && p.log ? p.log : []).map(t => `<div>${esc(t)}</div>`).join('');
  const favorPct = n.maxFavor ? (n.favor / n.maxFavor) * 100 : 0;
  const SLOT_CN = { sight: '瞄具', muzzle: '枪口', grip: '握把' };

  const shopRows = (n.shop || []).map(([id, price]) => {
    const d = META.items[id];
    if (!d) return '';
    const afford = (S.char.gold || 0) >= price;
    return `<div class="shop-item" data-tip="${id}">
      ${pxItem(id, 26)}
      <span class="si-name">${esc(d.name)}</span>
      <span class="si-price">¥${price}</span>
      <button class="btn" data-npcbuy="${id}" ${afford ? '' : 'disabled'}>买</button>
    </div>`;
  }).join('');

  openModal('交谈', `
    <div class="npc-art">
      <div class="npc-face">${pxPerson(PX.NPC_LOOK[n.id] || {}, 96)}</div>
      <div class="npc-main">
        <div class="npc-head">
          <span class="npc-name">${esc(n.name)}</span>
          <span class="npc-title">${esc(n.title)}</span>
        </div>
        <div class="enc-text" style="color:var(--dim);margin-bottom:6px">${esc(n.greet)}</div>
        <div class="favor-wrap">
          <span>好感</span>
          <div class="favor-bar"><div style="width:${favorPct}%"></div></div>
          <span>${n.favor}/${n.maxFavor}</span>
        </div>
      </div>
    </div>
    <div class="npc-log" id="npcLog">${logs || '<div>（还没说话）</div>'}</div>
    <div class="npc-acts">
      <button class="btn primary" id="npcTalk" ${n.canTalk ? '' : 'disabled'}>
        ${n.canTalk ? '聊几句' : '过 ' + n.cdLeft + ' 回合再来'}
      </button>
      ${n.special === 'repair' ? '<button class="btn" id="npcRepair">修武器 ¥40</button>' : ''}
      <button class="btn danger" id="npcLeave">离开</button>
    </div>
    ${shopRows ? `<div class="npc-shop"><h4>他卖的东西</h4><div class="shop-grid">${shopRows}</div></div>` : ''}
  `, [], true);

  const talk = $('#npcTalk');
  if (talk) talk.onclick = () => doAct('npc', { npcId: n.id, choice: 'talk' });
  const rep = $('#npcRepair');
  if (rep) rep.onclick = () => doAct('npc', { npcId: n.id, choice: 'repair' });
  const lv = $('#npcLeave');
  if (lv) lv.onclick = () => doAct('npc', { npcId: n.id, choice: 'leave' });
  document.querySelectorAll('[data-npcbuy]').forEach(b => {
    b.onclick = () => doAct('npc', { npcId: n.id, choice: 'buy', itemId: b.dataset.npcbuy });
  });
  const lg = $('#npcLog');
  if (lg) lg.scrollTop = lg.scrollHeight;
}

// ================= 武器改装 =================
function openMod() {
  if (!S) return;
  const w = S.weapon;
  if (!w) { toast('你手上没有武器'); return; }
  if (!w.moddable) { toast(`${w.name}没有改装槽位，只有火器能改`); return; }
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }

  const SLOT_CN = { sight: '瞄具', muzzle: '枪口', grip: '握把' };
  const modEffect = d => {
    if (!d) return '';
    if (d.noiseCut) return `噪音 -${d.noiseCut}`;
    if (d.accBonus) return `命中 +${d.accBonus}%`;
    if (d.dmgBonus) return `伤害 +${Math.round(d.dmgBonus * 100)}%`;
    return '';
  };
  const slots = ['sight', 'muzzle', 'grip'];
  const slotHtml = slots.map(s => {
    const cur = w.mods && w.mods[s] ? META.items[w.mods[s]] : null;
    return `<div class="mod-slot ${cur ? 'filled' : ''}">
      <div class="ms-label">${SLOT_CN[s]}</div>
      <div class="ms-name ${cur ? '' : 'empty'}">${cur ? esc(cur.name) : '空'}</div>
      <div class="ms-eff">${cur ? modEffect(cur) : '—'}</div>
      ${cur ? `<button class="btn" data-unmod="${s}">拆下</button>` : ''}
    </div>`;
  }).join('');

  const avail = S.char.bag.filter(it => META.items[it.id] && META.items[it.id].modSlot);
  const availHtml = avail.map(it => {
    const d = META.items[it.id];
    return `<div class="recipe" data-tip="${it.id}">
      ${pxItem(it.id, 24)}
      <div class="rname">${esc(d.name)} <span class="miss">未安装</span></div>
      <div class="rmat">${SLOT_CN[d.modSlot]} · ${modEffect(d)} · 装上去才生效</div>
      <button class="btn" data-instmod="${it.id}">装上</button>
    </div>`;
  }).join('') || '<div class="hint">背包里没有可用的配件。</div>';

  // 背包里那些「放进去就生效」的配件，单独列出来，免得玩家以为也要装
  const bagBuffs = S.char.bag.filter(it => {
    const d = META.items[it.id];
    return d && d.bagEffect && !d.modSlot;
  }).map(it => {
    const d = META.items[it.id];
    return `<span class="bagbuff">${esc(d.name)}<em>${d.defBonus ? '防御 +' + d.defBonus : (d.lukBonus ? '幸运 +' + d.lukBonus : '省弹 20%')}</em></span>`;
  }).join('');

  openModal('改装 · ' + w.name + (w.plus ? ' +' + w.plus : ''), `
    <div class="hint" style="margin-bottom:8px">耐久 ${w.dur}/${w.maxDur} · 只有火器有改装槽 · <b>配件装上才生效</b></div>
    <div class="mod-grid">${slotHtml}</div>
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin:10px 0 6px">可用配件（需安装）</div>
    <div class="mod-avail">${availHtml}</div>
    ${bagBuffs ? `<div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin:10px 0 6px">放背包里已生效</div>
      <div class="bagbuffs">${bagBuffs}</div>` : ''}
  `, [{ label: '关闭', fn: closeModal }]);

  document.querySelectorAll('[data-instmod]').forEach(b => {
    b.onclick = async () => {
      await doAct('mod', { action: 'install', itemId: b.dataset.instmod });
      openMod();
    };
  });
  document.querySelectorAll('[data-unmod]').forEach(b => {
    b.onclick = async () => {
      await doAct('mod', { action: 'remove', slot: b.dataset.unmod });
      openMod();
    };
  });
}

// ================= 道具 / 换武器 =================
// 能不能一次用多个（和后端 isBatchable 保持一致）
function isBatchableItem(d) {
  return !!d && d.type === 'med' && !d.setStatus && !d.cureStatus && !d.repair;
}

// 能不能「使用」——必须和后端 game.js 的 useOne 支持的分支一一对应。
// 以前这里写的是 id 白名单，加了修理包忘了加进去，结果道具点不动。
// 改成按能力判断：med / throwable / hostile / 带 repair 的 / 地图 / 对讲机。
function isUsableItem(d, id) {
  if (!d) return false;
  return d.type === 'med' || d.type === 'throwable' || d.type === 'hostile'
    || !!d.repair || id === 'sp_map' || id === 'sp_radio';
}

function openItemPicker(ctxName) {
  // 同 id 合并：背包里同一种药可能被拆成好几格
  const seen = new Map();
  for (const it of S.char.bag) {
    const d = META.items[it.id];
    if (!d) continue;
    if (!isUsableItem(d, it.id)) continue;
    if (seen.has(it.id)) seen.get(it.id).n += it.n;
    else seen.set(it.id, { id: it.id, n: it.n });
  }
  const usable = [...seen.values()];
  if (!usable.length) { toast('没有可用的道具'); return; }

  // 排序：血包 → 精力药 → 其他药 → 对敌道具 → 投掷物。
  // 打起来最想点的就是回血的，不能让它排在第三屏
  const itemPrio = d => {
    if (!d) return 9;
    if (d.type === 'med') {
      if (d.hp > 0 && d.ep > 0) return 0;
      if (d.hp > 0) return 1;
      if (d.ep > 0) return 2;
      return 3;
    }
    if (d.type === 'hostile') return 4;
    if (d.type === 'throwable') return 5;
    return 6;
  };
  usable.sort((a, b) => {
    const pa = itemPrio(META.items[a.id]), pb = itemPrio(META.items[b.id]);
    if (pa !== pb) return pa - pb;
    return (META.items[a.id].name || '').localeCompare(META.items[b.id].name || '', 'zh');
  });

  const rows = usable.map(it => {
    const d = META.items[it.id];
    const batch = isBatchableItem(d) && it.n > 1;
    const maxN = Math.min(it.n, 99);
    const sel = batch
      ? `<select class="qty-sel" data-sel="${it.id}" title="一次用几个">${Array.from({ length: maxN }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>`
      : '';
    const label = d.type === 'throwable' ? '投掷' : (batch ? '用 1 个' : '使用');
    return `<div class="recipe" data-tip="${it.id}">
      ${pxItem(it.id, 24)}
      <div class="rname">${esc(d.name)} <span style="color:var(--dim)">x${it.n}</span></div>
      <div class="rmat">${esc(d.desc || '')}</div>
      ${sel}
      <button class="btn" data-use="${it.id}">${label}</button>
    </div>`;
  }).join('');

  openModal('使用道具', rows, [{ label: '返回', fn: () => renderModal() }], true);
  document.querySelectorAll('[data-use]').forEach(b => {
    const sel = document.querySelector(`[data-sel="${b.dataset.use}"]`);
    const fire = () => {
      const n = sel ? Math.max(1, parseInt(sel.value, 10) || 1) : 1;
      doAct(ctxName === 'battle' ? 'battle' : 'encounter', { choice: 'item', itemId: b.dataset.use, n });
    };
    b.onclick = fire;
    if (sel) sel.onchange = () => {
      b.textContent = `用 ${sel.value} 个`;
      // 悬浮提示也要按选中的数量重算，不然写着 +12 实际吃 3 个
      tipQtyId = b.dataset.use;
      tipQty = Math.max(1, parseInt(sel.value, 10) || 1);
      if (tipTarget && tipTarget.dataset && tipTarget.dataset.tip === tipQtyId) showTip(tipQtyId, lastMouse);
    };
    // 双击整行也能用，跟背包保持一致（下拉框上不要触发）
    const row = b.closest('.recipe');
    if (row) row.ondblclick = (e) => { if (e.target && e.target.tagName === 'SELECT') return; fire(); };
  });
}

function countAmmo(id) {
  return S.char.bag.filter(i => i.id === id).reduce((s, i) => s + i.n, 0);
}

function openSwapPicker() {
  const ws = S.char.bag.filter(it => META.items[it.id] && META.items[it.id].type === 'weapon');
  if (!ws.length) { toast('背包里没有别的武器'); return; }
  const rows = ws.map(it => {
    const d = META.items[it.id];
    const pp = plusOfEntry(it);
    const ammoTxt = d.ammo ? ` · ${META.items[d.ammo].name} x${countAmmo(d.ammo)}` : '';
    const fm = d.fire && META.fireModes ? META.fireModes[d.fire] : null;
    return `<div class="recipe" data-tip="${it.id}">
      ${pxItem(it.id, 24)}
      <div class="rname">${esc(d.name)}${pp ? `<b class="plus-tag">+${pp}</b>` : ''}</div>
      <div class="rmat">伤害 ${effDmgOf(it.id, pp)} · 噪音 ${d.noise}${fm ? ` · ${fm.name}` : ''}${ammoTxt}</div>
      <button class="btn" data-swap="${it.id}" data-swapplus="${pp}">换上</button>
    </div>`;
  }).join('');
  openModal('换武器', rows, [{ label: '返回', fn: () => renderModal() }], true);
  document.querySelectorAll('[data-swap]').forEach(b => {
    b.onclick = () => doAct('battle', { choice: 'swap', itemId: b.dataset.swap, plus: +b.dataset.swapplus || 0 });
  });
}

// ================= 背包 =================
let bagCat = 'all';
let bagPickMode = false;          // 勾选模式：点格子是选中，不是看详情
const bagPicked = new Set();      // 选中的 key：`id|plus`
// 刚合成/刚捡到的东西：下次打开背包时强制切到「全部」并高亮，避免"东西怎么不见了"
let pendingHighlight = null;      // { id, plus }

const BAG_CATS = [
  { key: 'all', name: '全部', test: () => true },
  { key: 'gear', name: '装备', test: d => ['weapon', 'armor', 'bag'].includes(d.type) },
  { key: 'med', name: '药物', test: d => d.type === 'med' },
  { key: 'hostile', name: '对敌', test: d => d.type === 'hostile' },
  { key: 'mat', name: '材料', test: d => d.type === 'material' },
  { key: 'ammo', name: '弹药', test: d => d.type === 'ammo' },
  { key: 'other', name: '其他', test: d => !['weapon', 'armor', 'bag', 'med', 'hostile', 'material', 'ammo'].includes(d.type) },
];

// 背包里这件装备强化到几级
const plusOfEntry = e => Math.max(0, Math.min(3, (e && e.plus) || 0));
const plusTxt = p => (p ? ' +' + p : '');
// 同 id 同强化等级一共有几件（装备位也算）
function copyCount(id, plus) {
  const c = S.char, d = META.items[id];
  if (!d) return 0;
  const slot = d.type === 'weapon' ? 'weapon' : d.slot;
  let n = c.bag.filter(x => x.id === id && plusOfEntry(x) === plus).length;
  const eq = c.equip[slot];
  if (eq && eq.id === id && plusOfEntry(eq) === plus) n++;
  return n;
}
// 强化后的实际数值：和 game.js 的 plusValue 完全一致 —— 百分比 + 至少 +N 点。
// 只按百分比算的话，安全帽（防御 3）+1 还是 3，强化等于没强化。
const plusMulOf = p => 1 + Math.max(0, Math.min(3, p || 0)) * 0.1;
function plusValOf(base, plus) {
  const b = base || 0;
  const p = Math.max(0, Math.min(3, plus || 0));
  if (!p) return b;
  return Math.max(b + p, Math.round(b * plusMulOf(p)));
}
function effDmgOf(id, plus) {
  const d = META.items[id];
  return d ? plusValOf(d.dmg, plus) : 0;
}
function effDefOf(id, plus) {
  const d = META.items[id];
  return d ? plusValOf(d.defense, plus) : 0;
}

$('#btnBag').onclick = () => {
  if (!S) return;
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }
  openBag(false);
};

let bagReturn = false;
function openBag(returnToScene) {
  if (returnToScene !== undefined) bagReturn = !!returnToScene;
  bagSel = null;
  // 有新东西要指给人看：切回「全部」，否则分类过滤会把它藏起来
  if (pendingHighlight) bagCat = 'all';
  // 勾选模式下，东西可能已经被用掉/丢掉，把不存在的 key 清掉
  if (bagPicked.size && S && S.char) {
    const alive = new Set(S.char.bag.map(x => x.id + '|' + plusOfEntry(x)));
    for (const k of [...bagPicked]) if (!alive.has(k)) bagPicked.delete(k);
  }
  const box = openModal('背包', bagHtml(), [{
    label: bagReturn ? '返回' : '关闭',
    fn: () => {
      if (bagReturn) { bagReturn = false; renderModal(); } else closeModal();
    },
  }]);
  box.classList.add('mid');
  bindBag();
  // 滚到高亮那件，3 秒后取消高亮
  if (pendingHighlight) {
    const key = pendingHighlight.id + '|' + (pendingHighlight.plus || 0);
    const cell = box.querySelector(`.bag-cell[data-key="${key}"]`);
    if (cell) {
      cell.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => cell.classList.remove('new-item'), 3000);
    }
    pendingHighlight = null;
  }
}

// 从战利品/开箱里打开背包：关掉背包后回到原来那一页
function openBagFromScene() { openBag(true); }

function bagHtml() {
  const c = S.char;
  const cur = BAG_CATS.find(x => x.key === bagCat) || BAG_CATS[0];

  const catTabs = BAG_CATS.map(cat => {
    const n = c.bag.filter(it => {
      const d = META.items[it.id];
      return d && cat.test(d);
    }).length;
    return `<button class="bag-cat ${cat.key === bagCat ? 'active' : ''}" data-bagcat="${cat.key}">${cat.name}<em>${n}</em></button>`;
  }).join('');

  // 同 id + 同强化等级 合并显示（堆叠上限会拆成多格，强化等级不同也不能并）
  const seen = new Map();
  const list = [];
  c.bag.forEach((it, i) => {
    const d = META.items[it.id];
    if (!d || !cur.test(d)) return;
    const plus = plusOfEntry(it);
    const key = it.id + '|' + plus;
    if (seen.has(key)) {
      seen.get(key).n += it.n;
    } else {
      const o = { id: it.id, n: it.n, plus, key, idx: i, affix: it.affix || null };
      seen.set(key, o);
      list.push(o);
    }
  });

  // 预先统计「同 id + 同强化等级」的总件数（含装备位），用来判断能不能二合一
  const copyMap = new Map();
  const bump = e => {
    if (!e) return;
    const k = e.id + '|' + plusOfEntry(e);
    copyMap.set(k, (copyMap.get(k) || 0) + 1);
  };
  c.bag.forEach(bump);
  ['weapon', 'head', 'body', 'hands', 'legs', 'face', 'feet', 'bag'].forEach(s => bump(c.equip[s]));
  const MAXP = META.maxPlus || 3;

  let cells = '';
  list.forEach(it => {
    const d = META.items[it.id];
    const rar = d.rarity >= 5 ? ' rar5' : '';
    const up = isUpgrade(d, it.plus) ? '<i class="up-dot" title="比身上这件强"></i>' : '';
    const picked = bagPicked.has(it.key) ? ' picked' : '';
    const chk = bagPickMode ? `<i class="bag-chk${picked ? ' on' : ''}"></i>` : '';
    const pl = it.plus ? `<b class="plus-tag">+${it.plus}</b>` : '';
    const isNew = pendingHighlight && pendingHighlight.id === it.id
      && plusOfEntry({ plus: pendingHighlight.plus }) === it.plus ? ' new-item' : '';
    // 能二合一强化：同种同等级凑够 2 件且没到 +3
    const enhOk = (d.type === 'weapon' || d.type === 'armor')
      && it.plus < MAXP
      && (copyMap.get(it.key) || 0) >= 2;
    const enh = enhOk
      ? `<i class="enh-dot" title="可以强化：两件 ${esc(d.name)}${plusTxt(it.plus)} 合成 +${it.plus + 1}">＋</i>`
      : '';
    // 有附魔词条的格子左上角点一颗紫点
    const afxDot = (it.affix && it.affix.length)
      ? `<i class="affix-dot" title="附魔：${affixTxt(it)}"></i>` : '';
    cells += `<div class="bag-cell t-${d.type}${rar}${picked}${isNew}${enhOk ? ' enh-able' : ''}" data-id="${it.id}" data-plus="${it.plus}" data-key="${it.key}" data-tip="${it.id}" data-tip-plus="${it.plus}">
      ${up}${enh}${afxDot}${chk}
      <div class="bc-inner">
        ${pxItem(it.id, 24)}
        <div class="bc-txt"><div class="cn">${esc(d.name)}${pl}</div></div>
      </div>
      <div class="cs">${d.size}格</div>
      <div class="cc">x${it.n}</div>
    </div>`;
  });

  // 只有「全部」分类补空格子，分类视图不补
  if (bagCat === 'all') {
    const empty = Math.max(0, c.slots - c.used);
    for (let i = 0; i < empty; i++) cells += '<div class="bag-cell empty"></div>';
  }
  if (!cells) cells = '<div class="hint" style="padding:8px">这一类里没有东西。</div>';

  const legend = bagCat === 'all' ? `<div class="bag-legend">
    <span><i style="background:rgba(200,69,58,.4);border-color:rgba(200,69,58,.85)"></i>武器</span>
    <span><i style="background:rgba(90,130,170,.4);border-color:rgba(90,130,170,.85)"></i>防具</span>
    <span><i style="background:rgba(150,110,60,.4);border-color:rgba(150,110,60,.85)"></i>背包</span>
    <span><i style="background:rgba(111,168,79,.4);border-color:rgba(111,168,79,.85)"></i>药物</span>
    <span><i style="background:rgba(190,110,200,.4);border-color:rgba(190,110,200,.85)"></i>对敌</span>
    <span><i style="background:rgba(220,130,60,.4);border-color:rgba(220,130,60,.85)"></i>暗器</span>
    <span><i style="background:rgba(200,170,80,.4);border-color:rgba(200,170,80,.85)"></i>弹药</span>
    <span><i style="background:rgba(140,130,110,.4);border-color:rgba(140,130,110,.85)"></i>材料</span>
    <span><i style="background:rgba(150,100,180,.4);border-color:rgba(150,100,180,.85)"></i>配件</span>
  </div>` : '';

  const pickBar = bagPickMode ? `<div class="bag-pickbar">
      <span>已勾选 <b>${bagPicked.size}</b> 件</span>
      <button class="btn tiny" id="btnPickAll">全选本页</button>
      <button class="btn tiny" id="btnPickNone">清空</button>
      <button class="btn tiny danger" id="btnPickDrop">丢弃勾选</button>
      <button class="btn tiny" id="btnPickExit">退出</button>
    </div>` : '';

  return `
    <div class="bag-head">
      <span>格数 ${c.used} / ${c.slots}</span>
      <span>金币 <b style="color:var(--accent)">¥${c.gold || 0}</b> · 基础 ${META.baseSlots} + 背包 ${c.slots - META.baseSlots}</span>
      <button class="btn tiny" id="btnSortBag">整理</button>
      <button class="btn tiny ${bagPickMode ? 'danger' : ''}" id="btnPickBag">${bagPickMode ? '勾选中' : '勾选丢弃'}</button>
    </div>
    ${pickBar}
    <div class="bag-cats">${catTabs}</div>
    ${legend}
    <div class="bag-grid">${cells}</div>
    <div id="itemDetail"><div class="item-hint">${bagPickMode ? '勾选模式下：点格子 = 勾选／取消，勾完点「丢弃勾选」' : '点一件东西看详情 · 双击直接使用／穿上'}</div></div>`;
}

// 背包里这件东西是否比身上那件强（武器看伤害，防具看同部位防御，都算上强化 +N）
function isUpgrade(d, plus) {
  if (!S || !S.char) return false;
  const c = S.char;
  const p = plus || 0;
  if (d.type === 'weapon') {
    const cur = c.equip.weapon;
    return effDmgOf(d.id, p) > (cur ? effDmgOf(cur.id, cur.plus) : 5);
  }
  if (d.type === 'armor') {
    const cur = c.equip[d.slot];
    return effDefOf(d.id, p) > (cur ? effDefOf(cur.id, cur.plus) : 0);
  }
  return false;
}

function bindBag() {
  document.querySelectorAll('[data-bagcat]').forEach(b => {
    b.onclick = () => { bagCat = b.dataset.bagcat; openBag(); };
  });

  // 勾选模式：点格子 = 勾选／取消
  document.querySelectorAll('.bag-cell[data-id]').forEach(cell => {
    cell.onclick = () => {
      const key = cell.dataset.key;
      const plus = +cell.dataset.plus || 0;
      if (bagPickMode) {
        if (bagPicked.has(key)) bagPicked.delete(key);
        else bagPicked.add(key);
        cell.classList.toggle('picked', bagPicked.has(key));
        const chk = cell.querySelector('.bag-chk');
        if (chk) chk.classList.toggle('on', bagPicked.has(key));
        const cnt = document.querySelector('.bag-pickbar b');
        if (cnt) cnt.textContent = bagPicked.size;
        return;
      }
      bagSel = cell.dataset.id;
      showItemDetail(bagSel, plus);
    };
    // 双击：装备类直接穿上，消耗类直接用 1 个
    cell.ondblclick = async (ev) => {
      if (ev) ev.preventDefault();
      if (bagPickMode) return;
      const id = cell.dataset.id;
      const plus = +cell.dataset.plus || 0;
      const d = META.items[id];
      if (!d) return;
      if (d.type === 'weapon' || d.type === 'armor' || d.type === 'bag') {
        const cur = S.char.equip[d.slot];
        if (cur && cur.id === id && plusOfEntry(cur) === plus) { toast('已经穿在身上了'); return; }
        await doAct('equip', { itemId: id, plus });
        if (S && S.scene === 'map') openBag();
        return;
      }
      const usable = d.type === 'med' || d.type === 'throwable' || d.type === 'hostile' || id === 'sp_map' || id === 'sp_radio';
      if (!usable) return;
      await doAct('use', { itemId: id, n: 1 });
      // doAct 内部 render() 会关掉弹窗，这里重新打开
      if (S && S.scene === 'map') openBag();
    };
  });

  const sortBtn = $('#btnSortBag');
  if (sortBtn) sortBtn.onclick = async () => { await doAct('sort_bag', {}); openBag(); };

  // 勾选丢弃
  const pickBtn = $('#btnPickBag');
  if (pickBtn) pickBtn.onclick = () => {
    bagPickMode = !bagPickMode;
    if (!bagPickMode) bagPicked.clear();
    openBag();
  };
  const pickExit = $('#btnPickExit');
  if (pickExit) pickExit.onclick = () => { bagPickMode = false; bagPicked.clear(); openBag(); };
  const pickAll = $('#btnPickAll');
  if (pickAll) pickAll.onclick = () => {
    document.querySelectorAll('.bag-cell[data-key]').forEach(cell => bagPicked.add(cell.dataset.key));
    openBag();
  };
  const pickNone = $('#btnPickNone');
  if (pickNone) pickNone.onclick = () => { bagPicked.clear(); openBag(); };

  const pickDrop = $('#btnPickDrop');
  if (pickDrop) pickDrop.onclick = () => {
    if (!bagPicked.size) { toast('还没勾选东西'); return; }
    // 把 key 还原成 {id, plus, n}
    const specs = [];
    const risky = [];
    bagPicked.forEach(key => {
      const [id, p] = key.split('|');
      const plus = +p || 0;
      const d = META.items[id];
      if (!d) return;
      const n = S.char.bag.filter(x => x.id === id && plusOfEntry(x) === plus).reduce((s, x) => s + x.n, 0);
      if (!n) return;
      specs.push({ id, plus, n });
      if (isUpgrade(d, plus)) risky.push(`${d.name}${plusTxt(plus)}`);
    });
    if (!specs.length) { toast('这些东西已经不在包里了'); openBag(); return; }
    const doIt = async () => {
      await doAct('drop', { ids: specs });
      bagPicked.clear();
      bagPickMode = false;
      openBag();
    };
    if (risky.length) {
      // 里面有比身上更好的装备，必须再确认一次
      confirmBox('确认丢弃？', `<div class="warn-line">这些比你身上的还好，丢了就找不回来了：</div>
        <div class="pick-list">${risky.map(x => `<span>${esc(x)}</span>`).join('')}</div>`,
        '我知道，全丢', doIt, () => openBag());
    } else {
      doIt();
    }
  };
}

// 二次确认弹窗：不给 ×，必须点按钮
function confirmBox(title, html, okLabel, onOk, onCancel) {
  openModal(title, `<div class="confirm-body">${html}</div>`, [
    { label: '取消', fn: onCancel || closeModal },
    { label: okLabel, cls: 'danger', fn: onOk },
  ], true);
}

function showItemDetail(itemId, plus) {
  const c = S.char;
  const p = plusOfEntry({ plus });
  const it = {
    id: itemId,
    plus: p,
    n: c.bag.filter(i => i.id === itemId && plusOfEntry(i) === p).reduce((s, i) => s + i.n, 0),
  };
  if (!it.n) return;
  const d = META.items[it.id];
  const box = $('#itemDetail');
  if (!box) return;

  // 可批量使用的物品（药物，且不是状态/解除/修理类）
  const batchable = d.type === 'med' && !d.setStatus && !d.cureStatus && !d.repair;
  const curEq = S.char.equip[d.slot];

  let actions = '';
  if (d.type === 'weapon' || d.type === 'armor' || d.type === 'bag') {
    const same = curEq && curEq.id === it.id && plusOfEntry(curEq) === p;
    actions += `<button class="btn" data-eq="${it.id}" data-eqplus="${p}" ${same ? 'disabled' : ''}>${same ? '已装备' : (curEq ? '更换' : '装备')}</button>`;
  }
  // 强化：两件同种同 +N 合成一件 +N+1
  if (d.type === 'weapon' || d.type === 'armor') {
    const MAXP = META.maxPlus || 3;
    if (p >= MAXP) {
      actions += `<div class="qty-row"><span class="qty-label">已经强化到 +${MAXP}（满级）</span></div>`;
    } else {
      const have = copyCount(it.id, p);
      const ok = have >= 2;
      // 装备位也算在内，可能凑出 3 件；别显示成「3/2 件」那么别扭
      const haveTxt = have >= 2 ? '2/2 件' : `${have}/2 件`;
      // 装备位有没有同名同级的：有的话优先强化它（那才是你在用的）
      const slotKey = d.type === 'weapon' ? 'weapon' : d.slot;
      const eqSame = S.char.equip[slotKey]
        && S.char.equip[slotKey].id === it.id
        && plusOfEntry(S.char.equip[slotKey]) === p;
      const target = eqSame ? '会强化你正在用的那件' : '强化背包里这件';
      actions += `<div class="qty-row">
        <span class="qty-label">强化 +${p} → +${p + 1}</span>
        <span class="qty-val" title="同种同强化等级一共 ${have} 件（含装备中的）">${haveTxt}</span>
        <button class="btn ${ok ? 'primary' : ''}" data-enh="${it.id}" data-enhplus="${p}" ${ok ? '' : 'disabled'}>${ok ? `强化（属性 +${(p + 1) * 10}%）` : `还差 ${2 - have} 件`}</button>
      </div>`
        + `<div class="enh-hint">${eqSame ? '⚠ ' : ''}${target}${eqSame ? '，背包里这件会被当材料消耗掉' : ''}`
        + `<br>+2 附 1 条随机属性，+3 再附 1 条（单条最高 +10）</div>`;
    }
  }
  if (batchable && it.n > 1) {
    const maxN = Math.min(it.n, 99);
    actions += `<div class="qty-row">
      <span class="qty-label">一次用</span>
      <input type="range" class="qty-range" id="useQty" min="1" max="${maxN}" value="1">
      <span class="qty-val" id="useQtyVal">1</span>
      <button class="btn primary" data-usen="${it.id}">使用 1 个</button>
    </div>`;
  } else if (isUsableItem(d, it.id)) {
    if (d.type === 'hostile') {
      // 对敌道具：战斗中直接扔出去；地图上只能埋设
      const inBattle = S.scene === 'battle';
      actions += `<button class="btn primary" data-use2="${it.id}" ${inBattle ? '' : 'disabled'}>${inBattle ? '对敌使用' : '战斗中才能对敌使用'}</button>`;
      actions += `<button class="btn" data-trap="${it.id}" ${S.scene === 'map' ? '' : 'disabled'}>埋设在这里</button>`;
    } else {
      // 修理包：先把当前武器耐久摆出来，不然不知道该不该用
      if (d.repair) {
        const w = S.weapon;
        if (!w) {
          actions += `<div class="enh-hint">手上没有武器，修不了。</div>`;
        } else if (w.dur >= w.maxDur) {
          actions += `<div class="enh-hint">${esc(w.name)} 耐久 ${w.dur}/${w.maxDur}，已经满了。</div>`;
        } else {
          const after = Math.min(w.maxDur, w.dur + d.repair);
          actions += `<div class="enh-hint">${esc(w.name)} 耐久 ${w.dur}/${w.maxDur} → ${after}/${w.maxDur}（+${after - w.dur}）</div>`;
        }
      }
      actions += `<button class="btn" data-use2="${it.id}">使用</button>`;
    }
  }
  // 丢弃：和使用同一套滑块逻辑，数量由玩家自己选，一键丢
  if (it.n > 1) {
    const maxDrop = Math.min(it.n, 99);
    actions += `<div class="qty-row qty-drop">
      <span class="qty-label">丢弃数量</span>
      <input type="range" class="qty-range" id="dropQty" min="1" max="${maxDrop}" value="1">
      <span class="qty-val" id="dropQtyVal">1</span>
      <button class="btn danger" data-dropn="${it.id}" data-dropplus="${p}">丢弃 1 个</button>
      <button class="btn tiny" data-dropall="${it.id}" data-dropplus="${p}">全丢</button>
    </div>`;
  } else {
    actions += `<button class="btn danger" data-drop="${it.id}" data-dropplus="${p}">丢弃</button>`;
  }

  let stat = '';
  if (d.type === 'weapon') {
    const fm = d.fire && META.fireModes ? META.fireModes[d.fire] : null;
    const dm = effDmgOf(d.id, p);
    stat = `伤害 ${dm}${p ? `（基础 ${d.dmg}，+${p} 强化）` : ''} · 噪音 ${d.noise}`
      + (d.ammo ? ` · 弹药 ${META.items[d.ammo].name}` : ' · 无弹药需求')
      + (fm ? ` · ${fm.name}（${fm.shots} 发/次，${fm.note}）` : '');
  } else if (d.type === 'armor') {
    const df = effDefOf(d.id, p);
    stat = `防御 +${df}${p ? `（基础 ${d.defense}，+${p} 强化）` : ''} · 部位 ${META.slotNames[d.slot]}`;
  } else if (d.type === 'bag') stat = `容量 +${d.bagBonus} 格`;
  else if (d.type === 'med') stat = [d.hp ? `生命 +${d.hp}` : '', d.ep ? `精力 ${d.ep > 0 ? '+' : ''}${d.ep}` : '',
    d.buff ? Object.entries(d.buff).map(([k, v]) => `${META.attrNames[k]} ${v > 0 ? '+' : ''}${v}`).join(' ') : '',
    d.perm ? Object.entries(d.perm).map(([k, v]) => `${META.attrNames[k]} 永久 +${v}`).join(' ') : ''].filter(Boolean).join(' · ');
  else if (d.type === 'hostile') {
    const f = d.foe || {};
    const turns = f.turns || 1;
    const bits = [];
    if (f.freeze) bits.push(f.freeze >= turns ? '全程无法行动' : `前 ${f.freeze} 回合无法行动`);
    if (f.blindPen) bits.push(`命中 -${f.blindPen}`);
    if (f.atkMul < 1) bits.push(`攻击 -${Math.round((1 - f.atkMul) * 100)}%`);
    if (f.dotPct) bits.push(`每回合掉 ${Math.round(f.dotPct * 100)}% 生命`);
    stat = `对敌道具 · ${bits.join('，')}（持续 ${turns} 回合）`;
  }
  else if (d.type === 'ammo') stat = `弹药 · 可堆叠 ${d.stack}`;
  else if (d.type === 'buff') {
    const eff = [];
    if (d.noiseCut) eff.push(`噪音 -${d.noiseCut}`);
    if (d.accBonus) eff.push(`命中 +${d.accBonus}%`);
    if (d.dmgBonus) eff.push(`伤害 +${Math.round(d.dmgBonus * 100)}%`);
    if (d.defBonus) eff.push(`防御 +${d.defBonus}`);
    if (d.lukBonus) eff.push(`幸运 +${d.lukBonus}`);
    if (d.ammoSave) eff.push(`省弹 ${d.ammoSave}%`);
    const how = d.modSlot
      ? '必须装到武器上才生效（改装界面安装），放背包里没用'
      : '放在背包里就生效，不用安装';
    stat = `${eff.join(' · ')} —— <b style="color:var(--warn)">${how}</b>`;
  }

  // 实际效果：按当前血量和属性算一遍，写着 +15 就别再让人猜到底加多少
  // 实际效果：按当前血量和属性算；n 是「这次用几个」，滑块一动就重算
  const realHtml = (n = 1) => {
    const times = Math.max(1, n | 0);
    if (d.type === 'med') {
      const rows = [];
      if (d.hp) {
        const cap = c.hpMax, cur = c.hp, total = d.hp * times;
        const got = Math.max(0, Math.min(total, cap - cur));
        const waste = total - got;
        rows.push(`<span>生命 ${cur}/${cap} → <b class="${got > 0 ? 'up' : 'flat'}">${Math.min(cap, cur + total)}/${cap}</b>
          <em class="${got > 0 ? 'up' : 'flat'}">+${got}</em>${waste > 0 ? `<i>（${waste} 点溢出，浪费）</i>` : ''}</span>`);
      }
      if (d.ep) {
        const cap = c.epMax, cur = c.ep, total = d.ep * times;
        const next = Math.max(0, Math.min(cap, cur + total));
        rows.push(`<span>精力 ${cur}/${cap} → <b class="${next > cur ? 'up' : (next < cur ? 'down' : 'flat')}">${next}/${cap}</b>
          <em class="${next > cur ? 'up' : (next < cur ? 'down' : 'flat')}">${next - cur >= 0 ? '+' : ''}${next - cur}</em></span>`);
      }
      if (d.buff) {
        for (const k in d.buff) {
          const now = c.eff[k], delta = d.buff[k] * times;
          const next = Math.max(1, Math.min(100, now + delta));
          rows.push(`<span>${META.attrNames[k]} ${now} → <b class="${next > now ? 'up' : (next < now ? 'down' : 'flat')}">${next}</b>
            <em class="${next > now ? 'up' : (next < now ? 'down' : 'flat')}">${delta > 0 ? '+' : ''}${delta}</em><i>（本局有效）</i></span>`);
        }
      }
      if (!rows.length) return '';
      return `<div class="item-real"><div class="ir-head">实际效果${times > 1 ? `（一次用 ${times} 个）` : ''}</div>${rows.join('')}</div>`;
    }
    if (d.type === 'weapon') {
      const curDmg = curEq ? effDmgOf(curEq.id, curEq.plus) : 5;
      const myDmg = effDmgOf(d.id, p);
      const diff = myDmg - curDmg;
      const fm = d.fire && META.fireModes ? META.fireModes[d.fire] : null;
      const curFm = curEq && META.items[curEq.id].fire && META.fireModes ? META.fireModes[META.items[curEq.id].fire] : null;
      return `<div class="item-real"><div class="ir-head">换上去的变化</div>
        <span>伤害 ${curDmg} → <b class="${diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')}">${myDmg}</b>
        <em class="${diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')}">${diff > 0 ? '+' : ''}${diff}</em>
        <i>（当前：${curEq ? esc(META.items[curEq.id].name) + plusTxt(curEq.plus) : '空手'}）</i></span>
        ${fm ? `<span>射击方式 <b>${fm.name}</b> · 一次 ${fm.shots} 发，单发 ${Math.round(fm.per * 100)}%
          <i>（${fm.note}）</i></span>` : ''}
        ${fm && curFm && fm.shots !== curFm.shots ? `<span>连发 ${curFm.shots} 发 → <b class="${fm.shots > curFm.shots ? 'up' : 'down'}">${fm.shots} 发</b></span>` : ''}
        ${d.noise !== (curEq ? META.items[curEq.id].noise : 0) ? `<span>噪音 ${curEq ? META.items[curEq.id].noise : 0} → <b class="${d.noise < (curEq ? META.items[curEq.id].noise : 0) ? 'up' : 'down'}">${d.noise}</b></span>` : ''}
      </div>`;
    }
    if (d.type === 'armor') {
      const curDef = curEq ? effDefOf(curEq.id, curEq.plus) : 0;
      const myDef = effDefOf(d.id, p);
      const diff = myDef - curDef;
      return `<div class="item-real"><div class="ir-head">换上去的变化</div>
        <span>防御 ${curDef} → <b class="${diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')}">${myDef}</b>
        <em class="${diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')}">${diff > 0 ? '+' : ''}${diff}</em>
        <i>（当前：${curEq ? esc(META.items[curEq.id].name) + plusTxt(curEq.plus) : '这个部位空着'}）</i></span>
      </div>`;
    }
    if (d.type === 'bag') {
      const cur = curEq ? META.items[curEq.id] : null;
      const curCap = cur ? (cur.bagBonus || 0) : 0;
      const diff = (d.bagBonus || 0) - curCap;
      return `<div class="item-real"><div class="ir-head">换上去的变化</div>
        <span>容量 ${curCap} → <b class="${diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')}">${d.bagBonus}</b>
        <em class="${diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat')}">${diff > 0 ? '+' : ''}${diff}</em></span>
      </div>`;
    }
    return '';
  };

  const myAffix = affixTxt(findEntry(it.id, p));
  box.innerHTML = `<div class="item-detail">
    <div class="t">${esc(d.name)}${p ? `<b class="plus-tag">+${p}</b>` : ''} ${(d.type === 'weapon' || d.type === 'armor' || d.type === 'bag') ? gradeHtml(p, findEntry(it.id, p)) : ''} <span style="font-size:11px;color:var(--dim)">x${it.n}</span></div>
    <div class="d">${esc(d.desc || '')}</div>
    <div style="color:var(--accent)">${stat}</div>
    ${myAffix ? `<div class="item-affix">附魔：${myAffix}</div>` : ''}
    <div class="item-actions">${actions}</div>
    <div id="itemReal">${realHtml(1)}</div>
  </div>`;

  // 键盘流：空格选中格子后，焦点直接落到详情里的第一个操作按钮，再按空格就执行
  if (kbEl && kbEl.dataset && kbEl.dataset.id === itemId) {
    const first = box.querySelector('.item-actions .btn');
    if (first) kbSet(first);
  }

  box.querySelectorAll('[data-eq]').forEach(b => b.onclick = async () => {
    await doAct('equip', { itemId: b.dataset.eq, plus: +b.dataset.eqplus || 0 });
    openBag();
  });
  box.querySelectorAll('[data-use2]').forEach(b => b.onclick = async () => {
    // 战斗中在背包里用道具，必须走 battle 动作，否则等于白嫖一个回合
    if (S.scene === 'battle') await doAct('battle', { choice: 'item', itemId: b.dataset.use2, n: 1 });
    else await doAct('use', { itemId: b.dataset.use2 });
    if (S.scene === 'map') openBag(); else closeModal();
  });
  box.querySelectorAll('[data-trap]').forEach(b => b.onclick = async () => {
    await doAct('trap', { itemId: b.dataset.trap });
    openBag();
  });
  box.querySelectorAll('[data-enh]').forEach(b => b.onclick = async () => {
    // 先把 id 取出来：doAct 会重建弹窗 DOM，回头再读 dataset 不稳
    const itemId = b.dataset.enh;
    const plus = +b.dataset.enhplus || 0;
    const j = await doAct('enhance', { itemId, plus });
    // 强化成功要说清楚强化的是哪一件，否则玩家会以为没生效
    if (j && j.ok && j.plus) {
      const nm = (META.items[itemId] || {}).name || '';
      toast(j.where === 'equip'
        ? `你正在用的 ${nm} 已强化到 +${j.plus}`
        : `背包里的 ${nm} 已强化到 +${j.plus}`);
    }
    openBag();
  });

  // 丢弃：比身上好的装备要二次确认
  const askDrop = (id, n, pp) => {
    const dd = META.items[id];
    const run = async () => { await doAct('drop', { itemId: id, n, plus: pp }); openBag(); };
    if (dd && isUpgrade(dd, pp)) {
      confirmBox('确认丢弃？',
        `<div class="warn-line">${esc(dd.name)}${plusTxt(pp)} 比你身上的还好，丢了就找不回来了。</div>`,
        '还是丢掉', run, () => openBag());
    } else {
      run();
    }
  };
  box.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => askDrop(b.dataset.drop, 1, b.dataset.dropplus === '' ? null : +b.dataset.dropplus));

  // 批量使用滑块
  const qty = box.querySelector('#useQty');
  if (qty) {
    const btn = box.querySelector('[data-usen]');
    const val = box.querySelector('#useQtyVal');
    const upd = () => {
      val.textContent = qty.value;
      btn.textContent = `使用 ${qty.value} 个`;
      // 数量一变，下面的「实际效果」要跟着重算
      const r = box.querySelector('#itemReal');
      if (r) r.innerHTML = realHtml(+qty.value);
      // 悬浮提示也按这个数量算，免得「写着 +15、下面显示 +72」
      tipQtyId = itemId; tipQty = Math.max(1, parseInt(qty.value, 10) || 1);
      if (tipTarget && tipTarget.dataset && tipTarget.dataset.tip === itemId) showTip(itemId, lastMouse);
    };
    qty.oninput = upd;
    btn.onclick = async () => {
      const n = +qty.value;
      await doAct('use', { itemId: btn.dataset.usen, n });
      if (S.scene === 'map') openBag(); else closeModal();
    };
  }

  // 丢弃滑块（和上面的使用滑块同一套交互）
  const dq = box.querySelector('#dropQty');
  if (dq) {
    const dbtn = box.querySelector('[data-dropn]');
    const dval = box.querySelector('#dropQtyVal');
    const dupd = () => {
      dval.textContent = dq.value;
      dbtn.textContent = `丢弃 ${dq.value} 个`;
    };
    dq.oninput = dupd;
    dbtn.onclick = () => askDrop(dbtn.dataset.dropn, +dq.value, dbtn.dataset.dropplus === '' ? null : +dbtn.dataset.dropplus);
    const all = box.querySelector('[data-dropall]');
    if (all) all.onclick = () => askDrop(all.dataset.dropall, +dq.max, all.dataset.dropplus === '' ? null : +all.dataset.dropplus);
  }
}

// ================= 合成红点 =================
// 装备类可合成 → 红点；增益/消耗类 → 绿点
const CRAFT_RED_CATS = ['武器', '防具', '背包', '配件'];

let craftSeen = new Set();
let lastCraftTip = '';   // 刚合成出来的东西，显示在合成台顶部，避免"东西怎么不见了"
try { craftSeen = new Set(JSON.parse(localStorage.getItem('br_craftSeen') || '[]')); } catch (e) { craftSeen = new Set(); }

function saveCraftSeen() {
  try { localStorage.setItem('br_craftSeen', JSON.stringify([...craftSeen])); } catch (e) { /* ignore */ }
}

// 当前材料+智力够得着的配方
function craftableList() {
  if (!S || !S.char) return [];
  const c = S.char;
  const int = c.eff.int;
  const out = [];
  for (const r of META.recipes) {
    if (int < r.reqInt) continue;
    if (r.reqLv && (S.char.level || 1) < r.reqLv) continue;
    let ok = true;
    for (const [id, n] of r.inp) {
      const have = c.bag.filter(i => i.id === id).reduce((s, i) => s + i.n, 0);
      if (have < n) { ok = false; break; }
    }
    if (ok) out.push(r);
  }
  return out;
}

// 还没被"知道了"标记过的
function freshCraftable() {
  return craftableList().filter(r => !craftSeen.has(r.id));
}

function updateCraftDot() {
  const dot = $('#craftDot');
  if (!dot || !S) return;
  const list = craftableList();
  const ids = new Set(list.map(r => r.id));

  // 已经做不了配方从已读里移除，下次凑齐会重新提示
  let changed = false;
  for (const id of [...craftSeen]) {
    if (!ids.has(id)) { craftSeen.delete(id); changed = true; }
  }
  if (changed) saveCraftSeen();

  const fresh = list.filter(r => !craftSeen.has(r.id));
  if (!fresh.length) { dot.classList.add('hidden'); return; }
  const hasRed = fresh.some(r => CRAFT_RED_CATS.includes(r.cat));
  dot.classList.remove('hidden');
  dot.classList.toggle('green', !hasRed);
}

function markCraftSeen() {
  craftableList().forEach(r => craftSeen.add(r.id));
  saveCraftSeen();
  updateCraftDot();
}

function craftTipHtml() {
  const fresh = freshCraftable();
  if (!fresh.length) return '';
  const red = fresh.filter(r => CRAFT_RED_CATS.includes(r.cat));
  const green = fresh.filter(r => !CRAFT_RED_CATS.includes(r.cat));
  const fmt = arr => arr.map(r => esc(r.name)).join('、');
  let h = '<div class="tip-name">现在可以合成</div>';
  if (red.length) h += `<div class="tip-use" style="color:var(--accent)">装备类：${fmt(red)}</div>`;
  if (green.length) h += `<div class="tip-use" style="color:var(--good)">增益类：${fmt(green)}</div>`;
  h += '<div class="tip-note">点开合成台可以一键标记已读</div>';
  return h;
}

// ================= 合成 =================
$('#btnCraft').onclick = () => {
  if (!S) return;
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }
  craftCat = '全部';
  openCraft();
};

function openCraft() {
  const box = openModal('合成台', craftHtml(), [{ label: '关闭', fn: closeModal }]);
  box.classList.add('wide');
  bindCraft();
}

// 背包在「扣掉这些材料之后」还塞得下 n 个 id 吗 —— 规则和 game.js 的 canFit 一致。
// 必须模拟扣材料：材料刚好用完会腾出格子，不模拟的话会把「其实能合」误判成背包满
function bagCanFit(id, n, inputs) {
  const d = META.items[id];
  if (!d || !S || !S.char) return true;
  const c = S.char;
  const bag = c.bag.map(x => ({ id: x.id, n: x.n }));
  for (const [iid, need] of (inputs || [])) {
    let left = need;
    for (let i = bag.length - 1; i >= 0 && left > 0; i--) {
      if (bag[i].id !== iid) continue;
      const t = Math.min(bag[i].n, left);
      bag[i].n -= t; left -= t;
      if (bag[i].n <= 0) bag.splice(i, 1);
    }
  }
  const size = d.size || 1;
  let room = 0;
  for (const it of bag) {
    if (it.id === id && it.n < d.stack) room += d.stack - it.n;
  }
  const used = bag.reduce((s, it) => s + ((META.items[it.id] || {}).size || 1), 0);
  const free = Math.max(0, (c.slots || META.baseSlots) - used);
  room += Math.floor(free / size) * d.stack;
  return room >= n;
}

function craftHtml() {
  const c = S.char;
  const int = c.eff.int;
  const fresh = freshCraftable();
  const freshIds = new Set(fresh.map(r => r.id));

  const cats = ['全部', ...new Set(META.recipes.map(r => r.cat))];
  const tabs = cats.map(k => {
    const inCat = fresh.filter(r => k === '全部' || r.cat === k);
    let dot = '';
    if (inCat.length) {
      const isRed = inCat.some(r => CRAFT_RED_CATS.includes(r.cat));
      dot = `<span class="cdot ${isRed ? 'red' : 'green'}"></span>`;
    }
    return `<button class="cat-tab ${k === craftCat ? 'active' : ''}" data-cat="${k}">${k}${dot}</button>`;
  }).join('');

  // 顶部提示条：列出当前能做的
  let tipBar = '';
  if (fresh.length) {
    const red = fresh.filter(r => CRAFT_RED_CATS.includes(r.cat));
    const green = fresh.filter(r => !CRAFT_RED_CATS.includes(r.cat));
    const fmt = arr => arr.map(r => `<b>${esc(r.name)}</b>`).join('、');
    const parts = [];
    if (red.length) parts.push(`<span style="color:var(--accent)">装备类 ${fmt(red)}</span>`);
    if (green.length) parts.push(`<span class="g">增益类 ${fmt(green)}</span>`);
    tipBar = `<div class="craft-tip">
      <span class="ct-txt">现在可以合成：${parts.join('　')}</span>
      <button class="btn" id="btnCraftSeen">知道了</button>
    </div>`;
  }

  const list = META.recipes.filter(r => craftCat === '全部' || r.cat === craftCat).map(r => {
    const outName = META.items[r.out[0]].name;
    let matsOk = true;
    const mats = r.inp.map(([id, n]) => {
      const have = c.bag.filter(i => i.id === id).reduce((s, i) => s + i.n, 0);
      if (have < n) matsOk = false;
      return `<span class="${have >= n ? 'have' : 'miss'}">${META.items[id].name} ${have}/${n}</span>`;
    }).join(' + ');
    const intOk = int >= r.reqInt;
    const lvOk = !r.reqLv || (S.char.level || 1) >= r.reqLv;
    const spaceOk = bagCanFit(r.out[0], r.out[1], r.inp);
    const can = intOk && matsOk && lvOk && spaceOk;
    // 按钮文案按「最先卡住的那一条」说，别让人猜
    const why = !lvOk ? '等级不足' : (!intOk ? '智力不足' : (!matsOk ? '材料不足' : '背包满'));
    const ready = freshIds.has(r.id);
    const rate = Math.max(5, Math.min(100, 30 + int * 0.7 - r.diff * 8));
    const rateTxt = int >= 100 ? '100%' : Math.round(rate) + '%';
    const mark = ready ? `<span class="cdot ${CRAFT_RED_CATS.includes(r.cat) ? 'red' : 'green'}"></span>` : '';
    return `<div class="recipe" data-tip="${r.out[0]}">
      ${pxItem(r.out[0], 24)}
      <div class="rname">${esc(outName)}${r.out[1] > 1 ? ' x' + r.out[1] : ''}${mark}</div>
      <div class="rmat">${mats}${intOk ? '' : ` <span class="miss">（智力需 ${r.reqInt}）</span>`}${lvOk ? '' : ` <span class="miss">（等级需 Lv.${r.reqLv}）</span>`}${(spaceOk || !matsOk || !intOk || !lvOk) ? '' : ' <span class="miss">（背包放不下）</span>'}</div>
      <div class="rrate">${rateTxt}</div>
      <button class="btn" data-craft="${r.id}" ${can ? '' : 'disabled'}>${can ? '合成' : why}</button>
    </div>`;
  }).join('');

  const madeBar = lastCraftTip ? `<div class="craft-tip made">
      <span class="ct-txt">${esc(lastCraftTip)}</span>
      <button class="btn" id="craftJumpBag">去背包看</button>
    </div>` : '';

  return `
    ${madeBar}
    ${tipBar}
    <div class="hint" style="margin-bottom:10px">智力 ${int} · 成功率 = 30 + 智力×0.7 − 难度×8，智力满 100 必定成功 · 材料显示为「拥有/需要」</div>
    <div class="cat-tabs">${tabs}</div>${list}`;
}

function bindCraft() {
  document.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => { craftCat = b.dataset.cat; openCraft(); };
  });
  document.querySelectorAll('[data-craft]').forEach(b => {
    b.onclick = async () => {
      const j = await doAct('craft', { recipeId: b.dataset.craft });
      if (S && S.scene === 'map') {
        // 合成成功：记住产物，下次打开背包自动切「全部」并高亮，别让人满世界找
        if (j && j.ok && /成功制作/.test(j.msg || '')) {
          const r = META.recipes.find(x => x.id === b.dataset.craft);
          if (r) {
            pendingHighlight = { id: r.out[0], plus: 0 };
            const nm = (META.items[r.out[0]] || {}).name || '';
            lastCraftTip = `${nm} ×${r.out[1]} 已放进背包（点「背包」就能看到）`;
            toast(lastCraftTip);
          }
        }
        openCraft();
      }
    };
  });
  const seenBtn = $('#btnCraftSeen');
  if (seenBtn) seenBtn.onclick = () => { markCraftSeen(); openCraft(); };
  // 点提示条直接跳背包
  const jump = $('#craftJumpBag');
  if (jump) jump.onclick = () => openBag();
}

// ================= 商店 =================
function openShop() {
  if (!S || !S.merchant) { toast('这里没有商人'); return; }
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }
  const m = S.merchant;
  const c = S.char;

  const goods = META.goods.map(([id, price]) => {
    const d = META.items[id];
    if (!d) return '';
    const real = Math.max(1, Math.round(price * m.markup * (m.shopMul || 1)));
    const afford = c.gold >= real;
    return `<div class="shop-item" data-tip="${id}">
      ${pxItem(id, 26)}
      <span class="si-name">${esc(d.name)}</span>
      <span class="si-price">¥${real}</span>
      <button class="btn" data-buy="${id}" ${afford ? '' : 'disabled'}>买</button>
    </div>`;
  }).join('');

  const sellables = c.bag.filter(it => META.goods.some(g => g[0] === it.id));
  const sellRows = sellables.map(it => {
    const d = META.items[it.id];
    const g = META.goods.find(x => x[0] === it.id);
    const price = Math.max(1, Math.round(g[1] * 0.4));
    return `<div class="shop-item" data-tip="${it.id}">
      <span class="si-name">${esc(d.name)} <span style="color:var(--dim)">x${it.n}</span></span>
      <span class="si-price">¥${price}</span>
      <button class="btn" data-sell="${it.id}">卖</button>
    </div>`;
  }).join('') || '<div class="hint">身上没有他要的东西。</div>';

  const body = `
    <div class="shop-bar">
      <span>${esc(m.name)}：<span style="color:var(--dim)">${esc(m.greet)}</span></span>
      <span>你有 <b>¥${c.gold}</b></span>
    </div>
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin-bottom:6px">出售</div>
    <div class="shop-grid">${goods}</div>
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin:12px 0 6px">收购（原价 40%）</div>
    <div class="shop-grid">${sellRows}</div>
    <div class="hint" style="margin-top:10px">商人只做基础物资。枪和甲，得去别人身上拿。</div>`;

  openModal('商店', body, [{ label: '离开', fn: closeModal }], false);
  document.querySelectorAll('[data-buy]').forEach(b => {
    b.onclick = async () => { await doAct('shop_buy', { itemId: b.dataset.buy, n: 1 }); openShop(); };
  });
  document.querySelectorAll('[data-sell]').forEach(b => {
    b.onclick = async () => { await doAct('shop_sell', { itemId: b.dataset.sell, n: 1 }); openShop(); };
  });
}

// ================= 交易 =================
let tradeSel = { to: null, giveItems: {}, wantItems: {}, giveGold: 0, wantGold: 0 };

// ---------- 佣兵头子 ----------
$('#btnMerc').onclick = () => {
  if (!S) return;
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }
  openMerc();
};

function openMerc() {
  const M = META.merc;
  if (!M) return;
  const gold = S.char.gold || 0;
  const rows = M.hire.map(h => {
    const can = gold >= h.price && !S.merc;
    return `<div class="mk-row">
      <span class="mk-name">${esc(h.name)}<i class="mk-sub">攻 ${h.atk} / 血 ${h.hp} · 只打一场</i></span>
      <span class="mk-price ${can ? '' : 'no'}">¥${h.price}</span>
      <button class="btn tiny" data-hire="${h.tier}" ${can ? '' : 'disabled'}>雇</button>
    </div>`;
  }).join('');

  const merc = S.merc
    ? `<div class="hint" style="color:var(--good);margin-top:8px">身边跟着：${esc(S.merc.name)}（${S.merc.hp}/${S.merc.maxHp}）</div>`
    : '<div class="hint" style="margin-top:8px">他打一场就走，别指望他一直跟着你。</div>';

  openModal(`${M.name} · ${M.title}`, `
    <div class="hint" style="margin-bottom:8px">${esc((M.greet || [])[0] || '')}</div>
    <div class="hint" style="color:var(--warn);margin-bottom:10px">你身上 ¥${gold}</div>
    ${rows}
    ${merc}
  `, [{ label: '离开', fn: closeModal }]);

  document.querySelectorAll('[data-hire]').forEach(b => {
    b.onclick = async () => {
      const r = await doAct('hire', { choice: 'hire', tier: +b.dataset.hire });
      if (r && r.msg) toast(r.msg);
      if (S && S.scene === 'map') openMerc();
    };
  });
}

// ---------- 悬浮提示 ----------
(function initHints() {
  const pop = document.createElement('div');
  pop.className = 'hint-pop';
  document.body.appendChild(pop);

  // 用事件委托而不是逐个 addEventListener：
  // 大厅的成就榜是每次刷新重建的，绑在元素上的监听会丢。
  let cur = null;
  function show(el) {
    cur = el;
    pop.textContent = el.dataset.hint || '';
    pop.classList.add('show');
    const r = el.getBoundingClientRect();
    const w = 250;
    // 水平：居中于目标，但不许超出视口
    pop.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))) + 'px';
    // 垂直：先放下方；下方放不下就翻到上方，都放不下就贴边
    pop.style.top = Math.round(r.bottom + 8) + 'px';
    const ph = pop.offsetHeight || 84;
    if (r.bottom + 8 + ph > window.innerHeight - 8) {
      const above = r.top - ph - 8;
      pop.style.top = Math.round(above >= 8 ? above : Math.max(8, window.innerHeight - ph - 8)) + 'px';
    }
  }
  function hide() { cur = null; pop.classList.remove('show'); }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[data-hint]');
    if (!el) return;
    if (el !== cur) show(el);
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest && e.target.closest('[data-hint]');
    if (el && el === cur && !el.contains(e.relatedTarget)) hide();
  });
  window.addEventListener('scroll', hide, true);
})();

// ---------- 黑市 ----------
$('#btnMarket').onclick = () => {
  if (!S) return;
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }
  openMarket();
};

function openMarket() {
  const mk = S && S.market;
  if (!mk) { toast('黑市已经收摊了。'); return; }
  const M = META.market;
  const zoneName = ((META.map.find(z => z.id === mk.zone)) || {}).name || mk.zone;
  const left = Math.max(0, mk.until - Date.now());
  const gold = S.char.gold || 0;

  const goods = M.goods.map(g => {
    const it = META.items[g.id] || {};
    const can = gold >= g.price;
    return `<div class="mk-row">
      <span class="mk-name">${esc(it.name || g.id)}</span>
      <span class="mk-price ${can ? '' : 'no'}">¥${g.price}</span>
      <button class="btn tiny" data-mkbuy="${g.id}" ${can ? '' : 'disabled'}>买</button>
    </div>`;
  }).join('');

  const merc = S.merc
    ? `<div class="hint" style="color:var(--good);margin-top:10px">身边跟着：${esc(S.merc.name)}（${S.merc.hp}/${S.merc.maxHp}）</div>`
    : '';

  openModal(`${M.name} · ${zoneName}`, `
    <div class="hint" style="margin-bottom:8px">${esc((M.greet || [])[0] || '')}</div>
    <div class="hint" style="color:var(--warn);margin-bottom:10px">还剩 ${fmtTime(left)} 收摊 · 全部三倍价 · 你身上 ¥${gold}</div>
    <div style="font-size:12px;color:var(--accent2);letter-spacing:2px;margin:6px 0">货</div>
    ${goods}
    ${merc}
  `, [{ label: '离开', fn: closeModal }]);

  document.querySelectorAll('[data-mkbuy]').forEach(b => {
    b.onclick = async () => {
      const r = await doAct('market', { choice: 'buy', itemId: b.dataset.mkbuy });
      if (r && r.msg) toast(r.msg);
      if (S && S.scene === 'map') openMarket();
    };
  });
}

$('#btnTrade').onclick = () => {
  if (!S) return;
  if (S.scene !== 'map') { toast('先处理眼前的事'); return; }
  openTrade();
};

async function openTrade() {
  const near = await api('/api/players/nearby');
  const list = await api('/api/trade/list');
  tradeSel = { to: null, giveItems: {}, wantItems: {}, giveGold: 0, wantGold: 0 };

  const nearbyRows = (near.players || []).map(p =>
    `<div data-pick="${esc(p.username)}">${esc(p.name)} <span style="color:var(--dim)">@${esc(p.username)}</span></div>`
  ).join('') || '<div class="hint" style="padding:4px">这个区块只有你一个人。</div>';

  const incoming = (list.incoming || []).map(t => {
    const give = t.giveItems.map(i => `${META.items[i.id].name}x${i.n}`).join('、') + (t.giveGold ? ` +¥${t.giveGold}` : '');
    const want = t.wantItems.map(i => `${META.items[i.id].name}x${i.n}`).join('、') + (t.wantGold ? ` +¥${t.wantGold}` : '');
    return `<div class="recipe">
      <div class="rname">${esc(t.from)}</div>
      <div class="rmat">给：${esc(give || '无')} → 要：${esc(want || '无')}</div>
      <button class="btn" data-acc="${t.id}">接受</button>
      <button class="btn danger" data-rej="${t.id}">拒绝</button>
    </div>`;
  }).join('') || '<div class="hint">没有待处理的报价。</div>';

  const body = `
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin-bottom:6px">这个区块的玩家</div>
    <div class="trade-pick" id="nearList">${nearbyRows}</div>
    <div id="tradeForm"></div>
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin:14px 0 6px">收到的报价</div>
    ${incoming}`;

  openModal('交易', body, [{ label: '关闭', fn: closeModal }]);
  document.querySelectorAll('[data-pick]').forEach(d => {
    d.onclick = () => {
      tradeSel.to = d.dataset.pick;
      document.querySelectorAll('#nearList div').forEach(x => x.classList.remove('on'));
      d.classList.add('on');
      renderTradeForm();
    };
  });
  document.querySelectorAll('[data-acc]').forEach(b => {
    b.onclick = async () => {
      const j = await api('/api/trade/accept', { id: b.dataset.acc });
      toast(j.ok ? '交易完成' : (j.msg || '失败'));
      if (j.ok) { await refreshState(); openTrade(); } else openTrade();
    };
  });
  document.querySelectorAll('[data-rej]').forEach(b => {
    b.onclick = async () => { await api('/api/trade/reject', { id: b.dataset.rej }); openTrade(); };
  });
}

async function renderTradeForm() {
  if (!tradeSel.to) return;
  const c = S.char;
  let other = { bag: [], gold: 0, name: '' };
  try {
    const r = await api('/api/players/bag?u=' + encodeURIComponent(tradeSel.to));
    if (r.ok) other = r;
  } catch (e) { /* ignore */ }

  const bagRows = c.bag.map(it => {
    const d = META.items[it.id];
    const on = tradeSel.giveItems[it.id] ? ' on' : '';
    return `<div class="${on}" data-give="${it.id}" data-tip="${it.id}">${esc(d.name)} <span style="color:var(--dim)">x${it.n}</span></div>`;
  }).join('');

  const wantRows = (other.bag || []).map(it => {
    const d = META.items[it.id];
    const on = tradeSel.wantItems[it.id] ? ' on' : '';
    return `<div class="${on}" data-want="${it.id}" data-tip="${it.id}">${esc(d.name)} <span style="color:var(--dim)">x${it.n}</span></div>`;
  }).join('') || '<div class="hint" style="padding:4px">对方背包是空的。</div>';

  $('#tradeForm').innerHTML = `
    <div class="trade-cols" style="margin-top:10px">
      <div class="trade-col">
        <h4>你给对方（你有 ¥${c.gold}）</h4>
        <div class="trade-pick">${bagRows}</div>
        <div class="field" style="margin-top:6px"><label>金币</label>
          <input type="number" id="giveGold" value="${tradeSel.giveGold}" min="0" max="${c.gold}">
        </div>
      </div>
      <div class="trade-col">
        <h4>你要 ${esc(other.name || '')} 给（他有 ¥${other.gold || 0}）</h4>
        <div class="trade-pick">${wantRows}</div>
        <div class="field" style="margin-top:6px"><label>金币</label>
          <input type="number" id="wantGold" value="${tradeSel.wantGold}" min="0">
        </div>
      </div>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="trade-sum" id="tradeSum"></span>
      <div class="sp"></div>
      <button class="btn primary" id="btnSendOffer">发送报价</button>
    </div>`;

  const upd = () => {
    tradeSel.giveGold = +$('#giveGold').value || 0;
    tradeSel.wantGold = +$('#wantGold').value || 0;
    const gi = Object.entries(tradeSel.giveItems).map(([k, v]) => (META.items[k] ? META.items[k].name : k) + 'x' + v).join('、');
    const wi = Object.entries(tradeSel.wantItems).map(([k, v]) => (META.items[k] ? META.items[k].name : k) + 'x' + v).join('、');
    $('#tradeSum').textContent = `给：${gi || '无'}${tradeSel.giveGold ? ' +¥' + tradeSel.giveGold : ''} → 要：${wi || '无'}${tradeSel.wantGold ? ' +¥' + tradeSel.wantGold : ''}`;
  };

  document.querySelectorAll('[data-give]').forEach(d => {
    d.onclick = () => {
      const id = d.dataset.give;
      if (tradeSel.giveItems[id]) delete tradeSel.giveItems[id]; else tradeSel.giveItems[id] = 1;
      renderTradeForm();
    };
  });
  document.querySelectorAll('[data-want]').forEach(d => {
    d.onclick = () => {
      const id = d.dataset.want;
      if (tradeSel.wantItems[id]) delete tradeSel.wantItems[id]; else tradeSel.wantItems[id] = 1;
      renderTradeForm();
    };
  });
  const gi = $('#giveGold'), wi = $('#wantGold');
  if (gi) gi.oninput = upd;
  if (wi) wi.oninput = upd;
  upd();

  const btn = $('#btnSendOffer');
  if (btn) btn.onclick = async () => {
    const payload = {
      to: tradeSel.to,
      giveGold: tradeSel.giveGold,
      wantGold: tradeSel.wantGold,
      giveItems: Object.entries(tradeSel.giveItems).map(([id, n]) => ({ id, n })),
      wantItems: Object.entries(tradeSel.wantItems).map(([id, n]) => ({ id, n })),
    };
    const j = await api('/api/trade/offer', payload);
    toast(j.ok ? '报价已发出' : (j.msg || '失败'));
    if (j.ok) openTrade();
  };
}

async function refreshState() {
  const st = await api('/api/state');
  if (st.state) { S = st.state; ROUND = st.round; render(); }
}

// ================= 随行（人质） =================
$('#hostLink').onclick = () => {
  if (!S) return;
  openHostages();
};

function openHostages() {
  const hs = (S.char.hostages || []);
  if (!hs.length) { toast('还没有人跟着你——遇到人质时选「问她愿不愿意」'); return; }
  const rows = hs.map((h, i) => {
    const m = moodOf(h.mood);
    const happy = h.mood === 'happy';
    const face = happy ? 'happy' : (h.mood === 'sad' ? 'sad' : 'normal');
    return `<div class="host-row">
      <div class="hr-art">${pxPerson({ female: true, cloth: '#5a5a6a', hair: '#2a2018', expression: face }, 52)}</div>
      <div class="hr-main">
        <div class="hr-name">${esc(h.name)}<span class="hr-mood" style="color:${m.color}">${m.name}</span></div>
        <div class="hr-sub">给你唱过 <b>${h.songs || 0}</b> 次 · 跟着你 ${fmtTime(Date.now() - (h.at || Date.now()))}</div>
      </div>
      ${happy
        ? `<button class="btn primary" data-imp="${i}">挑逗</button>`
        : `<button class="btn" disabled title="她心情不好，不想理你">心情不好</button>`}
    </div>`;
  }).join('');
  openModal('随行', `${rows}
    <div class="hint">心情会自己变。只有「开心」的时候才愿意理你，成功率 20%，成功会给你唱首歌或讲个故事。</div>`,
    [{ label: '关闭', fn: closeModal }]);
  document.querySelectorAll('[data-imp]').forEach(b => {
    b.onclick = async () => {
      await doAct('tease', { index: +b.dataset.imp });
      if (S && S.scene === 'map') openHostages();
    };
  });
}

// ================= 成就 =================
$('#btnAch').onclick = () => openAch();

function openAch() {
  const mine = S.char.achievements || {};
  const cats = (META.achCats && META.achCats.length) ? META.achCats : ['通用', '战斗', '生存', '剧情', '神秘', '特色'];
  const all = META.achievements.slice().sort((a, b) => {
    const ca = cats.indexOf(a.cat), cb = cats.indexOf(b.cat);
    if (ca !== cb) return ca - cb;
    return (a.tier || 0) - (b.tier || 0);
  });

  let html = '';
  for (const cat of cats) {
    const group = all.filter(a => (a.cat || '通用') === cat);
    if (!group.length) continue;
    const got = group.filter(a => mine[a.id]).length;
    const grid = group.map(a => {
      const on = !!mine[a.id];
      return `<div class="ach-item ${on ? 'on' : ''}">
        <div class="ach-icon">${a.icon}</div>
        <div>
          <div class="ach-name">${esc(a.title)}</div>
          <div class="ach-desc">${esc(a.desc)}</div>
          <div class="ach-hint">${on ? '已达成' : esc(a.hint)}</div>
        </div>
      </div>`;
    }).join('');
    html += `<div class="ach-cat"><span>${esc(cat)}</span><em>${got} / ${group.length}</em></div>
      <div class="ach-grid">${grid}</div>`;
  }

  const count = Object.keys(mine).length;
  openModal('称号', `
    <div class="hint" style="margin-bottom:10px">已解锁 ${count} / ${META.achievements.length}。称号会在排行榜和结算页展示。</div>
    ${html}
  `, [{ label: '关闭', fn: closeModal }]);
}

// ================= 排行榜 =================
async function loadRank() {
  try {
    const j = await api('/api/leaderboard');
    const rows = (j.board || []).map((p, i) => `
      <div class="rank-row ${p.username === USERNAME ? 'me' : ''} ${p.alive ? '' : 'out'}">
        <span class="no">${i + 1}</span>
        <span class="nm">${esc(p.name)}${p.boss ? ' <span style="color:var(--accent)">★</span>' : ''}</span>
        <span class="kd">${p.kills}杀 · ${p.titles}称号</span>
      </div>`).join('') || '<div class="hint">还没有人进场。</div>';
    $('#rankList').innerHTML = rows;
    const board = j.board || [];
    const alive = board.filter(p => p.alive).length;
    const sub = $('#rankSub');
    if (sub) sub.textContent = board.length ? `${alive} 人在场` : '无人';
    return j;
  } catch (e) { return null; }
}

async function openRankModal() {
  const j = await loadRank();
  if (!j) return;
  const achMap = Object.fromEntries(META.achievements.map(a => [a.id, a]));

  const rows = (j.board || []).map((p, i) => {
    const chips = (p.titleIds || []).slice(0, 3).map(id => {
      const a = achMap[id];
      return a ? `<span class="title-chip">${esc(a.title)}</span>` : '';
    }).join('');
    return `<div class="rank-row ${p.username === USERNAME ? 'me' : ''} ${p.alive ? '' : 'out'}" style="flex-wrap:wrap">
      <span class="no">${i + 1}</span>
      <span class="nm">${esc(p.name)} <span style="color:var(--dim);font-size:10px">${esc(p.zone)}</span></span>
      <span class="kd">${p.score != null ? `<b class="sc">${p.score} 分</b> · ` : ''}${p.kills}杀 · ${p.turn}回合 · ¥${p.gold}</span>
      ${chips ? `<div style="width:100%;display:flex;gap:4px;flex-wrap:wrap;padding-left:25px;margin-top:3px">${chips}${p.titles > 3 ? `<span class="title-chip">+${p.titles - 3}</span>` : ''}</div>` : ''}
    </div>`;
  }).join('') || '<div class="hint">还没有人进场。</div>';

  const REASON_CN = { boss: 'BOSS 被击杀', sevenwa: '带走七娃', wiped: '全员出局', timeout: '时间到', manual: '管理员结束' };
  const hist = (j.history || []).map(h => `
    <div class="rank-row"><span class="no hist">#${h.roundId}</span>
    <span class="nm">${esc(h.winner || '—')}</span>
    <span class="kd">${esc(REASON_CN[h.reason] || h.reason || '')}</span></div>`).join('');

  openModal('排行榜', `
    <div class="rank-rule">排名 = 存活分 + 等级×8 + 本轮称号×10 + 击杀×5 + 探索×0.4 + 合成×3 + 金币÷50 + 存活奖励 30
      <br>存活分 = 回合数 × 0.8（上限 50）· 称号只算本轮拿到的
      <br>额外：击杀 BOSS +150 · 本轮带七娃回家 +400 · 每首歌 +5 · 每个人质 +6</div>
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin:10px 0 6px">本轮</div>
    ${rows}
    <div style="font-size:11px;color:var(--accent2);letter-spacing:2px;margin:14px 0 6px">历史</div>
    ${hist || '<div class="hint">还没有结束过任何一轮。</div>'}
  `, [{ label: '关闭', fn: closeModal }]);
}

// ================= 聊天 =================
// 右栏改成三块常驻（排名/公屏/信息），不再有 tab 切换

// 频道 tab：类名是 .ctab（标题行里的三个按钮）
document.querySelectorAll('.ctab').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.ctab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    chatCh = b.dataset.ch;
    renderChat();
  };
});

// 排名 / 公屏：同一张卡里两个面板切换
document.querySelectorAll('.stab').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.stab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const k = b.dataset.stab;
    $('#paneRank').classList.toggle('hidden', k !== 'rank');
    $('#paneSys').classList.toggle('hidden', k !== 'sys');
    if (k === 'rank') loadRank();
  };
});

let pollTick = 0;
// 合并轮询：聊天每次都拉，状态每两次带一次（等价原来的 5 秒）
async function poll() {
  if (!TOKEN) return;
  pollTick++;
  const wantState = !!S && (pollTick % 2 === 1);
  try {
    const j = await api('/api/poll?since=' + chatSince + (wantState ? '&state=1' : ''));
    if (j.round) {
      ROUND = j.round;
      // 轮次结束：直接切结算画面（胜利画面除外，那个要留给玩家点「结算」）
      if (j.round.state === 'ended' && S && S.scene !== 'sevenwin') {
        roundOverTo({ round: j.round });
        return;
      }
    }
    if (j.msgs && j.msgs.length) {
      chatMsgs = chatMsgs.concat(j.msgs);
      if (chatMsgs.length > 200) chatMsgs = chatMsgs.slice(-200);
      chatSince = j.maxId;
      renderChat();
      renderSys();
    }
    if (wantState) {
      if (!j.hasSave) { roundOverTo(j); return; }
      // 不在主界面 / 有弹窗时不要覆盖当前画面
      if (S.scene !== 'map') return;
      if (!$('#modal').classList.contains('hidden')) return;
      if (j.state) { S = j.state; render(); }
    }
  } catch (e) { /* 忽略轮询错误 */ }
}

// 系统播报（空投/黑市/天气/轮次）单独进「公屏」，不再混在聊天里
function isSysMsg(m) {
  return !!m && (m.from === '系统' || m.kind === 'sys' || m.kind === 'win' || m.kind === 'warn');
}

function renderSys() {
  const box = $('#sysList');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const list = chatMsgs.filter(isSysMsg).slice(-60);
  box.innerHTML = list.map(m => `<div class="chat-line ${m.kind || 'sys'}">${esc(m.text)}</div>`).join('')
    || '<div class="hint">还没有系统播报。</div>';
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function renderChat() {
  const box = $('#chatList');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;

  let html = '';
  if (chatCh === 'info') {
    // 信息 = 你自己的行动记录 + 公共频道，按时间合成一条流
    const items = [];
    for (const l of (S && S.log) || []) items.push({ t: l.t || 0, kind: l.kind, text: l.text });
    for (const m of chatMsgs) {
      if (isSysMsg(m) || m.ch !== 'public') continue;
      items.push({ t: m.at || 0, kind: 'say', text: m.text, who: m.from });
    }
    items.sort((a, b) => a.t - b.t);
    html = items.slice(-140).map(it => {
      if (it.who) {
        const mine = it.who === USERNAME ? ' mine' : '';
        return `<div class="chat-line${mine}"><span class="who">${esc(it.who)}</span>：${esc(it.text)}</div>`;
      }
      const tg = LOG_TAG[it.kind];
      const tag = (tg && tg[0]) ? `<span class="ltag ${tg[1]}">${tg[0]}</span>` : '';
      return `<div class="log-item ${it.kind || 'info'}">${tag}${esc(it.text)}</div>`;
    }).join('');
  } else {
    const list = chatMsgs.filter(m => !isSysMsg(m) && m.ch === chatCh).slice(-80);
    html = list.map(m => {
      if (m.kind === 'sys' || m.kind === 'win' || m.kind === 'death' || m.kind === 'gm') {
        return `<div class="chat-line ${m.kind}">${esc(m.text)}</div>`;
      }
      const mine = m.from === USERNAME ? ' mine' : '';
      const pv = m.ch === 'private' ? `<span class="pv">${m.from === USERNAME ? '→ ' + esc(m.to) : '私聊'}</span> ` : '';
      return `<div class="chat-line${mine}">${pv}<span class="who">${esc(m.from)}</span>：${esc(m.text)}</div>`;
    }).join('');
  }

  box.innerHTML = html || '<div class="hint">这里还没有人说话。</div>';
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

$('#btnSend').onclick = sendChat;
$('#chatText').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  // 输入框空着按回车 = 把回车交回给游戏（探索），不然点过聊天框之后 Enter 就永远只发消息
  if (!e.target.value.trim()) { e.target.blur(); return; }
  sendChat();
});

async function sendChat() {
  const input = $('#chatText');
  let text = input.value.trim();
  if (!text) return;

  // @玩家ID 开头 → 私聊
  let ch = chatCh === 'private' ? 'private' : (chatCh === 'zone' ? 'zone' : 'public');
  let to = null;
  const m = text.match(/^@(\S+)\s+(.+)$/);
  if (m) { ch = 'private'; to = m[1]; text = m[2]; }

  if (ch === 'private' && !to) { toast('私聊格式：@玩家ID 内容'); return; }

  try {
    const j = await api('/api/chat/send', { ch, text, to });
    if (!j.ok) { toast(j.msg || '发送失败'); return; }
    input.value = '';
    if (j.gm) toast(j.msg);
    await poll();
  } catch (e) { toast(e.message); }
}

// ================= 启动 =================
(async function boot() {
  if (TOKEN) {
    try { await enterGame(); return; } catch (e) { /* 令牌失效 */ }
  }
  // 没登录（或令牌失效）→ 直接进大厅，登录框就在大厅底部
  await showLobby(null);
})();
