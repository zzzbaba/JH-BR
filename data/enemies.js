// 江汉BR —— 敌人数据
// tier 1-5，对应区块危险度
// kind: human 可交涉（放我一马）/ animal 不可交涉 / armed 持械

const ENEMIES = [
  { id: 'e01', name: '流浪汉', tier: 1, kind: 'human', hp: 28, atk: 6, def: 0, dodge: 5, flee: 80, desc: '裹着破棉被，眼神浑浊，手里攥着半块砖。', w: 1 },
  { id: 'e02', name: '拾荒者', tier: 1, kind: 'human', hp: 34, atk: 7, def: 1, dodge: 8, flee: 75, desc: '背着比自己还大的编织袋，见人就躲，被逼急了会咬人。', w: 1 },
  { id: 'e03', name: '醉汉', tier: 1, kind: 'human', hp: 26, atk: 9, def: 0, dodge: 3, flee: 70, desc: '一身酒气，走路打晃，但拳头没轻没重。', w: 1 },
  { id: 'e04', name: '野狗群', tier: 1, kind: 'animal', hp: 30, atk: 8, def: 0, dodge: 15, flee: 60, desc: '三条瘦得见骨的土狗，围着你打转，喉咙里滚着低吼。', w: 1 },

  { id: 'e05', name: '落单的学生', tier: 2, kind: 'human', hp: 42, atk: 9, def: 2, dodge: 12, flee: 70, desc: '校服上全是泥，握着一根拖把杆，手一直在抖。', w: 2 },
  { id: 'e06', name: '小混混', tier: 2, kind: 'human', hp: 48, atk: 11, def: 3, dodge: 10, flee: 55, desc: '脖子上挂着粗链子，手里是把弹簧刀，嘴上不干不净。', w: 2 },
  { id: 'e07', name: '持刀男', tier: 2, kind: 'human', hp: 52, atk: 13, def: 2, dodge: 8, flee: 45, desc: '一句话不说，刀尖一直对着你的方向。', w: 2 },
  { id: 'e08', name: '油田保安', tier: 2, kind: 'armed', hp: 58, atk: 12, def: 8, dodge: 6, flee: 40, desc: '还穿着制服，防暴头盔没摘，手里拎着橡胶棍。', w: 2 },
  { id: 'e09', name: '疯女人', tier: 2, kind: 'human', hp: 45, atk: 14, def: 1, dodge: 18, flee: 30, desc: '头发乱成一团，笑着朝你走过来，手里是半截玻璃瓶。', w: 2 },

  { id: 'e10', name: '退伍兵', tier: 3, kind: 'armed', hp: 68, atk: 16, def: 10, dodge: 10, flee: 35, desc: '站姿笔挺，动作干脆，一看就是练过的。', w: 3 },
  { id: 'e11', name: '猎户', tier: 3, kind: 'armed', hp: 62, atk: 15, def: 5, dodge: 14, flee: 45, desc: '背着弓，箭囊里还剩七八支，脚步轻得几乎没有声音。', w: 3 },
  { id: 'e12', name: '帮派打手', tier: 3, kind: 'human', hp: 72, atk: 17, def: 8, dodge: 8, flee: 30, desc: '穿着统一的黑色外套，手里是缠了胶布的钢管。', w: 3 },
  { id: 'e13', name: '女猎手', tier: 3, kind: 'armed', hp: 64, atk: 16, def: 6, dodge: 20, flee: 50, desc: '蹲在墙头，弩已经上弦，眼睛在暗处发亮。', w: 3 },

  { id: 'e14', name: '摩托党', tier: 4, kind: 'armed', hp: 82, atk: 19, def: 12, dodge: 12, flee: 25, desc: '皮衣上全是铆钉，头盔面罩后面看不清脸。', w: 4 },
  { id: 'e15', name: '女杀手', tier: 4, kind: 'human', hp: 76, atk: 21, def: 6, dodge: 22, flee: 20, desc: '指甲修得很整齐，笑的时候眼睛不笑。', w: 4 },
  { id: 'e16', name: '前特种兵', tier: 4, kind: 'armed', hp: 95, atk: 23, def: 14, dodge: 15, flee: 15, desc: '脸上涂着油彩，呼吸几乎听不见。你才是猎物。', w: 4 },
  { id: 'e17', name: '警察', tier: 4, kind: 'armed', hp: 78, atk: 20, def: 12, dodge: 10, flee: 30, desc: '警服破了，但枪还在，手很稳。', w: 4 },

  { id: 'e18', name: '帮派头目', tier: 5, kind: 'armed', hp: 115, atk: 25, def: 18, dodge: 12, flee: 10, desc: '身后跟着两个人，他自己站在中间，动都没动。', w: 5 },
  { id: 'e19', name: '疯子', tier: 5, kind: 'human', hp: 105, atk: 28, def: 8, dodge: 18, flee: 5, desc: '嘴里反复念着同一个名字，手里是一把消防斧。', w: 5 },
  { id: 'e20', name: '最后的幸存者', tier: 5, kind: 'armed', hp: 140, atk: 30, def: 20, dodge: 16, flee: 5, desc: '他身上挂着七八件装备，全是别人的。他一直在等你。', w: 5 },
];

