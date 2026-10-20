// 江汉BR —— 物品数据
// type: weapon | armor | bag | med | material | ammo | throwable | buff | special
// size: 占格数  stack: 最大堆叠

const ITEMS = {};

function def(id, o) { ITEMS[id] = Object.assign({ id }, o); }

// ============ 武器 35 套（全部为现实中存在的器械） ============
// dmg 基础伤害 / noise 噪音(1-10，越高越容易引来敌人) / ammo 弹药 / mag 弹匣
const WEAPONS = [
  // —— 冷兵器 15 ——
  ['木棍', 8, 1, 3, 1, null, 0, 2, '路边随手折的，胜在轻便。'],
  ['钢管', 12, 2, 3, 1, null, 0, 3, '工地上到处都是，砸下去很实在。'],
  ['铁锹', 11, 2, 4, 1, null, 0, 3, '挖坑用的，也能用来让人躺进去。'],
  ['扳手', 10, 2, 2, 1, null, 0, 3, '沉甸甸的开口扳手，握柄缠了胶布。'],
  ['匕首', 14, 1, 1, 2, null, 0, 2, '安静、致命，贴身时最好用。'],
  ['砍刀', 18, 2, 3, 2, null, 0, 3, '刀背厚实，砍柴也砍人。'],
  ['消防斧', 22, 3, 4, 2, null, 0, 3, '红色斧身掉了漆，刃口还锋利。'],
  ['棒球棍', 15, 3, 3, 1, null, 0, 3, '铝合金的，握感扎实。'],
  ['铁锤', 20, 3, 3, 2, null, 0, 3, '八角锤，挥起来有风声。'],
  ['长矛', 17, 1, 5, 2, null, 0, 3, '钢管前端焊了刀片，能保持距离。'],
  ['弓', 16, 1, 4, 2, 'ammo_arrow', 0, 3, '体育器材室翻出来的反曲弓。几乎无声。'],
  ['弩', 24, 1, 4, 3, 'ammo_bolt', 0, 3, '狩猎弩，上弦费劲，但一箭能钉穿门板。'],
  ['弹弓', 7, 1, 2, 1, 'ammo_pellet', 0, 2, '钢珠打眼睛，成本几乎为零。'],
  ['鱼叉', 17, 1, 4, 2, null, 0, 3, '从渔船上拆下来的，带倒钩。'],
  ['电击棍', 15, 2, 2, 3, 'battery_cell', 4, 4, '保安用的，能让人抽搐两秒。'],

  // —— 火器 20 ——
  ['信号枪', 10, 10, 2, 2, 'ammo_flare', 1, 3, '打出去是一团火，全油田都能看见。'],
  ['64式手枪', 18, 8, 2, 3, 'ammo_762p', 7, 3, '老警用手枪，小巧，威力一般。'],
  ['54式手枪', 24, 9, 2, 3, 'ammo_762p', 8, 3, '穿透力强，后坐力也大。'],
  ['92式手枪', 22, 8, 2, 3, 'ammo_9mm', 15, 3, '警用制式，弹容量大。'],
  ['左轮手枪', 26, 9, 2, 4, 'ammo_38', 6, 3, '六发，从不卡壳。'],
  ['双管猎枪', 45, 10, 5, 4, 'ammo_12ga', 2, 4, '两发打完就得装填，但近距离没人扛得住。'],
  ['泵动霰弹枪', 40, 10, 5, 4, 'ammo_12ga', 5, 4, '推拉上膛的声音比枪声更吓人。'],
  ['半自动霰弹枪', 38, 10, 5, 5, 'ammo_12ga', 7, 4, '连续输出，压枪要稳。'],
  ['56式冲锋枪', 28, 10, 4, 4, 'ammo_762r', 30, 4, '老兵的回忆，皮实耐用。'],
  ['79式冲锋枪', 24, 9, 3, 4, 'ammo_762p', 20, 4, '轻巧，适合巷战。'],
  ['81式自动步枪', 38, 10, 5, 5, 'ammo_762r', 30, 5, '可靠性极佳，中距离王者。'],
  ['95式自动步枪', 36, 10, 4, 5, 'ammo_58r', 30, 5, '无托结构，携行方便。'],
  ['AK-47', 40, 10, 5, 5, 'ammo_762r', 30, 5, '不需要维护也能打响。'],
  ['M16A1', 34, 10, 5, 5, 'ammo_556', 20, 5, '精度好，但娇气。'],
  ['56式半自动步枪', 35, 10, 5, 4, 'ammo_762r', 10, 4, '一枪一个，节奏慢但省弹。'],
  ['85式狙击步枪', 55, 10, 6, 5, 'ammo_762r', 10, 5, '带四倍镜，能在对方发现你之前解决问题。'],
  ['88式狙击步枪', 50, 9, 6, 5, 'ammo_58r', 10, 5, '半自动，补枪快。'],
  ['67式通用机枪', 42, 10, 8, 5, 'ammo_762r', 100, 5, '架起来就是火力点，但背着跑不动。'],
  ['95式班用机枪', 38, 10, 7, 5, 'ammo_58r', 75, 5, '一个班一挺，压制成瘾。'],
  ['40火箭筒', 120, 10, 9, 5, 'ammo_rocket', 1, 5, '一发足以把整间屋子抹掉。用完基本等于报废。'],
];

