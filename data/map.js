// 江汉BR —— 地图数据
// 8x8 = 64 区块：广华 20 / 向阳 20 / 五七 20 / 十号地 4
// 坐标系：x 为列(0-7)，y 为行(0-7)

const REGIONS = {
  guanghua: { key: 'guanghua', name: '广华片区', short: '广华', color: '#5a2e2a', color2: '#7a3e36' },
  xiangyang: { key: 'xiangyang', name: '向阳片区', short: '向阳', color: '#3e2630', color2: '#5a3646' },
  wuqi: { key: 'wuqi', name: '五七片区', short: '五七', color: '#63321f', color2: '#85442a' },
  shihao: { key: 'shihao', name: '十号地', short: '十号地', color: '#7a1f28', color2: '#a02c38' },
};

// [x, y, region, name, danger, loot, type, desc]
const RAW = [
  // ===== 广华片区 20 =====
  [0, 0, 'guanghua', '广华寺', 3, 3, 'town', '油田最老的居民区，红砖楼排得整整齐齐，如今窗户全碎了。'],
  [1, 0, 'guanghua', '广华大道', 4, 4, 'street', '贯穿全区的主干道，路灯杆歪了一排，柏油路上有拖行的痕迹。'],
  [2, 0, 'guanghua', '华苑小区', 2, 3, 'town', '曾经的职工住宅，楼道里还贴着十年前的春联。'],
  [3, 0, 'guanghua', '广南新村', 2, 2, 'town', '最南边的新村，围墙塌了半截，菜地里长满荒草。'],
  [4, 0, 'guanghua', '广北小区', 3, 3, 'town', '北门锁死，只能翻墙。楼道深处传来滴水声。'],
  [5, 0, 'guanghua', '周矶农场', 3, 5, 'field', '大片棉田和鱼塘，视野开阔，藏不住人，但物资散落多。'],
  [6, 0, 'guanghua', '王场镇', 4, 4, 'town', '镇上唯一的十字路口，四家小卖部早被搬空。'],
  [7, 0, 'guanghua', '高石碑', 4, 5, 'field', '一块巨大的石碑立在旷野里，碑面被人用刀刻满了名字。'],

  [0, 1, 'guanghua', '积玉口', 3, 3, 'village', '水网密布的村子，每户门前都有条小船。'],
  [1, 1, 'guanghua', '浩口镇', 4, 4, 'town', '沿河的老镇，桥面只剩半边能走。'],
  [2, 1, 'guanghua', '熊口镇', 5, 5, 'town', '据说这里驻着一伙狠角色，进镇前最好掂量掂量。'],
  [3, 1, 'guanghua', '张金镇', 4, 4, 'town', '镇口的水塔上挂着风铃，风一吹响得瘆人。'],
  [4, 1, 'guanghua', '龙湾镇', 3, 4, 'village', '老宅子连成片，天井里全是落叶。'],
  [5, 1, 'guanghua', '徐李村', 2, 2, 'village', '安静得反常，连鸟叫都没有。'],
  [6, 1, 'guanghua', '渔洋镇', 4, 3, 'town', '镇上唯一亮着灯的是家网吧，但发电机早停了。'],
  [7, 1, 'guanghua', '老新镇', 3, 3, 'village', '村口的水泥路上摆着一排空酒瓶。'],

  [0, 2, 'guanghua', '白鹭湖', 3, 4, 'field', '湖面平静，芦苇丛里能藏下整支队伍。'],
  [1, 2, 'guanghua', '运粮湖', 3, 4, 'field', '堤坝上风很大，脚下的泥地一踩一个坑。'],
  [2, 2, 'guanghua', '西大垸', 2, 3, 'field', '一大片撂荒的农田，中间孤零零立着个抽水站。'],
  [3, 2, 'guanghua', '后湖管理区', 4, 4, 'town', '管理区的办公楼还在，档案室被人翻得底朝天。'],

  // ===== 向阳片区 20 =====
  [4, 2, 'xiangyang', '向阳小区', 2, 3, 'town', '向阳片区最热闹的地方，也是最像家的地方。'],
  [5, 2, 'xiangyang', '红旗村', 3, 3, 'village', '村部大喇叭还挂着，只是不会再响了。'],
  [6, 2, 'xiangyang', '五场', 3, 4, 'town', '老五场的地界，仓库门被撬开过不止一次。'],
  [7, 2, 'xiangyang', '东风路', 4, 4, 'street', '两排梧桐遮住整条路，白天也见不到太阳。'],

  [0, 3, 'xiangyang', '前进街', 3, 3, 'street', '街边的早点摊还支着，锅里的油早凝了。'],
  [1, 3, 'xiangyang', '建设新村', 2, 3, 'town', '楼间距很窄，适合伏击，也容易被堵死。'],
  [2, 3, 'xiangyang', '团结村', 3, 2, 'village', '村名很讽刺，这里的人为了半袋米能拼命。'],

  [0, 4, 'xiangyang', '机械厂', 5, 5, 'industrial', '车间里的机床还在，铁屑堆里能翻出好东西，也有陷阱。'],
  [1, 4, 'xiangyang', '运输处', 4, 5, 'industrial', '几十台报废卡车停成一片，是天然的掩体迷宫。'],
  [2, 4, 'xiangyang', '供水公司', 3, 3, 'industrial', '水塔还在供水，这是全油田最值钱的地方之一。'],

  [0, 5, 'xiangyang', '砖瓦厂', 4, 4, 'industrial', '窑口黑得像张开的嘴，里面温度还没散尽。'],
  [1, 5, 'xiangyang', '油田一中', 3, 4, 'school', '教室里桌椅倒了一地，黑板上写着半句没写完的话。'],
  [2, 5, 'xiangyang', '职工医院', 4, 5, 'hospital', '药房是重点，也是坟场。走廊尽头有灯还亮着。'],
  [3, 5, 'xiangyang', '供电所', 5, 5, 'industrial', '变压器嗡嗡响，是全区唯一还有电的地方。'],
  [4, 5, 'xiangyang', '通讯站', 4, 4, 'industrial', '铁塔下面堆着被剪断的线缆，信号早就断了。'],
  [5, 5, 'xiangyang', '勘探队', 4, 4, 'industrial', '院子里停着震源车，钻杆横七竖八。'],
  [6, 5, 'xiangyang', '钻井公司', 5, 5, 'industrial', '井架高得看不到顶，风一吹钢缆就呜呜地叫。'],
  [7, 5, 'xiangyang', '采油一队', 4, 4, 'industrial', '抽油机还在一下一下地磕头，没人给它断电。'],

  [0, 6, 'xiangyang', '井下作业', 5, 4, 'industrial', '井口压力表还指着红区，谁也不知道会不会喷。'],
  [1, 6, 'xiangyang', '研究院', 3, 5, 'office', '办公楼里全是图纸和资料，还有一间上锁的样品室。'],

  // ===== 十号地 4（出生地） =====
  [3, 3, 'shihao', '十号地', 1, 2, 'spawn', '一切开始的地方。空地上画着白圈，广播就是从这儿响起来的。'],
  [4, 3, 'shihao', '十号地北', 2, 2, 'camp', '北侧搭着几顶军用帐篷，地上散落着编号牌。'],
  [3, 4, 'shihao', '十号地南', 2, 2, 'camp', '南边是物资发放点，箱子早被抢光了，只剩空壳。'],
  [4, 4, 'shihao', '十号地车站', 3, 3, 'station', '小站台，铁轨通向油田外。传说有人试过沿着铁轨走。'],

  // ===== 五七片区 20 =====
  [5, 3, 'wuqi', '五七厂', 4, 4, 'industrial', '五七厂的核心车间，龙门吊还悬在半空。'],
  [6, 3, 'wuqi', '五七大道', 4, 4, 'street', '笔直的一条路，两侧全是厂房，走上去像走进枪口。'],
  [7, 3, 'wuqi', '炼油厂', 5, 5, 'industrial', '管道纵横如迷宫，空气里全是油味，一点火星就够。'],

  [5, 4, 'wuqi', '化工厂', 5, 5, 'industrial', '储罐区，地面结着奇怪的结晶，踩上去咯吱响。'],
  [6, 4, 'wuqi', '盐化厂', 4, 4, 'industrial', '白茫茫一片盐堆，反光刺眼。'],
  [7, 4, 'wuqi', '钢管厂', 4, 5, 'industrial', '成堆的钢管，随手一根就是武器。'],

  [2, 6, 'wuqi', '总机厂', 4, 4, 'industrial', '总机厂的老厂房，行车轨道从头顶穿过。'],
  [3, 6, 'wuqi', '四机厂', 5, 5, 'industrial', '石油机械的老巢，零件库是个宝库。'],
  [4, 6, 'wuqi', '固井队', 3, 3, 'industrial', '水泥车停了一排，灰浆早凝固成石头。'],
  [5, 6, 'wuqi', '试油队', 4, 4, 'industrial', '井场围栏倒了一半，野狗在这里成群。'],
  [6, 6, 'wuqi', '供应处', 5, 5, 'warehouse', '全区物资最集中的地方，也是死人最多的地方。'],
  [7, 6, 'wuqi', '器材库', 4, 5, 'warehouse', '铁门被炸开过，里面还有没拆封的木箱。'],

  [0, 7, 'wuqi', '汽车大修厂', 4, 4, 'industrial', '地沟里积着黑油，掉下去就上不来。'],
  [1, 7, 'wuqi', '沙洋', 3, 3, 'town', '出了油田地界的小镇，街上有家还开着门的诊所。'],
  [2, 7, 'wuqi', '姚嘴', 3, 3, 'village', '沿江的村子，渡口的船被人凿沉了。'],
  [3, 7, 'wuqi', '小港', 2, 3, 'village', '小到只有一条街，安静得能听见自己心跳。'],
  [4, 7, 'wuqi', '江汉石油管理局', 5, 5, 'office', '整座油田的大脑。楼顶的旗杆空着，旗子不知去向。'],
  [5, 7, 'wuqi', '石油机械厂', 4, 4, 'industrial', '车间里全是半成品，铁水包早就凉透了。'],
  [6, 7, 'wuqi', '钻头厂', 4, 4, 'industrial', '一排排钻头插在架子上，像某种仪式。'],
  [7, 7, 'wuqi', '油田公安局', 5, 5, 'police', '枪柜被人撬开了。这里的东西，比任何地方都危险。'],
];

