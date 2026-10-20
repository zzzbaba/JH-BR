// 江汉BR —— 商人 / 商店
// 只卖基础物资，高级武器和防具买不到，得靠抢。

// 商品清单：id, 价格, 单次限购（null 不限）
const GOODS = [
  ['med01', 40, null],   // 绷带
  ['med04', 30, null],   // 止痛药
  ['med07', 35, null],   // 能量饮料
  ['med08', 25, null],   // 速溶咖啡
  ['m_cloth', 8, null],
  ['m_plank', 15, null],
  ['m_nail', 6, null],
  ['m_tape', 10, null],
  ['m_bottle', 8, null],
  ['m_rope', 12, null],
  ['m_scrap', 6, null],
  ['m_alcohol', 15, null],
  ['m_cloth', 10, null],
  ['m_battery', 12, null],
  ['w05', 90, 2],        // 匕首
  ['b01', 70, 2],        // 布袋
  ['ammo_arrow', 8, null],
  ['ammo_pellet', 3, null],
  ['med16', 30, 3],      // 二锅头
  ['med17', 35, 3],      // 黑咖啡
  ['med20', 80, 2],      // 解毒剂
  ['med21', 45, 2],      // 醒酒汤
];

const GOODS_MAP = Object.fromEntries(GOODS.map(([id, price, limit]) => [id, { id, price, limit }]));

// 商人分布：只在这些区块出现
const MERCHANTS = {
  z33: { name: '军需官老周', greet: '十号地就剩我这一个摊子了。要什么，快点。', markup: 1.0 },
  z43: { name: '戴眼镜的女人', greet: '我不问你从哪来，你也别问我货从哪来。', markup: 1.1 },
  z34: { name: '瘸腿老李', greet: '走不动了，就在这儿守着箱子。你买不买？', markup: 0.95 },
  z32: { name: '收废品的老赵', greet: '废铁、瓶子、破布，我都收。', markup: 0.9 },
  z23: { name: '村口小卖部', greet: '货架还没搬空，抓紧。', markup: 0.95 },
  z24: { name: '水厂值班员', greet: '水不要钱，别的东西要。', markup: 1.0 },
  z12: { name: '湖边渔夫', greet: '鱼换东西，东西换鱼。', markup: 0.9 },
  z21: { name: '堤上的货郎', greet: '这一带就我一个人敢摆摊。', markup: 1.15 },
  z10: { name: '积玉口杂货铺', greet: '船没了，货还在。', markup: 1.0 },
  z00: { name: '钟楼下的老兵', greet: '你要往钟楼去？先把自己喂饱。', markup: 1.2 },
  z40: { name: '广北的守夜人', greet: '夜里别乱走。要东西白天来。', markup: 1.05 },
  z52: { name: '向阳供销社', greet: '凭票供应——现在没票了，凭钱。', markup: 1.0 },
  z51: { name: '红旗村大嫂', greet: '我这儿的绷带是全区最干净的。', markup: 0.95 },
  z64: { name: '研究院的门卫', greet: '里面不让进。外面的东西可以卖你。', markup: 1.1 },
  z74: { name: '姚嘴渡口', greet: '过江的船沉了，货还在。', markup: 0.9 },
  z76: { name: '器材库看门人', greet: '库里的东西动不得，我的东西可以。', markup: 1.0 },
  z66: { name: '供应处的会计', greet: '我这儿什么都记账。你欠我一笔，我记得住。', markup: 1.1 },
  z75: { name: '沙洋诊所', greet: '药不多，人更少。', markup: 1.15 },
};

function merchantAt(zoneId) { return MERCHANTS[zoneId] || null; }

function priceOf(itemId, markup) {
  const g = GOODS_MAP[itemId];
  if (!g) return null;
  return Math.round(g.price * (markup || 1));
}

// 商人收购价（原价 40%）
function sellPrice(itemId) {
  const g = GOODS_MAP[itemId];
  if (!g) return null;
  return Math.max(1, Math.round(g.price * 0.4));
}

module.exports = { GOODS, GOODS_MAP, MERCHANTS, merchantAt, priceOf, sellPrice };
