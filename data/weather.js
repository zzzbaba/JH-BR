// 江汉BR —— 天气系统
// 天气是全局的，影响所有玩家的战斗与移动。每 6-9 分钟切换一次。

const WEATHER = {
  clear: {
    id: 'clear', name: '晴', icon: '☀', color: '#c8a860',
    desc: '天是灰蓝色的，能见度不错。',
    atkMul: 1, accMod: 0, epMul: 1, encMul: 1, noiseMod: 0, weight: 3,
  },
  overcast: {
    id: 'overcast', name: '阴', icon: '☁', color: '#8a8a80',
    desc: '云压得很低，风里有股潮味。',
    atkMul: 1, accMod: 0, epMul: 1, encMul: 1, noiseMod: 0, weight: 2,
  },
  windy: {
    id: 'windy', name: '大风', icon: '≋', color: '#9aa8b0',
    desc: '风从井架之间穿过来，吹得人站不稳。',
    atkMul: 0.9, accMod: -8, epMul: 1, encMul: 1, noiseMod: 1, weight: 3,
    tip: '攻击 -10%，命中 -8，声音传得更远',
  },
  rain: {
    id: 'rain', name: '暴雨', icon: '☂', color: '#5a8ab0',
    desc: '雨大得像有人在天上倒水，什么都听不清。',
    atkMul: 1, accMod: -5, epMul: 1.4, encMul: 0.85, noiseMod: -3, weight: 2,
    tip: '移动更耗精力，但雨声会盖住枪声',
  },
  fog: {
    id: 'fog', name: '大雾', icon: '≋', color: '#7a8a8a',
    desc: '雾贴着地面，五十米外就只剩轮廓。',
    atkMul: 1, accMod: -15, epMul: 1, encMul: 0.7, noiseMod: 0, weight: 2,
    tip: '命中 -15，但也不容易被人撞见',
  },
  sand: {
    id: 'sand', name: '沙尘', icon: '⋯', color: '#b09060',
    desc: '风里全是沙，睁眼都费劲。',
    atkMul: 0.95, accMod: -10, epMul: 1.2, encMul: 0.9, noiseMod: 0, weight: 1,
    tip: '命中 -10，移动更耗精力',
  },
};

const WEATHER_LIST = Object.values(WEATHER);

// 按权重随机一个，尽量不和当前重复
function rollWeather(currentId) {
  const pool = WEATHER_LIST.filter(w => w.id !== currentId);
  const total = pool.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of pool) {
    r -= w.weight;
    if (r <= 0) return w;
  }
  return pool[0] || WEATHER.clear;
}

function get(id) { return WEATHER[id] || WEATHER.clear; }

module.exports = { WEATHER, WEATHER_LIST, rollWeather, get };