// 出生点 4 格
const SPAWN_CELLS = [[3, 3], [4, 3], [3, 4], [4, 4]];
// 危险度按"离出生点的曼哈顿距离"递进：出生地最安全，越往边缘越凶险
const DANGER_LADDER = [1, 2, 2, 3, 4, 5, 5];

function distToSpawn(x, y) {
  return Math.min(...SPAWN_CELLS.map(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy)));
}
function autoDanger(x, y) {
  return DANGER_LADDER[Math.min(distToSpawn(x, y), DANGER_LADDER.length - 1)];
}

const MAP = RAW.map(([x, y, region, name, _danger, loot, type, desc], i) => ({
  id: `z${y}${x}`,
  x, y, region, name, danger: autoDanger(x, y), loot, type, desc,
  idx: i,
}));

// 索引
const BY_ID = Object.fromEntries(MAP.map(z => [z.id, z]));
const BY_XY = Object.fromEntries(MAP.map(z => [`${z.x},${z.y}`, z]));

function zoneAt(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return BY_XY[`${x},${y}`] || null;
}

function neighbors(x, y) {
  return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]
    .map(([nx, ny]) => zoneAt(nx, ny)).filter(Boolean);
}

// 出生点
const SPAWN_ID = 'z33'; // 十号地

module.exports = { MAP, BY_ID, BY_XY, REGIONS, zoneAt, neighbors, SPAWN_ID };