// 耐久：按伤害/噪音/弹容推算最大耐久与每次消耗
function weaponDur(dmg, noise, mag) {
  if (dmg >= 100) return 3;        // 火箭筒，基本一次性
  if (noise <= 3) return 70;       // 冷兵器
  if (mag >= 50) return 150;       // 机枪
  if (dmg >= 50) return 80;        // 狙击
  return 100;                       // 手枪 / 步枪 / 冲锋枪 / 霰弹
}
function weaponDurCost(noise, mag) {
  if (noise <= 3) return 1;
  if (mag >= 50) return 3;
  return 2;
}

// 已删除的武器：跳过但保留数组位置，id 不能变（老存档里还引用着）
// 冷兵器 4 把：和匕首/砍刀重复，纯占格子
// 火器 9 把：只留「一个类别一把」，减少配套子弹的碎片化
//   64式手枪（和 54/92 重复）、泵动/半自动霰弹枪（双管够）、56式冲锋枪（79式够）
//   81式自动步枪（95式够）、AK-47 / M16A1（国内根本不可能有）
//   85式狙击（88式够）、67式通用机枪（95班机够）
const REMOVED_WEAPONS = new Set([
  '木棍', '钢管', '铁锹', '扳手',
  '64式手枪', '泵动霰弹枪', '半自动霰弹枪', '56式冲锋枪',
  '81式自动步枪', 'AK-47', 'M16A1', '85式狙击步枪', '67式通用机枪',
]);

// ============ 火器射击模式 ============
// 这是「自动 / 半自动到底差在哪」的答案：
//   半自动：一发一发点，单发满伤、命中高、省弹、噪音小 —— 打得准、打得久
//   点射  ：两发一组，单发 62%，总伤害 1.24 倍 —— 折中
//   全自动：三发扫射，单发 45%，总伤害 1.35 倍，但吃弹快、命中低、噪音大、磨损快
//   压制  ：四发，单发 36%，总伤害 1.44 倍 —— 弹药黑洞，靠弹匣大才撑得住
// 所以「伤害数字」不再是唯一标准：全自动总伤更高，但一梭子打空弹匣、还容易打偏
const FIRE_MODES = {
  single: { name: '单发', shots: 1, per: 1.00, acc: 4, noise: 0, durMul: 1, note: '一次一发' },
  semi: { name: '半自动', shots: 1, per: 1.00, acc: 8, noise: -1, durMul: 1, note: '单发满伤，命中高，省弹' },
  burst: { name: '点射', shots: 2, per: 0.62, acc: -4, noise: 0, durMul: 1.5, note: '两发一组，总伤 1.24 倍' },
  auto: { name: '全自动', shots: 3, per: 0.45, acc: -12, noise: 2, durMul: 2, note: '三发扫射，总伤 1.35 倍，吃弹快、噪音大' },
  mg: { name: '压制', shots: 4, per: 0.36, acc: -16, noise: 3, durMul: 2.5, note: '四发连喷，总伤 1.44 倍，弹药黑洞' },
};
// 火器 → 射击模式（冷兵器没有这个字段）
// 只给「留下来的枪」配，删掉的不用写
const FIRE_OF = {
  '信号枪': 'single',
  '54式手枪': 'semi', '92式手枪': 'semi', '左轮手枪': 'semi',
  '双管猎枪': 'semi',
  '56式半自动步枪': 'semi', '88式狙击步枪': 'semi',
  '79式冲锋枪': 'burst',
  '95式自动步枪': 'auto',
  '95式班用机枪': 'mg',
  '40火箭筒': 'single',
};

