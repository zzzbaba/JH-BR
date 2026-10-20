// 江汉BR —— 人物状态
// 同时只保留一个状态，新状态覆盖旧状态。默认 normal。
// 时长 5 分钟（冷冻麻痹的 10 秒是"不能换图"的冷却，不是状态时长）

const STATUS_MS = 5 * 60 * 1000;

const STATUS = {
  normal: {
    id: 'normal',
    name: '正常',
    short: '正常',
    color: '#8a8a76',
    desc: '身体没什么特别的。',
    defMul: 1, atkMul: 1,
  },
  drunk: {
    id: 'drunk',
    name: '喝醉了',
    short: '醉',
    color: '#c07a3a',
    desc: '看东西有两个重影，但皮糙肉厚，打在身上不觉得疼。出手倒是没什么准头。',
    defMul: 1.5,      // 防御 +50%
    atkMul: 0.7,      // 攻击 -30%
    hitPenalty: 10,   // 命中 -10
  },
  clear: {
    id: 'clear',
    name: '非常清醒',
    short: '醒',
    color: '#5aa8d6',
    desc: '脑子里像开了灯。每一寸肌肉都听指挥。',
    defMul: 1.25,
    atkMul: 1.25,
    hitBonus: 8,
  },
  poisoned: {
    id: 'poisoned',
    name: '中毒了',
    short: '毒',
    color: '#7aa84f',
    desc: '胃里翻江倒海，每走一步都在往外淌。',
    defMul: 0.85,
    atkMul: 0.9,
    drainPct: 0.2,    // 每次移动/探索，当前血量和精力各掉 20%
  },
  frozen: {
    id: 'frozen',
    name: '冷冻麻痹',
    short: '冻',
    color: '#6fa8d6',
    desc: '手指不听使唤，关节像生了锈。得站一会儿才能动。',
    defMul: 0.9,
    atkMul: 0.8,
    freezeMs: 10000,  // 10 秒内不能换图
  },
};

// 道具 → 状态（自己吃出来的状态）
// 注意：液氮罐已经改成「对敌道具」（type: hostile），不再走这里
const STATUS_ITEMS = {
  med16: { status: 'drunk' },      // 二锅头
  med17: { status: 'clear' },      // 黑咖啡
  med18: { status: 'poisoned' },   // 毒蘑菇
};

// 解毒 / 解除类
const CURE_ITEMS = {
  med20: { cure: ['poisoned'] },        // 解毒剂
  med21: { cure: ['drunk'] },           // 醒酒汤
  med22: { cure: ['poisoned', 'drunk', 'frozen', 'clear'] }, // 万能解药
};

module.exports = { STATUS, STATUS_MS, STATUS_ITEMS, CURE_ITEMS };