// 掉落池：按 tier 分组，[itemId, 权重, min, max]
const LOOT_TABLE = {
  1: [
    ['m_cloth', 12, 1, 3], ['m_nail', 10, 1, 3], ['m_plank', 8, 1, 2], ['m_tape', 8, 1, 2],
    ['med01', 10, 1, 2], ['med04', 8, 1, 2], ['med08', 8, 1, 1], ['m_scrap', 10, 1, 2],
    ['w08', 6, 1, 1], ['w05', 4, 1, 1], ['m_bottle', 8, 1, 2], ['m_rope', 6, 1, 1],
    ['m_scrap', 8, 1, 2], ['ammo_pellet', 6, 5, 10], ['h03', 5, 1, 2],
  ],
  2: [
    ['m_gunpowder', 8, 1, 2], ['m_copper', 8, 1, 2], ['m_battery', 7, 1, 2],
    ['med01', 8, 1, 2], ['med02', 7, 1, 2], ['med05', 7, 1, 2], ['med03', 4, 1, 1],
    ['w05', 5, 1, 1], ['w06', 4, 1, 1], ['w08', 4, 1, 1], ['a01', 5, 1, 1], ['a06', 5, 1, 1],
    ['ammo_arrow', 6, 3, 8], ['m_leather', 6, 1, 2], ['m_pipe', 5, 1, 1], ['b01', 3, 1, 1],
    ['med16', 5, 1, 1], ['med17', 5, 1, 1], ['med21', 3, 1, 1], ['h02', 4, 1, 2], ['h03', 4, 1, 2],
  ],
  3: [
    ['m_gunpowder', 8, 1, 3], ['m_spring', 7, 1, 2], ['m_charcoal', 6, 1, 2], ['m_charcoal', 6, 1, 2],
    ['med03', 6, 1, 2], ['med05', 6, 1, 1], ['med09', 4, 1, 1], ['med11', 4, 1, 1],
    ['w05', 4, 1, 1], ['w07', 4, 1, 1], ['w11', 4, 1, 1], ['w12', 3, 1, 1],
    ['a03', 5, 1, 1], ['a08', 4, 1, 1], ['a13', 5, 1, 1], ['a17', 4, 1, 1],
    ['ammo_762p', 6, 6, 15], ['ammo_9mm', 6, 6, 15], ['ammo_762r', 5, 6, 12],
    ['b02', 3, 1, 1], ['buff_charm', 2, 1, 1], ['t01', 4, 2, 4], ['t04', 3, 1, 2],
    ['med18', 3, 1, 1], ['med19', 3, 1, 1], ['med20', 4, 1, 1], ['h01', 3, 1, 1], ['h05', 3, 1, 1],
  ],
  4: [
    ['m_gunpowder', 7, 2, 4], ['m_scrap', 7, 2, 4], ['med03', 7, 1, 2], ['med06', 5, 1, 1],
    ['med12', 4, 1, 1], ['vit_sta', 2, 1, 1], ['vit_str', 2, 1, 1],
    ['w14', 3, 1, 1], ['w21', 3, 1, 1], ['a05', 4, 1, 1], ['a09', 3, 1, 1], ['a14', 4, 1, 1], ['a18', 4, 1, 1], ['a24', 4, 1, 1],
    ['ammo_12ga', 5, 4, 10], ['ammo_762r', 5, 8, 20], ['ammo_58r', 4, 8, 20],
    ['b03', 3, 1, 1], ['buff_scope', 2, 1, 1], ['buff_plate', 2, 1, 1], ['t05', 3, 1, 2],
    ['t07', 2, 1, 2], ['sp_radio', 2, 1, 1], ['med22', 2, 1, 1], ['h04', 3, 1, 1], ['h05', 3, 1, 1],
  ],
  5: [
    ['m_gunpowder', 6, 3, 6], ['med03', 7, 2, 3], ['med06', 6, 1, 2], ['med15', 3, 1, 1],
    ['vit_sta', 3, 1, 1], ['vit_str', 3, 1, 1], ['vit_cha', 2, 1, 1], ['vit_int', 2, 1, 1], ['vit_luk', 2, 1, 1],
    ['w15', 3, 1, 1], ['w18', 3, 1, 1], ['w25', 3, 1, 1], ['w27', 3, 1, 1], ['w30', 2, 1, 1], ['w34', 2, 1, 1], ['w35', 1, 1, 1],
    ['a10', 3, 1, 1], ['a15', 3, 1, 1], ['a19', 3, 1, 1], ['a21', 3, 1, 1], ['a25', 3, 1, 1],
    ['ammo_762r', 5, 15, 40], ['ammo_58r', 4, 15, 40], ['ammo_rocket', 2, 1, 1],
    ['b04', 3, 1, 1], ['b05', 1, 1, 1], ['buff_silencer', 2, 1, 1], ['sp_policekey', 1, 1, 1],
    ['t09', 2, 1, 1], ['t05', 3, 1, 2],
  ],
};

module.exports = { ENEMIES, LOOT_TABLE };