WEAPONS.forEach(([name, dmg, noise, size, rarity, ammo, mag, tier, desc], i) => {
  if (REMOVED_WEAPONS.has(name)) return;
  const id = 'w' + String(i + 1).padStart(2, '0');
  def(id, {
    name, type: 'weapon', slot: 'weapon', dmg, noise, size, rarity, ammo, mag, tier, desc,
    stack: 1, value: Math.round(dmg * 6 * tier),
    maxDur: weaponDur(dmg, noise, mag),
    durCost: weaponDurCost(noise, mag),
    moddable: noise >= 8,        // 只有火器能改装
    fire: FIRE_OF[name] || null, // 射击模式，冷兵器是 null
  });
});

// ============ 防具 6 类 ============
// slot: head / body / hands / legs / face / feet
const ARMORS = [
  // 头盔
  ['安全帽', 'head', 3, 1, 2, '工地安全帽，挡得住砖头，挡不住子弹。'],
  ['自行车头盔', 'head', 5, 1, 2, '轻便，聊胜于无。'],
  ['摩托车头盔', 'head', 9, 2, 3, '全盔，视线受限但护得严实。'],
  ['防暴头盔', 'head', 14, 3, 4, '带面罩的警用防暴盔。'],
  ['军用钢盔', 'head', 18, 3, 4, '真正的军用头盔，能挡弹片。'],
  // 装甲
  ['棉袄', 'body', 4, 2, 1, '厚棉袄，冬天保暖，夏天要命。'],
  ['皮夹克', 'body', 8, 2, 2, '挡刀效果好，挡枪不行。'],
  ['防刺服', 'body', 14, 3, 3, '内衬钢板，专防冷兵器。'],
  ['防弹衣', 'body', 24, 4, 4, '警用软质防弹衣，能挡手枪弹。'],
  ['重型防弹衣', 'body', 36, 5, 5, '插板式，重得走路都慢，但值。'],
  // 手套
  ['劳保手套', 'hands', 2, 1, 1, '帆布的，干活方便。'],
  ['皮手套', 'hands', 4, 1, 2, '握刀不打滑。'],
  ['防割手套', 'hands', 7, 1, 3, '刀划不进去，也能抓铁丝网。'],
  ['战术手套', 'hands', 9, 1, 4, '带硬质护指，格挡时有用。'],
  // 裤子
  ['牛仔裤', 'legs', 4, 2, 1, '结实，耐磨。'],
  ['工装裤', 'legs', 6, 2, 2, '口袋里塞满了工具。'],
  ['护腿', 'legs', 11, 2, 3, '摩托护腿，绑在膝盖上。'],
  ['战术裤', 'legs', 14, 2, 4, '带护膝的战术长裤。'],
  // 面具
  ['口罩', 'face', 1, 1, 1, '挡不住子弹，能挡点灰。'],
  ['防毒面具', 'face', 8, 2, 3, '化工厂一带最好用。'],
  ['防暴面罩', 'face', 10, 2, 3, '透明面罩，护脸。'],
  ['战术面罩', 'face', 13, 2, 4, '只露眼睛，挡破片。'],
  // 鞋子
  ['布鞋', 'feet', 2, 1, 1, '轻便，跑得快。'],
  ['运动鞋', 'feet', 4, 1, 2, '抓地力好。'],
  ['工装靴', 'feet', 8, 2, 3, '钢头，踹人也疼。'],
  ['战术靴', 'feet', 12, 2, 4, '高帮，脚踝有保护。'],
  // —— 传说 / 史诗（只能合成，掉落表里没有）——
  ['陶瓷插板背心', 'body', 44, 4, 5, '两块陶瓷板压在胸前，扛得住步枪弹。'],
  ['凯夫拉头盔', 'head', 22, 3, 5, '芳纶纤维，轻得像塑料，硬得不像。'],
  ['外骨骼护甲', 'body', 58, 5, 5, '油田消防队的旧装备，背上去像多了层骨头。'],
];

ARMORS.forEach(([name, slot, defense, size, rarity, desc], i) => {
  const id = 'a' + String(i + 1).padStart(2, '0');
  def(id, { name, type: 'armor', slot, defense, size, rarity, stack: 1, value: defense * 12, desc });
});

