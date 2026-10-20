// 江汉BR —— 像素美术库
// 物品图标（16×16 网格）与人物（24×32 网格）全部程序化绘制，不依赖图片资源。
(function (global) {
  'use strict';

  function items() { return (global.META && global.META.items) || {}; }

  function shade(hex, amt) {
    if (!hex || hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  const RARITY_COLOR = ['#5a5a56', '#8a8a80', '#5f8a4a', '#4a7a9c', '#8a5aa0'];

  // ================= 物品图标 =================
  // 24×24 网格，拟物像素风。不画稀有度边框（之前那两条横线是多余的）。

  function drawItem(ctx, id, x, y, size) {
    const d = items()[id];
    if (!d) return;
    const u = size / 24;
    const R = (gx, gy, gw, gh, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + gx * u), Math.round(y + gy * u), Math.ceil(gw * u), Math.ceil(gh * u));
    };

    switch (d.type) {
      case 'weapon': drawWeapon(R, d); break;
      case 'armor': drawArmor(R, d); break;
      case 'bag': drawBag(R, d); break;
      case 'med': drawMed(R, d); break;
      case 'material': drawMaterial(R, d); break;
      case 'ammo': drawAmmo(R, d); break;
      case 'throwable': drawThrow(R, d); break;
      case 'buff': drawBuff(R, d); break;
      default: drawSpecial(R, d);
    }
  }

  // ---- 武器 ----
  function weaponClass(d) {
    if (d.dmg >= 100) return 'launcher';
    if (d.noise <= 3) {
      if (d.dmg >= 20) return 'axe';
      if (d.dmg >= 14) return 'blade';
      if (d.dmg >= 12) return 'spear';
      return 'club';
    }
    if (d.mag >= 50) return 'mg';
    if (d.dmg >= 45) return 'sniper';
    if (d.mag <= 8 && d.dmg >= 35) return 'shotgun';
    if (d.mag <= 10) return 'pistol';
    if (d.dmg < 30) return 'smg';
    return 'rifle';
  }

  function drawWeapon(R, d) {
    const k = weaponClass(d);
    const M = '#8a9494', HI = '#c8d0d0', LO = '#4a5454', W = '#6a4a2a', WHI = '#8a6a42', WLO = '#4a3018';

    if (k === 'club') {
      R(10, 3, 4, 18, W); R(10, 3, 1, 18, WHI); R(13, 3, 1, 18, WLO);
      R(9, 3, 6, 2, '#7a5a32');
    } else if (k === 'spear') {
      R(11, 8, 3, 14, W); R(11, 8, 1, 14, WHI);
      R(10, 3, 5, 5, M); R(11, 2, 3, 2, HI); R(10, 3, 1, 5, LO);
      R(9, 7, 7, 1, '#8a6a3a');
    } else if (k === 'blade') {
      R(11, 2, 3, 14, M); R(11, 2, 1, 14, '#e8f0f0'); R(13, 3, 1, 12, LO);
      R(8, 16, 9, 2, '#8a6a3a');
      R(11, 18, 3, 4, W); R(11, 18, 1, 4, WHI);
    } else if (k === 'axe') {
      R(11, 4, 3, 17, W); R(11, 4, 1, 17, WHI);
      R(4, 4, 7, 7, M); R(14, 4, 7, 7, M);
      R(4, 4, 17, 2, HI); R(4, 9, 17, 2, LO);
    } else if (k === 'pistol') {
      R(6, 9, 12, 4, M); R(6, 9, 12, 1, HI); R(6, 12, 12, 1, LO);
      R(7, 13, 4, 7, '#3a3a30'); R(7, 13, 1, 7, '#5a5a4a');
      R(13, 13, 3, 4, '#4a4a40');
      R(17, 7, 1, 2, '#b8c0c0');
    } else if (k === 'smg') {
      R(3, 9, 16, 4, M); R(3, 9, 16, 1, HI); R(3, 12, 16, 1, LO);
      R(6, 13, 4, 5, '#3a3a30'); R(13, 13, 3, 6, '#4a4a40');
      R(18, 7, 1, 2, '#b8c0c0');
    } else if (k === 'rifle') {
      R(2, 9, 19, 4, M); R(2, 9, 19, 1, HI); R(2, 12, 19, 1, LO);
      R(3, 13, 4, 4, W); R(10, 13, 3, 6, '#3a3a30');
      R(16, 7, 1, 2, '#b8c0c0');
    } else if (k === 'shotgun') {
      R(3, 9, 17, 3, M); R(3, 12, 17, 2, '#6a7474');
      R(3, 9, 17, 1, HI);
      R(3, 14, 5, 3, W); R(3, 14, 5, 1, WHI);
    } else if (k === 'sniper') {
      R(2, 11, 20, 3, M); R(2, 11, 20, 1, HI);
      R(7, 6, 8, 3, '#3a3a30'); R(8, 5, 6, 1, '#7a9aaa');
      R(3, 14, 5, 4, W);
    } else if (k === 'mg') {
      R(2, 10, 20, 4, M); R(2, 10, 20, 1, HI);
      R(5, 14, 4, 3, '#b8a070');
      R(12, 14, 3, 5, '#3a3a30');
      R(18, 14, 2, 4, '#7a7a6a');
    } else {
      R(3, 7, 16, 8, '#5a6a5a'); R(3, 7, 16, 2, '#7a8a7a');
      R(18, 5, 3, 11, '#3a4a3a');
      R(5, 15, 4, 5, '#2a2a24');
      R(1, 10, 3, 3, '#8a6a3a');
    }
  }

  // ---- 防具 ----
  function drawArmor(R, d) {
    const heavy = (d.defense || 0) >= 14;
    const c = heavy ? '#4a5a6a' : '#5a6a4a';
    const hi = shade(c, 34), lo = shade(c, -34);

    switch (d.slot) {
      case 'head':
        R(6, 6, 12, 9, c); R(5, 12, 14, 3, lo);
        R(6, 6, 12, 2, hi);
        R(9, 15, 6, 4, '#1a1a16');
        if (heavy) { R(5, 8, 2, 6, hi); R(17, 8, 2, 6, lo); }
        break;
      case 'body':
        R(6, 5, 12, 15, c);
        R(4, 7, 2, 7, lo); R(18, 7, 2, 7, lo);
        R(9, 8, 6, 8, hi);
        R(6, 5, 12, 2, shade(c, 20));
        if (heavy) { R(8, 14, 8, 2, lo); R(8, 17, 8, 2, lo); }
        break;
      case 'hands':
        R(6, 9, 12, 8, c); R(6, 9, 4, 5, hi); R(14, 9, 4, 5, hi);
        R(7, 15, 10, 2, lo);
        if (heavy) R(6, 17, 12, 2, lo);
        break;
      case 'legs':
        R(6, 5, 12, 5, c); R(6, 10, 4, 10, c); R(14, 10, 4, 10, c);
        R(6, 5, 12, 2, hi); R(6, 10, 1, 10, lo); R(14, 10, 1, 10, lo);
        if (heavy) { R(6, 14, 4, 2, lo); R(14, 14, 4, 2, lo); }
        break;
      case 'face':
        R(6, 6, 12, 12, c); R(6, 6, 12, 2, hi);
        R(8, 9, 3, 3, '#1a1a16'); R(13, 9, 3, 3, '#1a1a16');
        R(8, 14, 8, 2, lo);
        if (heavy) { R(10, 12, 4, 1, lo); R(9, 16, 6, 2, '#1a1a16'); }
        break;
      case 'feet':
        R(6, 7, 5, 11, c); R(13, 7, 5, 11, c);
        R(5, 16, 6, 3, '#2a2a24'); R(13, 16, 6, 3, '#2a2a24');
        R(6, 7, 5, 2, hi); R(13, 7, 5, 2, hi);
        if (heavy) { R(5, 13, 6, 2, lo); R(13, 13, 6, 2, lo); }
        break;
      default:
        R(6, 5, 12, 14, c);
    }
  }

  function drawBag(R, d) {
    const big = (d.bagBonus || 0) >= 40;
    const c = big ? '#5a4a32' : '#6a5a3a';
    R(4, 7, 16, 12, c);
    R(4, 7, 16, 3, shade(c, 30));
    R(9, 4, 6, 3, shade(c, -25));
    R(10, 11, 4, 4, shade(c, -40));
    R(4, 17, 16, 2, shade(c, -20));
    if (big) { R(3, 9, 1, 8, '#8a7a52'); R(20, 9, 1, 8, '#8a7a52'); }
  }

  // ---- 药物 ----
  function drawMed(R, d) {
    let liquid = '#c8453a';
    if (d.perm) liquid = '#d4a340';
    else if (d.setStatus) liquid = '#7aa84f';
    else if (d.cureStatus) liquid = '#4a9ac0';
    else if (d.ep && !d.hp) liquid = '#4a7a9c';
    else if (d.buff && !d.hp && !d.ep) liquid = '#8a5aa0';

    if (d.perm) {
      // 细长药剂瓶
      R(9, 2, 6, 3, '#e8d090');
      R(9, 5, 6, 1, '#b89860');
      R(8, 6, 8, 15, '#3a3a36');
      R(9, 9, 6, 10, liquid);
      R(9, 9, 2, 10, shade(liquid, 45));
      R(8, 6, 8, 1, '#5a5a52');
    } else if (d.type === 'med' && !d.hp && !d.ep) {
      // 片剂泡罩
      R(5, 6, 14, 12, '#d8d8d0');
      R(5, 6, 14, 1, '#f4f4ec');
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        R(7 + i * 6, 8 + j * 5, 4, 3, '#f0f0e8');
        R(8 + i * 6, 9 + j * 5, 2, 1, liquid);
      }
    } else {
      R(9, 3, 6, 3, '#c8c8c0');
      R(9, 3, 6, 1, '#e8e8e0');
      R(10, 6, 4, 2, '#d8d8d0');
      R(7, 8, 10, 13, '#e8e8e0');
      R(7, 8, 10, 1, '#f8f8f0');
      R(7, 20, 10, 1, '#c0c0b8');
      R(8, 12, 8, 8, liquid);
      R(8, 12, 8, 1, shade(liquid, 50));
      R(8, 13, 1, 6, 'rgba(255,255,255,0.45)');
      R(10, 14, 4, 2, '#ffffff');
      R(11, 13, 2, 4, '#ffffff');
    }
  }

  // ---- 材料 ----
  const MAT_KIND = {
    cloth: 'fabric', gauze: 'fabric', leather: 'fabric',
    rope: 'rope', tape: 'roll', plastic: 'roll',
    nail: 'metal', wire: 'metal', screw: 'metal', scrap: 'metal', spring: 'metal', copper: 'metal', pipe: 'metal',
    plank: 'wood', charcoal: 'wood', sandpaper: 'wood',
    gunpowder: 'chem', sulfur: 'chem', saltpeter: 'chem', oil: 'chem', gasoline: 'chem', alcohol: 'chem', resin: 'chem',
    bottle: 'glass', glass: 'glass',
    battery: 'tech', lighter: 'tech',
    stone: 'stone', herb: 'herb', feather: 'feather',
  };

  function drawMaterial(R, d) {
    const key = String(d.id).replace(/^m_/, '');
    const kind = MAT_KIND[key] || 'metal';

    if (kind === 'fabric') {
      R(4, 6, 16, 12, '#8a7a5a'); R(4, 6, 16, 2, '#a89878');
      R(5, 10, 14, 1, '#6a5a3a'); R(5, 14, 14, 1, '#6a5a3a');
      R(4, 17, 16, 1, '#5a4a2a');
    } else if (kind === 'rope') {
      R(4, 7, 16, 3, '#8a7040'); R(5, 11, 14, 3, '#7a6038'); R(4, 15, 16, 3, '#8a7040');
      R(4, 7, 16, 1, '#a89060');
    } else if (kind === 'roll') {
      R(6, 6, 12, 12, '#7a7a70'); R(8, 8, 8, 8, '#3a3a34');
      R(6, 6, 12, 1, '#9a9a90'); R(7, 16, 10, 1, '#5a5a52');
    } else if (kind === 'metal') {
      R(4, 7, 16, 11, '#8a9090'); R(4, 7, 16, 3, '#b0b8b8');
      R(4, 16, 16, 2, '#5a6060');
      R(7, 12, 3, 3, '#6a7070'); R(13, 10, 3, 4, '#707878');
      R(5, 8, 6, 1, '#d0d8d8');
    } else if (kind === 'wood') {
      R(4, 7, 16, 11, '#7a5a32'); R(4, 7, 16, 2, '#9a7a4a');
      R(6, 11, 12, 1, '#5a3a1a'); R(6, 14, 12, 1, '#5a3a1a');
      R(4, 16, 16, 2, '#4a2a10');
    } else if (kind === 'chem') {
      R(8, 3, 8, 3, '#8a8a80');
      R(7, 6, 10, 15, '#c8c8b8');
      R(8, 10, 8, 10, '#a8b060');
      R(8, 10, 2, 10, '#c8d080');
      R(7, 6, 10, 1, '#e0e0d0');
      R(9, 14, 6, 2, '#8a9050');
    } else if (kind === 'glass') {
      R(8, 4, 8, 16, 'rgba(150,195,215,0.78)');
      R(9, 5, 3, 14, 'rgba(225,245,255,0.7)');
      R(8, 4, 8, 1, '#8ac0d8');
      R(8, 19, 8, 1, '#6aa0b8');
    } else if (kind === 'tech') {
      R(5, 7, 14, 11, '#3a3a36'); R(6, 8, 12, 9, '#5a5a4a');
      R(7, 10, 10, 2, '#d4a340'); R(7, 13, 10, 2, '#c8453a');
      R(17, 7, 2, 3, '#9a9a90');
      R(5, 17, 14, 1, '#2a2a26');
    } else if (kind === 'stone') {
      R(6, 8, 12, 10, '#8a8a82'); R(6, 8, 12, 2, '#a8a8a0');
      R(8, 12, 5, 3, '#6a6a62'); R(6, 16, 12, 2, '#6a6a62');
    } else if (kind === 'herb') {
      R(11, 4, 2, 16, '#5a7a3a');
      R(6, 7, 5, 5, '#6a9a4a'); R(13, 8, 5, 5, '#6a9a4a');
      R(7, 14, 5, 5, '#5a8a3a');
      R(7, 8, 2, 2, '#8aba5a'); R(14, 9, 2, 2, '#8aba5a');
    } else {
      R(11, 3, 2, 18, '#a8a898');
      R(9, 5, 2, 12, '#c8c8b8'); R(13, 7, 2, 10, '#c8c8b8');
      R(11, 3, 1, 18, '#d8d8c8');
    }
  }

  // ---- 弹药 ----
  const AMMO_KIND = {
    ammo_arrow: 'arrow', ammo_bolt: 'bolt', ammo_pellet: 'ball',
    ammo_flare: 'flare', ammo_762p: 'pistol', ammo_9mm: 'pistol', ammo_38: 'pistol',
    ammo_12ga: 'shell', ammo_762r: 'rifle', ammo_58r: 'rifle', ammo_556: 'rifle',
    ammo_rocket: 'rocket', battery_cell: 'battery',
  };

  function drawAmmo(R, d) {
    const k = AMMO_KIND[d.id] || 'rifle';
    if (k === 'arrow') {
      R(11, 4, 2, 12, '#c8a860'); R(11, 4, 1, 12, '#e0c880');
      R(8, 4, 8, 3, '#9aa4a4'); R(9, 3, 6, 1, '#c8d0d0');
      R(9, 16, 6, 2, '#d8d8d0'); R(10, 18, 4, 2, '#a8a898');
    } else if (k === 'bolt') {
      R(11, 5, 2, 9, '#8a8a80'); R(8, 4, 8, 3, '#b0b8b8');
      R(9, 14, 6, 3, '#6a5a3a');
    } else if (k === 'ball') {
      R(6, 8, 4, 4, '#a8a8a0'); R(12, 11, 4, 4, '#9a9a92'); R(8, 14, 4, 4, '#b0b0a8');
      R(7, 9, 1, 1, '#d0d0c8');
    } else if (k === 'flare') {
      R(9, 5, 6, 14, '#c8453a'); R(9, 5, 6, 2, '#e87060');
      R(9, 17, 6, 2, '#8a2a20');
      R(10, 8, 2, 8, '#e8a090');
    } else if (k === 'pistol') {
      R(9, 8, 6, 10, '#c8a860'); R(9, 6, 6, 2, '#e0c880');
      R(9, 17, 6, 2, '#8a7040');
      R(10, 9, 2, 7, '#e0c880');
    } else if (k === 'shell') {
      R(8, 6, 8, 12, '#b83a2a'); R(8, 6, 8, 2, '#d85a48');
      R(8, 15, 8, 3, '#d8b060');
      R(9, 8, 2, 7, '#d87a6a');
    } else if (k === 'rifle') {
      R(9, 5, 6, 13, '#c8a860'); R(9, 3, 6, 2, '#e0c880');
      R(9, 17, 6, 2, '#8a7040');
      R(10, 6, 2, 10, '#e0c880');
    } else if (k === 'rocket') {
      R(8, 3, 8, 6, '#c8453a'); R(9, 2, 6, 1, '#e87060');
      R(8, 9, 8, 11, '#7a8484'); R(8, 9, 8, 1, '#a0a8a8');
      R(9, 12, 6, 2, '#5a6464');
    } else {
      R(7, 7, 10, 11, '#3a3a36'); R(7, 7, 10, 2, '#d4a340');
      R(9, 11, 6, 5, '#c8453a'); R(18, 9, 1, 4, '#9a9a90');
    }
  }

  // ---- 暗器 ----
  function drawThrow(R, d) {
    const id = d.id;
    if (id === 't01') {
      R(11, 3, 2, 8, '#c8d0d0'); R(10, 5, 4, 5, '#a8b0b0');
      R(11, 11, 2, 7, '#6a5a3a');
    } else if (id === 't02') {
      R(11, 3, 2, 6, '#b8c0c0'); R(8, 7, 8, 3, '#b8c0c0');
      R(11, 10, 2, 7, '#8a9292');
      R(9, 6, 2, 2, '#8a9292'); R(13, 6, 2, 2, '#8a9292');
    } else if (id === 't03') {
      R(11, 4, 2, 12, '#8a9a8a'); R(9, 3, 6, 3, '#7aa84f');
      R(10, 16, 4, 2, '#5a6a5a');
    } else if (id === 't04') {
      R(9, 3, 6, 3, '#8a8a80');
      R(8, 6, 8, 14, 'rgba(180,90,40,0.9)');
      R(9, 8, 6, 9, '#e06020');
      R(9, 8, 2, 9, '#f08040');
      R(10, 4, 4, 4, '#d8b060');
    } else if (id === 't05') {
      R(5, 9, 14, 10, '#3a3a30'); R(5, 9, 14, 3, '#5a5a4a');
      R(10, 5, 4, 4, '#6a5a3a'); R(12, 3, 3, 3, '#e07030');
      R(7, 13, 2, 2, '#2a2a24');
    } else if (id === 't06') {
      R(7, 8, 10, 12, '#5a6a5a'); R(7, 8, 10, 3, '#7a8a7a');
      R(10, 4, 4, 4, '#8a9a8a'); R(8, 14, 8, 2, '#3a4a3a');
    } else if (id === 't07') {
      R(7, 8, 10, 12, '#c8c8b8'); R(7, 8, 10, 3, '#e8e8d8');
      R(10, 4, 4, 4, '#d4a340');
      R(8, 13, 2, 4, '#fff8d0'); R(14, 13, 2, 4, '#fff8d0');
    } else if (id === 't08') {
      R(4, 11, 16, 3, '#8a9090'); R(4, 8, 3, 3, '#b0b8b8'); R(17, 8, 3, 3, '#b0b8b8');
      R(9, 14, 6, 3, '#5a6060'); R(11, 17, 2, 3, '#6a5a3a');
    } else {
      R(4, 9, 16, 9, '#3a4a3a'); R(4, 9, 16, 3, '#5a6a5a');
      R(11, 6, 2, 3, '#c8453a'); R(7, 13, 2, 2, '#c8453a'); R(15, 13, 2, 2, '#c8453a');
    }
  }

  // ---- 配件 ----
  function drawBuff(R, d) {
    if (d.modSlot === 'sight') {
      R(6, 9, 12, 6, '#3a3a30');
      R(4, 10, 3, 4, '#8ac8e0'); R(17, 10, 3, 4, '#8ac8e0');
      R(11, 7, 2, 10, '#5a5a4a');
      R(5, 11, 1, 1, '#d8f0ff');
    } else if (d.modSlot === 'muzzle') {
      R(4, 9, 16, 6, '#4a4a40'); R(6, 10, 12, 4, '#2a2a24');
      R(2, 8, 3, 8, '#6a6a5a'); R(19, 8, 3, 8, '#6a6a5a');
    } else if (d.modSlot === 'grip') {
      R(9, 5, 6, 14, '#3a3a30');
      R(7, 11, 10, 3, '#5a5a4a');
      R(10, 6, 2, 12, '#6a5a3a');
    } else if (d.id === 'buff_plate') {
      R(5, 4, 14, 16, '#4a5a6a'); R(7, 6, 10, 12, '#6a7a8a');
      R(7, 9, 10, 2, '#8a9aaa'); R(7, 13, 10, 2, '#8a9aaa');
    } else if (d.id === 'buff_charm') {
      R(11, 3, 2, 4, '#c8453a'); R(8, 7, 8, 3, '#c8453a');
      R(9, 10, 6, 4, '#8a2a20'); R(11, 14, 2, 5, '#8a2a20');
      R(10, 8, 1, 1, '#ff8a7a');
    } else {
      R(4, 9, 16, 5, '#6a5a3a'); R(6, 9, 3, 5, '#c8a860');
      R(11, 9, 3, 5, '#c8a860'); R(16, 9, 3, 5, '#c8a860');
    }
  }

  // ---- 特殊 ----
  function drawSpecial(R, d) {
    if (d.id === 'sp_map') {
      R(4, 6, 16, 12, '#d8d0b0'); R(4, 6, 16, 2, '#f0e8c8');
      R(7, 10, 3, 2, '#c8453a'); R(13, 12, 3, 2, '#c8453a');
      R(8, 15, 6, 1, '#8a7a5a'); R(6, 8, 1, 8, '#b8b090');
    } else if (d.id === 'sp_radio') {
      R(5, 6, 12, 14, '#3a3a36'); R(6, 8, 10, 5, '#5a6a5a');
      R(7, 9, 6, 2, '#9ac89a');
      R(6, 15, 3, 4, '#5a5a4a'); R(16, 4, 2, 8, '#8a8a80');
    } else if (d.id === 'sp_policekey') {
      R(5, 5, 7, 7, '#d4a340'); R(7, 7, 3, 3, '#0a0808');
      R(10, 11, 2, 9, '#d4a340'); R(12, 14, 3, 2, '#d4a340'); R(12, 17, 3, 2, '#d4a340');
      R(6, 6, 2, 1, '#f0d080');
    } else if (d.repair) {
      R(4, 8, 16, 10, '#6a5a3a'); R(4, 8, 16, 2, '#8a7a52');
      R(6, 10, 4, 3, '#c8c8b8'); R(13, 10, 4, 3, '#8a9090');
      R(9, 14, 6, 2, '#4a3a2a');
      R(11, 4, 2, 4, '#8a7a52');
    } else {
      R(11, 3, 2, 6, '#c8453a'); R(8, 8, 8, 3, '#c8453a');
      R(9, 11, 6, 3, '#a03028'); R(11, 14, 2, 6, '#a03028');
    }
  }


  // ================= 人物 =================
  // 24×32 网格，w 为绘制宽度
  function drawPerson(ctx, x, y, w, opts) {
    const o = Object.assign({
      skin: '#c9a26b',
      hair: '#2b2b22',
      cloth: '#4a5240',
      pants: '#33332b',
      hat: null,
      armor: null,
      weapon: null,
      female: false,
      child: false,
      expression: 'normal',
      tint: null,
      dark: false,
    }, opts || {});

    const s = w / 24;
    const R = (gx, gy, gw, gh, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + gx * s), Math.round(y + gy * s), Math.ceil(gw * s), Math.ceil(gh * s));
    };

    // 动物（野狗群这类）：四足侧身，别画成人
    // enemyLook 早就返回了 { animal: true }，但这里一直没分支，所以狗一直画成人
    if (o.animal) {
      const fur = o.cloth || '#6a5a3a';
      const fur2 = o.hair || '#4a3a2a';
      const eye = '#140f0a';
      const mouth = '#7a1a12';
      const tooth = '#e8e4dc';

      // 尾巴（翘起来）
      R(20, 10, 2, 1, fur2);
      R(22, 7, 1, 3, fur2);
      // 身体
      R(6, 13, 15, 8, fur);
      R(6, 13, 15, 1, fur2);   // 背线
      R(6, 20, 15, 1, fur2);   // 腹线
      // 四条腿（前后各两条，中间两条压深做层次）
      R(7, 21, 2, 7, fur);  R(7, 27, 2, 1, fur2);
      R(11, 21, 2, 6, fur2);
      R(15, 21, 2, 6, fur2);
      R(18, 21, 2, 7, fur); R(18, 27, 2, 1, fur2);
      // 脖子 + 头
      R(4, 11, 4, 7, fur);
      R(2, 9, 6, 6, fur);
      // 尖耳朵
      R(2, 6, 1, 3, fur2);
      R(4, 5, 1, 4, fur2);
      // 吻部 + 鼻子
      R(0, 12, 2, 3, fur);
      R(0, 14, 1, 1, eye);
      // 眼睛
      R(3, 11, 1, 1, eye);
      // 咧嘴（低吼）
      R(1, 15, 3, 1, mouth);
      R(1, 16, 1, 1, tooth);
      R(3, 16, 1, 1, tooth);
      return;
    }

    // 小孩整体缩短
    const legTop = o.child ? 25 : 24;
    const bodyTop = o.child ? 14 : 12;

    // 腿
    R(8, legTop, 3, 32 - legTop - 2, o.pants);
    R(13, legTop, 3, 32 - legTop - 2, o.pants);
    // 鞋
    R(7, 30, 4, 2, '#242420');
    R(13, 30, 4, 2, '#242420');

    // 身体
    R(7, bodyTop, 10, legTop - bodyTop, o.cloth);
    R(7, legTop - 2, 10, 2, '#242420');

    // 手臂
    R(5, bodyTop + 1, 2, 9, o.cloth);
    R(17, bodyTop + 1, 2, 9, o.cloth);
    R(5, bodyTop + 10, 2, 2, o.skin);
    R(17, bodyTop + 10, 2, 2, o.skin);

    // 脖子
    R(11, bodyTop - 2, 2, 2, o.skin);

    // 头
    const headTop = (o.child ? 4 : 2) + (o.headDown ? 2 : 0);
    R(8, headTop, 8, 9, o.skin);

    // 头发
    if (o.female) {
      R(7, headTop, 10, 4, o.hair);
      R(7, headTop + 4, 1, 7, o.hair);
      R(16, headTop + 4, 1, 7, o.hair);
    } else {
      R(8, headTop - 1, 8, 3, o.hair);
    }

    // 帽子
    if (o.hat) {
      R(7, headTop - 2, 10, 3, o.hat);
      R(6, headTop, 12, 1, o.hat);
      R(7, headTop - 2, 10, 1, shade(o.hat, 30));
    }

    // 护甲
    if (o.armor) {
      R(7, bodyTop + 1, 10, 7, o.armor);
      R(9, bodyTop + 2, 6, 2, shade(o.armor, -25));
      R(7, bodyTop + 1, 10, 1, shade(o.armor, 30));
    }

    // 表情
    drawFace(R, o, headTop);

    // 武器
    if (o.weapon === 'gun') {
      R(19, bodyTop + 3, 5, 2, '#9aa0a0');
      R(18, bodyTop + 4, 2, 3, '#3a3a30');
    } else if (o.weapon === 'blade') {
      R(19, bodyTop - 2, 1, 8, '#c0c8c8');
      R(18, bodyTop + 5, 3, 1, '#6a5a3a');
    } else if (o.weapon === 'club') {
      R(19, bodyTop - 1, 2, 8, '#8a7a5a');
    }

    // 状态染色（半透明覆盖）
    if (o.tint) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = o.tint;
      ctx.fillRect(x, y, w, w * 32 / 24);
      ctx.restore();
    }
  }

  function drawFace(R, o, headTop) {
    const ey = headTop + 4;
    const ex = o.expression;
    const dark = '#1a1a16';

    if (ex === 'drunk') {
      R(9, ey, 2, 1, dark);
      R(13, ey, 2, 1, dark);
      R(9, ey + 3, 6, 1, '#8a3a2a');
      R(8, ey + 1, 1, 2, 'rgba(200,70,58,0.5)');
      R(15, ey + 1, 1, 2, 'rgba(200,70,58,0.5)');
    } else if (ex === 'clear') {
      R(9, ey - 1, 2, 3, '#f0f0e8');
      R(13, ey - 1, 2, 3, '#f0f0e8');
      R(9, ey, 1, 2, dark);
      R(14, ey, 1, 2, dark);
      R(10, ey + 3, 4, 1, dark);
    } else if (ex === 'poisoned') {
      R(9, ey, 1, 1, dark);
      R(10, ey + 1, 1, 1, dark);
      R(13, ey, 1, 1, dark);
      R(14, ey + 1, 1, 1, dark);
      R(10, ey + 3, 4, 1, '#5a7a3a');
    } else if (ex === 'frozen') {
      R(9, ey, 2, 1, '#9ac8e0');
      R(13, ey, 2, 1, '#9ac8e0');
      R(10, ey + 3, 4, 1, '#7aa8c0');
    } else if (ex === 'angry') {
      R(9, ey - 1, 2, 1, dark);
      R(13, ey - 1, 2, 1, dark);
      R(9, ey, 2, 1, dark);
      R(13, ey, 2, 1, dark);
      R(10, ey + 3, 4, 1, dark);
    } else if (ex === 'pitiful') {
      // 可怜巴巴：八字眉 + 湿润大眼 + 嘴角下撇
      R(8, ey - 2, 2, 1, dark);
      R(9, ey - 1, 1, 1, dark);
      R(14, ey - 2, 2, 1, dark);
      R(14, ey - 1, 1, 1, dark);
      R(9, ey, 2, 2, '#2a2020');
      R(13, ey, 2, 2, '#2a2020');
      R(9, ey, 1, 1, '#f4f2ea');
      R(13, ey, 1, 1, '#f4f2ea');
      R(10, ey + 4, 4, 1, '#8a5a4a');
      R(9, ey + 3, 1, 1, '#8a5a4a');
      R(14, ey + 3, 1, 1, '#8a5a4a');
    } else if (ex === 'refuse') {
      // 低头不要：闭眼 + 紧抿的嘴
      R(9, ey + 1, 2, 1, dark);
      R(13, ey + 1, 2, 1, dark);
      R(10, ey + 4, 4, 1, '#6a3a2a');
    } else if (ex === 'sparkle') {
      // 亮晶晶：睁大的眼睛 + 高光 + 笑
      R(9, ey - 1, 2, 3, '#2a2020');
      R(13, ey - 1, 2, 3, '#2a2020');
      R(9, ey - 1, 1, 1, '#ffffff');
      R(14, ey - 1, 1, 1, '#ffffff');
      R(10, ey + 1, 1, 1, '#a8d0e8');
      R(13, ey + 1, 1, 1, '#a8d0e8');
      R(10, ey + 4, 4, 1, '#9a4a3a');
      R(9, ey + 3, 1, 1, '#9a4a3a');
      R(14, ey + 3, 1, 1, '#9a4a3a');
    } else if (ex === 'happy') {
      // 弯眼 + 笑
      R(9, ey + 1, 2, 1, dark); R(10, ey, 1, 1, dark);
      R(13, ey + 1, 2, 1, dark); R(13, ey, 1, 1, dark);
      R(10, ey + 3, 4, 1, '#9a4a3a');
      R(9, ey + 2, 1, 1, '#9a4a3a'); R(14, ey + 2, 1, 1, '#9a4a3a');
    } else if (ex === 'worried') {
      // 八字眉 + 平嘴
      R(8, ey - 2, 3, 1, dark); R(13, ey - 2, 3, 1, dark);
      R(9, ey, 1, 2, dark); R(14, ey, 1, 2, dark);
      R(11, ey + 3, 2, 1, '#8a6a5a');
    } else if (ex === 'sad') {
      // 垂眉 + 眼睛半闭 + 嘴角下撇
      R(8, ey - 1, 3, 1, dark); R(13, ey - 1, 3, 1, dark);
      R(9, ey + 1, 2, 1, dark); R(13, ey + 1, 2, 1, dark);
      R(10, ey + 4, 4, 1, '#7a4a3a');
      R(9, ey + 3, 1, 1, '#7a4a3a'); R(14, ey + 3, 1, 1, '#7a4a3a');
    } else {
      R(9, ey, 1, 2, dark);
      R(14, ey, 1, 2, dark);
      R(11, ey + 3, 2, 1, '#8a6a5a');
    }
  }

  // ================= 角色外观映射 =================
  // 敌人：按 kind / tier 给不同装束
  function enemyLook(e) {
    const t = e.tier || 1;
    const kind = e.kind || 'human';
    if (kind === 'animal') {
      return { animal: true, cloth: '#6a5a3a', hair: '#4a3a2a', expression: 'angry' };
    }
    const base = {
      1: { cloth: '#4a4a3a', pants: '#3a3a30', hat: null, armor: null },
      2: { cloth: '#4a3a3a', pants: '#33332b', hat: null, armor: null },
      3: { cloth: '#3a4a3a', pants: '#2a2a24', hat: '#2a3a2a', armor: '#3a4a3a' },
      4: { cloth: '#2a2f28', pants: '#242420', hat: '#1f2420', armor: '#2a3028' },
      5: { cloth: '#2a1a1a', pants: '#1a1a16', hat: '#1a1212', armor: '#3a2020' },
      6: { cloth: '#e8e4dc', pants: '#2a2a24', hat: null, armor: null },
    }[Math.min(6, t)] || {};
    return Object.assign({
      skin: t >= 5 ? '#a8845a' : '#c9a26b',
      hair: t >= 4 ? '#1a1a16' : '#2b2b22',
      expression: t >= 4 ? 'angry' : 'normal',
      weapon: kind === 'armed' ? (t >= 3 ? 'gun' : 'blade') : (t >= 3 ? 'blade' : 'club'),
    }, base);
  }

  // 剧情遭遇 NPC：立绘必须跟文字对上，不能拿随机敌人的模板糊弄
  const NPC_EVENT_LOOK = {
    npc_girl:   { female: true, cloth: '#5a6a52', pants: '#3a3a30', hair: '#2a2018', expression: 'pitiful' },
    npc_vet:    { cloth: '#4a4038', pants: '#33332b', hat: '#2a2a24', hair: '#3a3a30', expression: 'normal' },
    npc_trader: { cloth: '#5a4a3a', pants: '#3a3a30', hat: '#3a3020', hair: '#1a1a16', expression: 'normal' },
    npc_monk:   { cloth: '#8a6a3a', pants: '#6a5230', hair: '#c9a26b', expression: 'normal' },
    npc_kid:    { child: true, cloth: '#4a5a7a', pants: '#33332b', hair: '#1a1a16', expression: 'happy' },
    npc_nurse:  { female: true, cloth: '#c8ccc8', pants: '#c8ccc8', hair: '#2a2018', expression: 'worried' },
    npc_gambler:{ cloth: '#3a3a4a', pants: '#2a2a30', hat: '#2a2a24', hair: '#1a1a16', expression: 'happy' },
    npc_twin:   { cloth: '#2a2a2a', pants: '#22222a', hair: '#1a1a16', expression: 'angry', weapon: 'blade' },
  };

  // 常驻 NPC：按 id 给外观
  const NPC_LOOK = {
    npc_han: { cloth: '#4a4038', hat: '#2a2a24', armor: '#5a4a3a', expression: 'normal', weapon: null },
    npc_teacher: { cloth: '#3a4a5a', female: true, hair: '#2a2018', expression: 'normal' },
    npc_worker: { cloth: '#3a4a5a', female: true, hair: '#1a1a16', hat: '#c8a03a', expression: 'normal' },
    npc_doctor: { cloth: '#8a8a80', hair: '#b0b0a8', expression: 'normal' },
    npc_oiler: { cloth: '#c87a2a', hat: '#c8a03a', expression: 'normal' },
    npc_chem: { cloth: '#5a7a4a', hair: '#3a3a2a', expression: 'angry' },
    npc_boatman: { cloth: '#4a5a5a', hat: '#6a5a3a', hair: '#8a8a80', expression: 'normal' },
    npc_guard: { cloth: '#2a3040', hat: '#1f2430', armor: '#3a4050', expression: 'angry', weapon: 'gun' },
  };

  // 主角外观：按装备与状态
  function heroLook(char) {
    const eq = char.equip || {};
    const it = k => (eq[k] && items()[eq[k].id]) || null;
    const armor = it('body');
    const hat = it('head');
    const weapon = it('weapon');
    const st = (char.status && char.status.id) || 'normal';

    const look = {
      skin: '#c9a26b',
      hair: '#2b2b22',
      cloth: '#4a5240',
      pants: '#33332b',
      hat: hat ? '#3a4a3a' : null,
      armor: armor ? '#3a4a3a' : null,
      weapon: weapon ? (weapon.noise >= 8 ? 'gun' : (weapon.dmg >= 14 ? 'blade' : 'club')) : null,
      expression: 'normal',
    };

    if (st === 'drunk') look.expression = 'drunk';
    else if (st === 'clear') look.expression = 'clear';
    else if (st === 'poisoned') { look.expression = 'poisoned'; look.tint = '#5a8a3a'; look.mood = 'bad'; }
    else if (st === 'frozen') { look.expression = 'frozen'; look.tint = '#4a8ac0'; look.mood = 'bad'; }
    else {
      // 没有异常状态时，按血量/精力表现情绪
      const hpPct = char.hpMax ? char.hp / char.hpMax : 1;
      const epPct = char.epMax ? char.ep / char.epMax : 1;
      const worst = Math.min(hpPct, epPct);
      look.expression = worst > 0.6 ? 'happy' : (worst > 0.3 ? 'worried' : 'sad');
      look.mood = worst > 0.6 ? 'good' : (worst > 0.3 ? 'mid' : 'bad');
      look.critical = worst < 0.15;   // 濒危：舞台要闪红
      look.worst = worst;
    }
    if (!look.mood) look.mood = 'good';
    return look;
  }

  // 生成一个离屏 canvas
  function personCanvas(opts, w, h) {
    const c = document.createElement('canvas');
    const dpr = 2;
    c.width = (w || 96) * dpr;
    c.height = (h || 128) * dpr;
    c.style.width = (w || 96) + 'px';
    c.style.height = (h || 128) + 'px';
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr, dpr);
    drawPerson(ctx, 0, 0, w || 96, opts);
    return c;
  }

  function itemCanvas(id, size) {
    const c = document.createElement('canvas');
    const dpr = 2;
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr, dpr);
    drawItem(ctx, id, 0, 0, size);
    return c;
  }

  // ================= 特殊角色：高精度绘制 =================
  // 这两个角色不用 24×32 的通用网格，改用 48×64 + 多层光影，
  // 目标是跟普通角色明显拉开质感差距。

  function mkR(ctx, x, y, s) {
    return (gx, gy, gw, gh, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + gx * s), Math.round(y + gy * s), Math.ceil(gw * s), Math.ceil(gh * s));
    };
  }

  // ---- 七娃：8 岁男孩，暖光，大脑袋小身体 ----
  function drawSevenWa(ctx, x, y, w) {
    const s = w / 48;
    const H = 64 * s;
    const R = mkR(ctx, x, y, s);

    // 背后的暖光（希望感）
    const glow = ctx.createRadialGradient(x + w / 2, y + H * 0.52, 0, x + w / 2, y + H * 0.52, w * 0.9);
    glow.addColorStop(0, 'rgba(240,200,130,0.30)');
    glow.addColorStop(0.5, 'rgba(240,200,130,0.12)');
    glow.addColorStop(1, 'rgba(240,200,130,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - w * 0.35, y, w * 1.7, H);

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + H * 0.965, w * 0.28, w * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // 腿
    R(17, 48, 6, 13, '#3a4a68');
    R(26, 48, 6, 13, '#2a3448');
    // 鞋
    R(15, 59, 9, 4, '#2a2a26');
    R(25, 59, 9, 4, '#1e1e1a');
    R(15, 59, 9, 1, '#4a4a42');

    // 校服：肩宽下摆窄
    R(14, 26, 21, 4, '#5a7aa8');
    R(15, 30, 19, 18, '#4a6a9a');
    R(15, 30, 3, 18, '#3a5478');
    R(31, 30, 3, 18, '#5a7aa8');
    R(15, 46, 19, 3, '#3a5478');

    // 白领 + 红领巾
    R(19, 26, 11, 4, '#ecece4');
    R(23, 30, 3, 4, '#c8453a');

    // 书包带
    R(18, 26, 3, 22, '#c87a3a');
    R(28, 26, 3, 22, '#a05a24');

    // 手臂
    R(10, 28, 5, 16, '#4a6a9a');
    R(34, 28, 5, 16, '#3a5478');
    R(10, 42, 5, 6, '#e8c8a0');
    R(34, 42, 5, 6, '#c8a880');

    // 头（儿童比例，偏大）
    R(14, 4, 20, 20, '#e8c8a0');
    R(14, 4, 20, 3, '#f8dcb8');
    R(14, 21, 20, 3, '#c8a880');
    R(14, 4, 3, 20, '#d0b088');
    R(31, 4, 3, 20, '#f4d8b4');

    // 头发
    R(13, 1, 22, 9, '#242424');
    R(13, 9, 3, 10, '#1a1a1a');
    R(32, 9, 3, 10, '#2e2e2e');
    R(16, 2, 8, 2, '#4a4a4a');
    R(14, 3, 2, 5, '#141414');

    // 眼睛（眼白 + 瞳孔 + 高光）
    R(18, 12, 5, 6, '#f8f4ec');
    R(27, 12, 5, 6, '#f8f4ec');
    R(19, 13, 3, 4, '#2a2a28');
    R(28, 13, 3, 4, '#2a2a28');
    R(19, 13, 1, 1, '#ffffff');
    R(28, 13, 1, 1, '#ffffff');

    // 眉毛
    R(18, 10, 5, 1, '#3a3a34');
    R(27, 10, 5, 1, '#3a3a34');

    // 嘴
    R(22, 19, 4, 1, '#c08a6a');
    R(22, 20, 4, 1, '#a87050');

    // 手里的半块饼干
    R(35, 39, 6, 6, '#d8b878');
    R(35, 39, 6, 1, '#f0d8a8');
    R(37, 41, 2, 2, '#a88850');
  }

  // ---- 刘颖：一半天使一半恶魔，双手张开托着两颗药丸 ----
  function drawLiuYing(ctx, x, y, w) {
    const s = w / 48;
    const H = 64 * s;
    const R = mkR(ctx, x, y, s);

    // 左侧圣光
    const gl = ctx.createRadialGradient(x + w * 0.24, y + H * 0.30, 0, x + w * 0.24, y + H * 0.30, w * 0.78);
    gl.addColorStop(0, 'rgba(250,246,236,0.38)');
    gl.addColorStop(0.5, 'rgba(250,246,236,0.12)');
    gl.addColorStop(1, 'rgba(250,246,236,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, w, H);

    // 右侧暗影
    const gr = ctx.createRadialGradient(x + w * 0.78, y + H * 0.36, 0, x + w * 0.78, y + H * 0.36, w * 0.72);
    gr.addColorStop(0, 'rgba(200,36,46,0.40)');
    gr.addColorStop(0.5, 'rgba(140,20,30,0.16)');
    gr.addColorStop(1, 'rgba(140,20,30,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, y, w, H);

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + H * 0.965, w * 0.30, w * 0.042, 0, 0, Math.PI * 2);
    ctx.fill();

    // 裙摆（展开的梯形）
    R(12, 50, 24, 3, '#e0d8c8');
    R(24, 50, 12, 3, '#33161c');
    R(9, 53, 30, 9, '#e0d8c8');
    R(24, 53, 15, 9, '#33161c');
    R(16, 53, 1, 9, '#c8c0b0');
    R(30, 53, 1, 9, '#241016');

    // 身体：肩宽 → 收腰
    R(13, 28, 22, 4, '#f0e8d8');
    R(24, 28, 11, 4, '#3a1a20');
    // 上身
    R(15, 32, 18, 8, '#e8e0d0');
    R(24, 32, 9, 8, '#33161c');
    // 腰（收窄）
    R(17, 40, 14, 10, '#e8e0d0');
    R(24, 40, 7, 10, '#33161c');
    // 明暗
    R(15, 32, 3, 8, '#d0c8b8');
    R(17, 40, 2, 10, '#d0c8b8');
    R(31, 32, 2, 8, '#f4ecdc');
    R(29, 40, 2, 10, '#f4ecdc');
    R(33, 32, 1, 18, '#241016');
    // 衣服褶皱
    R(21, 33, 1, 16, '#d8d0c0');
    R(28, 33, 1, 16, '#2a1018');

    // 手臂平伸，掌心向上托着
    R(6, 32, 8, 4, '#e8e0d0');
    R(3, 31, 4, 6, '#f0d8b8');
    R(3, 31, 1, 2, '#fce8cc');
    R(34, 32, 8, 4, '#33161c');
    R(41, 31, 4, 6, '#a88070');
    R(43, 31, 2, 2, '#c09880');

    // 两颗药丸（悬在掌心上方）
    R(3, 28, 3, 3, '#e03a3a');
    R(3, 28, 1, 1, '#ffb0b0');
    R(42, 28, 3, 3, '#3a6ae0');
    R(42, 28, 1, 1, '#a8c8ff');

    // 头
    R(16, 5, 16, 18, '#f0d8b8');
    R(24, 5, 8, 18, '#b08870');
    R(16, 5, 16, 3, '#fce8cc');
    R(24, 5, 8, 3, '#c09880');
    R(16, 20, 16, 3, '#d0b090');
    R(24, 20, 8, 3, '#8a6a58');

    // 头发：左黑右暗红
    R(15, 1, 10, 8, '#1a1a1a');
    R(24, 1, 10, 8, '#4a1418');
    R(15, 8, 3, 15, '#1a1a1a');
    R(31, 8, 3, 15, '#5a1a20');
    R(17, 2, 5, 2, '#3a3a3a');
    R(27, 2, 4, 1, '#7a2a30');

    // 眼睛：左正常，右发红光
    R(18, 12, 4, 4, '#f8f4ec');
    R(27, 12, 4, 4, '#2a0a0a');
    R(19, 13, 2, 3, '#2a2a28');
    R(28, 13, 2, 3, '#ff3a3a');
    R(19, 13, 1, 1, '#ffffff');
    R(28, 13, 1, 1, '#ffd0d0');

    // 嘴：一半上扬一半平
    R(21, 18, 3, 1, '#a06a5a');
    R(24, 18, 3, 1, '#5a2020');

    // 中线（强化"两半"）
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 23.5 * s, y + 4 * s, 1 * s, 58 * s);
  }

  function specialCanvas(who, w, hRatio) {
    const c = document.createElement('canvas');
    const dpr = 2;
    const h = hRatio ? w * hRatio : w * 64 / 48;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr, dpr);
    if (who === 'sevenwa') drawSevenWa(ctx, 0, 0, w);
    else if (who === 'liuying') drawLiuYing(ctx, 0, 0, w);
    return c;
  }

  // ================= 宝箱图标 =================
  // kind: 0 军绿铁箱 / 1 木箱 / 2 行李箱 / 3 储物柜 / 4 塑料收纳箱
  const BOX_PAL = [
    { body: '#4a5240', body2: '#37402f', lid: '#5c6650', band: '#262c22', lock: '#c8a03a', glow: 'rgba(200,160,58,0.16)' },
    { body: '#6a5236', body2: '#4e3c26', lid: '#7d6343', band: '#33251a', lock: '#9a9a90', glow: 'rgba(200,160,90,0.14)' },
    { body: '#4a3f52', body2: '#372e3d', lid: '#5c4e66', band: '#241d2b', lock: '#b0a070', glow: 'rgba(160,120,200,0.14)' },
    { body: '#3f4a52', body2: '#303a41', lid: '#4e5b64', band: '#1f262b', lock: '#8a9aa0', glow: 'rgba(120,170,200,0.14)' },
    { body: '#5a6a5a', body2: '#45544a', lid: '#6d7f6d', band: '#2f3a2e', lock: '#c0c8b0', glow: 'rgba(150,200,150,0.14)' },
  ];

  function drawBox(ctx, x, y, size, kind) {
    const u = size / 24;
    const p = BOX_PAL[kind] || BOX_PAL[0];
    const R = (gx, gy, gw, gh, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + gx * u), Math.round(y + gy * u), Math.ceil(gw * u), Math.ceil(gh * u));
    };
    // 背光
    const g = ctx.createRadialGradient(x + size / 2, y + size * 0.6, 0, x + size / 2, y + size * 0.6, size * 0.7);
    g.addColorStop(0, p.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    // 地面投影
    R(4, 20.5, 16, 2, 'rgba(0,0,0,0.45)');
    // 箱体
    R(4, 10, 16, 11, p.body);
    R(4, 18, 16, 3, p.body2);          // 底部暗部
    R(4, 10, 16, 1, shade(p.body, 18)); // 顶部高光
    // 盖子
    R(3, 6.5, 18, 4, p.lid);
    R(3, 6.5, 18, 1, shade(p.lid, 22));
    R(3, 9.5, 18, 1, p.band);
    // 竖带
    R(8, 6.5, 2, 14.5, p.band);
    R(14, 6.5, 2, 14.5, p.band);
    R(8, 6.5, 0.6, 14.5, shade(p.band, 30));
    R(14, 6.5, 0.6, 14.5, shade(p.band, 30));
    // 锁扣
    R(10.5, 8.5, 3, 3.5, p.lock);
    R(11.3, 9.6, 1.4, 1.4, '#1a1a16');
    R(10.5, 8.5, 3, 0.6, shade(p.lock, 25));
    // 边缘
    R(4, 10, 0.6, 11, shade(p.body, 26));
    R(19.4, 10, 0.6, 11, shade(p.body, -20));
  }

  function boxCanvas(kind, size) {
    const c = document.createElement('canvas');
    const dpr = 2;
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(dpr, dpr);
    drawBox(ctx, 0, 0, size, kind || 0);
    return c;
  }

  global.PX = {
    drawItem, drawPerson, personCanvas, itemCanvas,
    drawSevenWa, drawLiuYing, specialCanvas,
    drawBox, boxCanvas,
    enemyLook, heroLook, NPC_LOOK, NPC_EVENT_LOOK, shade,
  };
})(window);
