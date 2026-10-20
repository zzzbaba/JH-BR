// 江汉BR —— 合成配方
// 成功率 = 30 + 智力*0.7 + 装备加成 - 难度*8（智力 100 必成）
// reqInt: 智力门槛；reqLv: 等级门槛（可选）；diff: 难度（每点 -8% 成功率）
//
// 设计原则：
// 1. 只用 18 种核心材料，不引入零碎杂物
// 2. 医疗/精力走「小药 → 大药」的升级链，玩家一眼看懂
// 3. 弹药全部可用材料搓，越高级的子弹要越多火药和铜线
// 4. 武器从冷兵器一路搓到火器，越高级要的智力/等级越高
// 5. 防具分 5 档：初级 / 中级 / 高级 / 传说 / 史诗

const RECIPES = [
  // ================= 医疗：小药 → 大药 =================
  { id: 'r01', out: ['med01', 1], inp: [['m_cloth', 2], ['m_alcohol', 1]], reqInt: 1, diff: 0, cat: '医疗', name: '绷带' },
  { id: 'r02', out: ['med02', 1], inp: [['med01', 2], ['m_cloth', 1], ['m_tape', 1]], reqInt: 9, diff: 1, cat: '医疗', name: '止血带（绷带×2）' },
  { id: 'r03', out: ['med03', 1], inp: [['med02', 2], ['m_herb', 1], ['m_tape', 1]], reqInt: 25, diff: 3, cat: '医疗', name: '急救包（止血带×2）' },
  { id: 'r04', out: ['med08', 1], inp: [['m_bottle', 1], ['m_charcoal', 1]], reqInt: 4, diff: 0, cat: '医疗', name: '速溶咖啡' },
  { id: 'r05', out: ['med07', 1], inp: [['med08', 2], ['m_herb', 1], ['m_bottle', 1]], reqInt: 18, diff: 2, cat: '医疗', name: '能量饮料（咖啡×2）' },
  { id: 'r06', out: ['med20', 1], inp: [['m_herb', 2], ['m_alcohol', 1]], reqInt: 14, diff: 1, cat: '医疗', name: '解毒剂' },
  { id: 'r07', out: ['med21', 1], inp: [['m_bottle', 1], ['m_herb', 1], ['m_charcoal', 1]], reqInt: 11, diff: 1, cat: '医疗', name: '醒酒汤' },

  // ================= 弹药：全部用现有材料 =================
  { id: 'r10', out: ['ammo_pellet', 10], inp: [['m_scrap', 1]], reqInt: 1, diff: 0, cat: '弹药', name: '钢珠 x10' },
  { id: 'r11', out: ['ammo_arrow', 5], inp: [['m_plank', 1], ['m_nail', 2], ['m_cloth', 1]], reqInt: 6, diff: 0, cat: '弹药', name: '箭矢 x5' },
  { id: 'r12', out: ['ammo_bolt', 3], inp: [['m_plank', 1], ['m_scrap', 1]], reqInt: 9, diff: 0, cat: '弹药', name: '弩矢 x3' },
  { id: 'r13', out: ['ammo_762p', 10], inp: [['m_gunpowder', 1], ['m_scrap', 1], ['m_spring', 1]], reqInt: 11, diff: 0, cat: '弹药', name: '7.62mm 手枪弹 x10' },
  { id: 'r14', out: ['ammo_38', 8], inp: [['m_gunpowder', 1], ['m_scrap', 2], ['m_spring', 1]], reqInt: 13, diff: 0, cat: '弹药', name: '.38 弹 x8' },
  { id: 'r15', out: ['ammo_9mm', 10], inp: [['m_gunpowder', 1], ['m_scrap', 1], ['m_copper', 1]], reqInt: 14, diff: 0, cat: '弹药', name: '9mm 手枪弹 x10' },
  { id: 'r16', out: ['ammo_12ga', 6], inp: [['m_gunpowder', 2], ['m_scrap', 2], ['m_cloth', 1]], reqInt: 16, diff: 1, cat: '弹药', name: '12 号霰弹 x6' },
  { id: 'r17', out: ['ammo_762r', 10], inp: [['m_gunpowder', 2], ['m_scrap', 1], ['m_copper', 1]], reqInt: 18, diff: 1, cat: '弹药', name: '7.62mm 步枪弹 x10' },
  { id: 'r18', out: ['ammo_58r', 10], inp: [['m_gunpowder', 2], ['m_scrap', 1], ['m_screw', 2]], reqInt: 22, diff: 1, cat: '弹药', name: '5.8mm 步枪弹 x10' },
  { id: 'r20', out: ['ammo_flare', 2], inp: [['m_gunpowder', 1], ['m_copper', 1], ['m_cloth', 1]], reqInt: 14, diff: 0, cat: '弹药', name: '信号弹 x2' },
  { id: 'r21', out: ['battery_cell', 1], inp: [['m_battery', 2], ['m_copper', 1], ['m_tape', 1]], reqInt: 18, diff: 0, cat: '弹药', name: '电池组' },
  { id: 'r22', out: ['ammo_rocket', 1], inp: [['m_gunpowder', 3], ['m_pipe', 1], ['m_spring', 2], ['m_copper', 1]], reqInt: 40, diff: 3, cat: '弹药', name: '火箭弹' },

  // ================= 武器：冷兵器 =================
  { id: 'r30', out: ['w05', 1], inp: [['m_scrap', 2], ['m_tape', 1]], reqInt: 7, diff: 1, cat: '武器', name: '匕首' },
  { id: 'r31', out: ['w08', 1], inp: [['m_plank', 1], ['m_scrap', 1], ['m_tape', 1]], reqInt: 7, diff: 0, cat: '武器', name: '棒球棍' },
  { id: 'r32', out: ['w09', 1], inp: [['m_plank', 1], ['m_scrap', 2], ['m_tape', 1]], reqInt: 11, diff: 1, cat: '武器', name: '铁锤' },
  { id: 'r33', out: ['w06', 1], inp: [['m_scrap', 3], ['m_plank', 1], ['m_tape', 1]], reqInt: 14, diff: 2, cat: '武器', name: '砍刀' },
  { id: 'r34', out: ['w10', 1], inp: [['m_pipe', 1], ['w06', 1], ['m_tape', 1]], reqInt: 14, diff: 1, cat: '武器', name: '长矛（砍刀 + 钢管）' },
  { id: 'r35', out: ['w07', 1], inp: [['m_scrap', 3], ['m_plank', 1], ['m_spring', 1]], reqInt: 18, diff: 2, cat: '武器', name: '消防斧' },
  { id: 'r36', out: ['w14', 1], inp: [['m_pipe', 1], ['m_scrap', 2], ['m_rope', 1]], reqInt: 13, diff: 1, cat: '武器', name: '鱼叉' },
  { id: 'r37', out: ['w11', 1], inp: [['m_rope', 1], ['m_plank', 1], ['m_spring', 1]], reqInt: 14, diff: 2, cat: '武器', name: '弓' },
  { id: 'r38', out: ['w12', 1], inp: [['m_plank', 2], ['m_spring', 2], ['m_rope', 1], ['m_screw', 2]], reqInt: 22, diff: 3, cat: '武器', name: '弩' },
  { id: 'r39', out: ['w15', 1], inp: [['m_pipe', 1], ['m_battery', 2], ['m_copper', 2]], reqInt: 25, diff: 3, cat: '武器', name: '电击棍' },

  // ================= 武器：火器 =================
  { id: 'r40', out: ['w16', 1], inp: [['m_pipe', 1], ['m_spring', 1], ['m_copper', 1], ['m_tape', 1]], reqInt: 14, diff: 1, cat: '武器', name: '信号枪' },
  { id: 'r42', out: ['w18', 1], inp: [['m_pipe', 1], ['m_spring', 2], ['m_scrap', 2], ['m_screw', 3]], reqInt: 20, diff: 2, cat: '武器', name: '54式手枪' },
  { id: 'r43', out: ['w19', 1], inp: [['m_pipe', 1], ['m_spring', 2], ['m_scrap', 2], ['m_screw', 2]], reqInt: 22, diff: 2, cat: '武器', name: '92式手枪' },
  { id: 'r44', out: ['w20', 1], inp: [['m_pipe', 1], ['m_spring', 3], ['m_scrap', 2]], reqInt: 22, diff: 2, cat: '武器', name: '左轮手枪' },
  { id: 'r45', out: ['w21', 1], inp: [['m_pipe', 2], ['m_spring', 2], ['m_plank', 1], ['m_tape', 1]], reqInt: 25, diff: 3, cat: '武器', name: '双管猎枪' },
  { id: 'r49', out: ['w25', 1], inp: [['m_pipe', 2], ['m_spring', 3], ['m_scrap', 4], ['m_screw', 3]], reqInt: 35, diff: 4, cat: '武器', name: '79式冲锋枪' },
  { id: 'r50', out: ['w30', 1], inp: [['m_pipe', 2], ['m_spring', 3], ['m_scrap', 4], ['m_plank', 2]], reqInt: 36, diff: 4, cat: '武器', name: '56式半自动步枪' },
  { id: 'r53', out: ['w27', 1], inp: [['m_pipe', 3], ['m_spring', 4], ['m_scrap', 5], ['m_screw', 6]], reqInt: 42, diff: 5, reqLv: 8, cat: '武器', name: '95式自动步枪' },
  { id: 'r56', out: ['w32', 1], inp: [['m_pipe', 3], ['m_spring', 3], ['m_scrap', 4], ['m_glass', 2], ['m_screw', 2]], reqInt: 47, diff: 5, reqLv: 12, cat: '武器', name: '88式狙击步枪' },
  { id: 'r58', out: ['w34', 1], inp: [['m_pipe', 4], ['m_spring', 5], ['m_scrap', 6], ['m_screw', 6]], reqInt: 50, diff: 6, reqLv: 15, cat: '武器', name: '95式班用机枪' },
  { id: 'r59', out: ['w35', 1], inp: [['m_pipe', 4], ['m_gunpowder', 3], ['m_scrap', 4], ['m_spring', 2]], reqInt: 54, diff: 6, reqLv: 18, cat: '武器', name: '40 火箭筒' },

  // ================= 防具：1 初级 / 2 中级 / 3 高级 / 4 传说 / 5 史诗 =================
  // 初级
  { id: 'r60', out: ['a11', 1], inp: [['m_cloth', 2]], reqInt: 4, diff: 0, cat: '防具', name: '劳保手套' },
  { id: 'r61', out: ['a01', 1], inp: [['m_plank', 1], ['m_cloth', 1]], reqInt: 4, diff: 0, cat: '防具', name: '安全帽' },
  { id: 'r62', out: ['a19', 1], inp: [['m_cloth', 2]], reqInt: 4, diff: 0, cat: '防具', name: '口罩' },
  { id: 'r63', out: ['a23', 1], inp: [['m_cloth', 2], ['m_rope', 1]], reqInt: 6, diff: 0, cat: '防具', name: '布鞋' },
  { id: 'r64', out: ['a06', 1], inp: [['m_cloth', 4], ['m_rope', 1]], reqInt: 7, diff: 1, cat: '防具', name: '棉袄' },
  { id: 'r65', out: ['a15', 1], inp: [['m_cloth', 3], ['m_nail', 1]], reqInt: 7, diff: 1, cat: '防具', name: '牛仔裤' },
  // 中级
  { id: 'r66', out: ['a12', 1], inp: [['m_leather', 2]], reqInt: 11, diff: 1, cat: '防具', name: '皮手套' },
  { id: 'r67', out: ['a02', 1], inp: [['m_scrap', 1], ['m_leather', 1]], reqInt: 12, diff: 1, cat: '防具', name: '自行车头盔' },
  { id: 'r68', out: ['a07', 1], inp: [['m_leather', 3], ['m_rope', 1]], reqInt: 13, diff: 1, cat: '防具', name: '皮夹克' },
  { id: 'r69', out: ['a24', 1], inp: [['m_leather', 1], ['m_cloth', 2]], reqInt: 13, diff: 1, cat: '防具', name: '运动鞋' },
  { id: 'r70', out: ['a16', 1], inp: [['m_leather', 2], ['m_cloth', 2]], reqInt: 14, diff: 2, cat: '防具', name: '工装裤' },
  // 高级
  { id: 'r71', out: ['a13', 1], inp: [['m_leather', 1], ['m_cloth', 2], ['m_scrap', 1]], reqInt: 22, diff: 2, cat: '防具', name: '防割手套' },
  { id: 'r72', out: ['a03', 1], inp: [['m_scrap', 2], ['m_leather', 1], ['m_glass', 1]], reqInt: 23, diff: 2, cat: '防具', name: '摩托车头盔' },
  { id: 'r73', out: ['a08', 1], inp: [['m_scrap', 3], ['m_leather', 2], ['m_rope', 1]], reqInt: 25, diff: 3, cat: '防具', name: '防刺服' },
  { id: 'r74', out: ['a25', 1], inp: [['m_leather', 2], ['m_nail', 2], ['m_scrap', 1]], reqInt: 23, diff: 2, cat: '防具', name: '工装靴' },
  { id: 'r75', out: ['a17', 1], inp: [['m_scrap', 2], ['m_leather', 1], ['m_spring', 2]], reqInt: 25, diff: 3, cat: '防具', name: '护腿' },
  { id: 'r76', out: ['a20', 1], inp: [['m_charcoal', 1], ['m_cloth', 1], ['m_rope', 1], ['m_glass', 1]], reqInt: 27, diff: 3, cat: '防具', name: '防毒面具' },
  // 传说（2 种，要等级）
  { id: 'r77', out: ['a27', 1], inp: [['m_scrap', 4], ['m_leather', 2], ['m_glass', 2], ['m_screw', 3]], reqInt: 40, diff: 4, reqLv: 10, cat: '防具', name: '传说·陶瓷插板背心' },
  { id: 'r78', out: ['a28', 1], inp: [['m_leather', 2], ['m_cloth', 3], ['m_screw', 2], ['m_glass', 1]], reqInt: 40, diff: 4, reqLv: 10, cat: '防具', name: '传说·凯夫拉头盔' },
  // 史诗
  { id: 'r79', out: ['a29', 1], inp: [['m_scrap', 6], ['m_spring', 4], ['m_screw', 4], ['m_copper', 3], ['m_leather', 3]], reqInt: 54, diff: 5, reqLv: 15, cat: '防具', name: '史诗·外骨骼护甲' },

  // ================= 背包：从小到大 =================
  { id: 'r80', out: ['b01', 1], inp: [['m_cloth', 3], ['m_rope', 1]], reqInt: 1, diff: 0, cat: '背包', name: '布袋' },
  { id: 'r81', out: ['b02', 1], inp: [['b01', 1], ['m_cloth', 2], ['m_leather', 1]], reqInt: 11, diff: 1, cat: '背包', name: '帆布包（布袋 + 布）' },
  { id: 'r82', out: ['b03', 1], inp: [['b02', 1], ['m_leather', 2], ['m_spring', 1]], reqInt: 22, diff: 2, cat: '背包', name: '登山包（帆布包 + 皮）' },
  { id: 'r83', out: ['b04', 1], inp: [['b03', 1], ['m_scrap', 2], ['m_cloth', 3]], reqInt: 32, diff: 3, cat: '背包', name: '军用背包（登山包 + 铁）' },
  { id: 'r84', out: ['b05', 1], inp: [['b04', 1], ['m_scrap', 4], ['m_spring', 2], ['m_leather', 3]], reqInt: 43, diff: 4, cat: '背包', name: '战术背囊（军用包 + 钢架）' },

  // ================= 暗器 =================
  { id: 'r90', out: ['t01', 3], inp: [['m_nail', 2], ['m_tape', 1]], reqInt: 7, diff: 0, cat: '暗器', name: '飞刀 x3' },
  { id: 'r91', out: ['t02', 3], inp: [['m_scrap', 1], ['m_glass', 1]], reqInt: 11, diff: 1, cat: '暗器', name: '手里剑 x3' },
  { id: 'r92', out: ['t03', 2], inp: [['m_herb', 1], ['m_nail', 1]], reqInt: 14, diff: 1, cat: '暗器', name: '毒针 x2' },
  { id: 'r93', out: ['t04', 1], inp: [['m_bottle', 1], ['m_charcoal', 1], ['m_cloth', 1]], reqInt: 11, diff: 1, cat: '暗器', name: '燃烧瓶' },
  { id: 'r94', out: ['t06', 1], inp: [['m_charcoal', 1], ['m_cloth', 1], ['m_bottle', 1]], reqInt: 14, diff: 1, cat: '暗器', name: '烟雾弹' },
  { id: 'r95', out: ['t05', 1], inp: [['m_gunpowder', 2], ['m_nail', 3], ['m_tape', 1]], reqInt: 22, diff: 2, cat: '暗器', name: '土制炸弹' },
  { id: 'r96', out: ['t07', 1], inp: [['m_gunpowder', 1], ['m_battery', 1], ['m_copper', 1]], reqInt: 25, diff: 3, cat: '暗器', name: '闪光弹' },
  { id: 'r97', out: ['t08', 1], inp: [['m_scrap', 2], ['m_spring', 1]], reqInt: 18, diff: 2, cat: '暗器', name: '捕兽夹' },

  // ================= 配件 =================
  { id: 'rA0', out: ['sp_repairkit', 1], inp: [['m_scrap', 1], ['m_spring', 1], ['m_tape', 1]], reqInt: 7, diff: 0, cat: '配件', name: '修理包' },
  { id: 'rA1', out: ['buff_charm', 1], inp: [['m_herb', 1], ['m_rope', 1], ['m_cloth', 1]], reqInt: 11, diff: 1, cat: '配件', name: '护身符' },
  { id: 'rA2', out: ['buff_bandolier', 1], inp: [['m_leather', 2], ['m_rope', 1], ['m_nail', 2]], reqInt: 14, diff: 2, cat: '配件', name: '弹链' },
  { id: 'rA3', out: ['buff_grip', 1], inp: [['m_leather', 1], ['m_screw', 2], ['m_tape', 1]], reqInt: 18, diff: 2, cat: '配件', name: '战术握把' },
  { id: 'rA4', out: ['buff_plate', 1], inp: [['m_scrap', 2], ['m_leather', 1], ['m_plank', 1]], reqInt: 25, diff: 3, cat: '配件', name: '防弹插板' },
  { id: 'rA5', out: ['buff_scope', 1], inp: [['m_glass', 2], ['m_copper', 1], ['m_screw', 2]], reqInt: 29, diff: 3, cat: '配件', name: '瞄准镜' },
  { id: 'rA6', out: ['buff_silencer', 1], inp: [['m_pipe', 1], ['m_spring', 1], ['m_tape', 2]], reqInt: 29, diff: 3, cat: '配件', name: '消音器' },
];

module.exports = { RECIPES };