// ============ 背包 5 种 ============
const BAGS = [
  ['布袋', 8, 2, 1, '只能多装几样小东西。'],
  ['帆布包', 20, 3, 2, '结实能装，人人都有一个。'],
  ['登山包', 40, 4, 3, '分区多，背起来不累。'],
  ['军用背包', 60, 5, 4, '加厚背带，能扛一整天。'],
  ['战术背囊', 100, 6, 5, '外骨骼式承重，装下一整个人家的家当。'],
];
BAGS.forEach(([name, bonus, size, rarity, desc], i) => {
  const id = 'b' + String(i + 1).padStart(2, '0');
  def(id, { name, type: 'bag', slot: 'bag', bagBonus: bonus, size, rarity, stack: 1, value: bonus * 15, desc });
});

// ============ 材料 ============
const MATERIALS = [
  // 18 种核心材料，每种都在多条配方里出现，不留纯占格的废料
  ['布条', 'cloth', 1], ['木板', 'plank', 2], ['铁钉', 'nail', 1], ['胶带', 'tape', 1],
  ['空瓶', 'bottle', 1], ['火药', 'gunpowder', 1], ['电池', 'battery', 1], ['铜线', 'copper', 1],
  ['弹簧', 'spring', 1], ['钢管', 'pipe', 2], ['绳子', 'rope', 1], ['废铁', 'scrap', 1],
  ['皮革', 'leather', 2], ['玻璃片', 'glass', 1], ['螺丝', 'screw', 1],
  ['医用酒精', 'alcohol', 1], ['草药', 'herb', 1], ['木炭', 'charcoal', 1],
];
MATERIALS.forEach(([name, key, size]) => {
  def('m_' + key, {
    name, type: 'material', size, rarity: 1, stack: 20, value: 3,
    desc: '合成材料。',
  });
});
// 电击棍用的电池组
def('battery_cell', { name: '电池组', type: 'ammo', size: 1, rarity: 2, stack: 10, value: 8, desc: '电击棍的供电单元。' });

// ============ 药物 / 恢复 ============
const MEDS = [
  ['绷带', 15, 0, 1, 1, {}, '止血用的，回血 15。'],
  ['止血带', 25, 0, 1, 2, {}, '回血 25。'],
  ['急救包', 45, 0, 2, 3, {}, '回血 45，正规医疗物资。'],
  ['止痛药', 10, 0, 1, 1, { sta: 2 }, '回血 10，本局体力 +2。'],
  ['吗啡', 60, 0, 1, 4, { int: -3 }, '回血 60，但会让人反应变慢（智力 -3，本局）。'],
  ['兴奋剂', 0, 35, 1, 2, {}, '精力 +35。'],
  ['能量饮料', 0, 20, 1, 1, {}, '精力 +20。'],
  ['速溶咖啡', 0, 12, 1, 1, {}, '精力 +12。'],
  ['强心针', 50, -15, 1, 4, { str: 4 }, '回血 50，武力 +4，但精力 -15。'],
  ['蛋白粉', 0, 0, 1, 2, { sta: 5 }, '本局体力 +5。'],
  ['类固醇', 0, 0, 1, 3, { str: 6 }, '本局武力 +6。'],
  ['聪明药', 0, 0, 1, 3, { int: 6 }, '本局智力 +6。'],
  ['镇静剂', 0, 0, 1, 2, { cha: 6 }, '本局魅力 +6。'],
  ['四叶草', 0, 0, 1, 3, { luk: 6 }, '本局幸运 +6。'],
  ['香水', 0, 0, 1, 2, { cha: 9 }, '本局魅力 +9。'],
];
MEDS.forEach(([name, hp, ep, size, rarity, buff, desc], i) => {
  def('med' + String(i + 1).padStart(2, '0'), {
    name, type: 'med', size, rarity, stack: 5, value: 20 + hp + ep, hp, ep, buff, desc,
  });
});

// ============ 状态类道具 ============
def('med16', { name: '二锅头', type: 'med', size: 1, rarity: 2, stack: 3, value: 30, setStatus: 'drunk', desc: '半瓶下肚，胆子大了，手也抖了。5 分钟内防御大幅提升，攻击下降。' });
def('med17', { name: '黑咖啡', type: 'med', size: 1, rarity: 2, stack: 3, value: 35, setStatus: 'clear', desc: '浓得发苦。5 分钟内攻防都有明显提升。' });
def('med18', { name: '毒蘑菇', type: 'med', size: 1, rarity: 2, stack: 3, value: 12, setStatus: 'poisoned', desc: '长得很好看。吃下去 5 分钟内每移动一次，血量和精力各掉 20%。' });
def('med20', { name: '解毒剂', type: 'med', size: 1, rarity: 3, stack: 3, value: 80, cureStatus: ['poisoned'], desc: '一支下去，胃里的东西终于安静了。解除中毒。' });
def('med21', { name: '醒酒汤', type: 'med', size: 1, rarity: 2, stack: 3, value: 45, cureStatus: ['drunk'], desc: '酸得让人一激灵。解除醉酒。' });
def('med22', { name: '万能解药', type: 'med', size: 1, rarity: 5, stack: 2, value: 260, cureStatus: ['poisoned', 'drunk', 'frozen', 'clear'], desc: '不知道谁配的，什么都治。清除所有异常状态。' });

// ============ 对敌道具 ============
// 战斗里扔到敌人身上，或者在地图上「埋设」，下一次在这个区块打起来时对方开局带负面状态。
// foe 字段：{ freeze 冻住几回合 / blindPen 命中惩罚 / atkMul 攻击倍率 / dotPct 每回合掉最大血比例 / turns 持续回合 }
const HOSTILES = [
  ['液氮罐', 2, 3, 60, { freeze: 2, turns: 2 }, '冻住对方 2 回合，动都动不了。'],
  ['石灰粉', 1, 2, 35, { blindPen: 35, turns: 2 }, '撒进眼睛里，2 回合内对方几乎打不中你。'],
  ['辣椒喷雾', 1, 1, 20, { blindPen: 25, turns: 1 }, '近距离喷脸，1 回合内对方看不清。'],
  ['强效镇静剂', 1, 3, 90, { atkMul: 0.55, turns: 3 }, '打进去肌肉就软了，3 回合内攻击 -45%。'],
  ['毒瓶', 1, 3, 70, { dotPct: 0.09, turns: 3 }, '玻璃瓶砸碎，毒液渗进伤口，3 回合每回合掉 9% 生命。'],
];
HOSTILES.forEach(([name, size, rarity, value, foe, desc], i) => {
  def('h' + String(i + 1).padStart(2, '0'), {
    name, type: 'hostile', size, rarity, stack: 3, value, foe,
    desc: desc + '（战斗中对敌使用，或在地图上埋设）',
  });
});
// 老存档里还有 med19（液氮罐），保留 id 但改成对敌道具，别让玩家的东西凭空消失
def('med19', { name: '液氮罐', type: 'hostile', size: 2, rarity: 3, stack: 2, value: 60, foe: { freeze: 2, turns: 2 }, desc: '冻住对方 2 回合，动都动不了。（战斗中对敌使用，或在地图上埋设）' });

// ============ 永久属性药剂（稀有） ============
[['体力药剂', 'sta', '永久体力 +1'], ['力量药剂', 'str', '永久武力 +1'],
 ['魅力药剂', 'cha', '永久魅力 +1'], ['智力药剂', 'int', '永久智力 +1'],
 ['幸运药剂', 'luk', '永久幸运 +1']].forEach(([name, key, desc], i) => {
  def('vit_' + key, {
    name, type: 'med', size: 1, rarity: 5, stack: 3, value: 400,
    perm: { [key]: 1 }, desc: desc + '。属性越高越难再提升。',
  });
});

// ============ 弹药 ============
// 每一种都必须有枪用。删枪要连弹药一起删，不然会出现「永远用不上」的孤儿子弹。
const AMMO = [
  ['箭矢', 'ammo_arrow', 12], ['弩矢', 'ammo_bolt', 20], ['钢珠', 'ammo_pellet', 2],
  ['信号弹', 'ammo_flare', 30], ['7.62mm 手枪弹', 'ammo_762p', 4], ['9mm 手枪弹', 'ammo_9mm', 4],
  ['.38 弹', 'ammo_38', 5], ['12号霰弹', 'ammo_12ga', 8], ['7.62mm 步枪弹', 'ammo_762r', 6],
  ['5.8mm 步枪弹', 'ammo_58r', 6], ['火箭弹', 'ammo_rocket', 120],
];
AMMO.forEach(([name, id, value]) => {
  def(id, { name, type: 'ammo', size: 1, rarity: 2, stack: 30, value, desc: '弹药，需装填到对应武器。' });
});

// ============ 暗器 / 投掷 ============
const THROW = [
  ['飞刀', 16, 3, 1, 2, '脱手即中，无声。'],
  ['手里剑', 12, 4, 1, 2, '一次可以甩出好几枚。'],
  ['毒针', 8, 3, 1, 3, '伤害不高，但会让对方持续掉血。'],
  ['燃烧瓶', 30, 6, 2, 3, '砸中后点燃，持续灼烧。'],
  ['土制炸弹', 55, 10, 2, 4, '火药加铁钉，炸开一片。'],
  ['烟雾弹', 0, 2, 2, 3, '制造烟雾，大幅提高脱身成功率。'],
  ['闪光弹', 0, 6, 2, 4, '短暂致盲，下一击必中。'],
  ['捕兽夹', 25, 1, 2, 3, '布置在原地，踩中者受伤并无法行动。'],
  ['地雷', 60, 10, 2, 5, '布置在原地，踩中即重伤。'],
];
THROW.forEach(([name, dmg, noise, size, rarity, desc], i) => {
  def('t' + String(i + 1).padStart(2, '0'), {
    name, type: 'throwable', size, rarity, stack: 5, value: 30 + dmg * 3, dmg, noise, desc,
  });
});

// ============ 增益 / 配件 / 特殊 ============
// modSlot 存在即表示「必须装到武器上才生效」（只有火器有槽位）
// bagEffect: true 表示「放背包里就生效」，不需要安装
def('buff_silencer', {
  name: '消音器', type: 'buff', size: 2, rarity: 4, stack: 1, value: 300,
  modSlot: 'muzzle', noiseCut: 6,
  desc: '必须装到武器上才生效：噪音 -6。放背包里没用。',
});
def('buff_scope', {
  name: '瞄准镜', type: 'buff', size: 1, rarity: 4, stack: 1, value: 220,
  modSlot: 'sight', accBonus: 12,
  desc: '必须装到武器上才生效：命中 +12%。放背包里没用。',
});
def('buff_grip', {
  name: '战术握把', type: 'buff', size: 1, rarity: 3, stack: 1, value: 180,
  modSlot: 'grip', dmgBonus: 0.08,
  desc: '必须装到武器上才生效：伤害 +8%。放背包里没用。',
});
def('buff_plate', { name: '防弹插板', type: 'buff', size: 2, rarity: 4, stack: 1, value: 260, defBonus: 10, bagEffect: true, desc: '放在背包里就生效：防御 +10。不用装到装备上。' });
def('buff_charm', { name: '护身符', type: 'buff', size: 1, rarity: 4, stack: 1, value: 200, lukBonus: 8, bagEffect: true, desc: '放在背包里就生效：幸运 +8。不用装到装备上。' });
def('buff_bandolier', { name: '弹链', type: 'buff', size: 2, rarity: 3, stack: 1, value: 150, ammoSave: 20, bagEffect: true, desc: '放在背包里就生效：每次开火有 20% 概率不消耗弹药。' });
def('sp_radio', { name: '对讲机', type: 'special', size: 2, rarity: 4, stack: 1, value: 180, desc: '可以听到底噪里的情报，探索时额外提示周边危险。' });
def('sp_map', { name: '油田地图', type: 'special', size: 1, rarity: 4, stack: 1, value: 120, desc: '标注了全部区块，使用后永久解锁地图全貌。' });
def('sp_policekey', { name: '枪柜钥匙', type: 'special', size: 1, rarity: 5, stack: 1, value: 500, desc: '油田公安局枪柜的钥匙。里面有什么，想想就知道。' });
def('sp_repairkit', {
  name: '修理包', type: 'special', size: 1, rarity: 2, stack: 5, value: 60,
  repair: 40,
  desc: '废铁、机油和胶带凑的。使用后给当前武器恢复 40 点耐久。',
});

// 查找辅助
// 过滤掉已删除的（那些 id 仍然占位，ITEMS 里是 undefined）
const WEAPON_LIST = WEAPONS.map((w, i) => ITEMS['w' + String(i + 1).padStart(2, '0')]).filter(Boolean);
const AMMO_IDS = AMMO.map(a => a[1]);

function get(id) { return ITEMS[id] || null; }
function all() { return Object.values(ITEMS); }

module.exports = { ITEMS, WEAPON_LIST, AMMO_IDS, FIRE_MODES, get, all };
