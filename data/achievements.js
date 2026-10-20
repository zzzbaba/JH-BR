// 江汉BR —— 成就 / 称号
// check(c) 返回布尔值。c 是角色对象，c.stats 是累计统计。
// cat 是分类，前端按 CAT_ORDER 分组显示；加称号时记得给 cat。
//
// 注意：check 每次行动后都会对「未解锁」的称号跑一遍，所以必须便宜、且不能抛异常。
// 需要跨轮次的数据看 c.career（存 users.json），单轮的看 c.stats。

const CAT_ORDER = ['通用', '战斗', '生存', '剧情', '神秘', '特色'];

const ITEMS = require('./items').ITEMS;

const BASE_SLOTS = 32;   // 必须和 game.js 的 BASE_SLOTS 一致

const ARMOR_SLOTS = ['head', 'body', 'hands', 'legs', 'face', 'feet'];
const attrSum = c => {
  const a = c.attrs || {};
  return (a.sta || 0) + (a.str || 0) + (a.cha || 0) + (a.int || 0) + (a.luk || 0);
};
const st = (c, k) => (c.stats && c.stats[k]) || 0;
const wornArmor = c => {
  const eq = c.equip || {};
  return ARMOR_SLOTS.filter(s => eq[s] && ITEMS[eq[s].id]).length;
};

const ACHIEVEMENTS = [
  // ================= 通用 =================
  {
    id: 'first_step', title: '初次登场', icon: '走', tier: 1, cat: '通用',
    desc: '广播念完你的编号，你迈出了第一步。',
    hint: '移动 1 次',
    check: c => st(c, 'moves') >= 1,
  },
  {
    id: 'walker', title: '老油条', icon: '磨', tier: 2, cat: '通用',
    desc: '一百次抬脚，你已经能闭着眼走过这片废墟。',
    hint: '累计移动 100 次',
    check: c => st(c, 'moves') >= 100,
  },
  {
    id: 'rich', title: '万元户', icon: '钱', tier: 2, cat: '通用',
    desc: '在这地方，钱还是钱。你手里有不少。',
    hint: '累计赚到 3000 金币',
    check: c => st(c, 'goldEarned') >= 3000,
  },
  {
    id: 'spender', title: '大客户', icon: '买', tier: 2, cat: '通用',
    desc: '商人见到你会先笑一下。',
    hint: '累计购买 30 次',
    check: c => st(c, 'bought') >= 30,
  },
  {
    id: 'seller', title: '出货王', icon: '卖', tier: 2, cat: '通用',
    desc: '你比商人还懂行情。',
    hint: '累计出售 30 次',
    check: c => st(c, 'sold') >= 30,
  },
  {
    id: 'craftsman', title: '手艺人', icon: '工', tier: 2, cat: '通用',
    desc: '五十次敲打，你的手比脑子先知道怎么用力。',
    hint: '合成成功 50 次',
    check: c => st(c, 'crafts') >= 50,
  },
  {
    id: 'max_level', title: '三十而立', icon: '满', tier: 3, cat: '通用',
    desc: '等级到顶了。你身上的东西，已经不是普通人的配置。',
    hint: '达到 30 级',
    check: c => (c.level || 1) >= 30,
  },
  {
    id: 'full_attr', title: '五边形战士', icon: '全', tier: 3, cat: '通用',
    desc: '五项全部拉满。你已经没有短板可打了。',
    hint: '五维属性全部达到 100',
    check: c => {
      const a = c.attrs || {};
      return ['sta', 'str', 'cha', 'int', 'luk'].every(k => (a[k] || 0) >= 100);
    },
  },
  {
    id: 'ironman', title: '钢铁之躯', icon: '铁', tier: 3, cat: '通用',
    desc: '五项属性总和 300。你已经不太像普通人了。',
    hint: '五维属性总和达到 300',
    check: c => attrSum(c) >= 300,
  },
  {
    id: 'iron400', title: '非人哉', icon: '神', tier: 4, cat: '通用',
    desc: '五项总和 400。广播念到你的编号时，声音顿了一下。',
    hint: '五维属性总和达到 400',
    check: c => attrSum(c) >= 400,
  },

  // ================= 战斗 =================
  {
    id: 'first_blood', title: '新手猎人', icon: '杀', tier: 1, cat: '战斗',
    desc: '第一次杀掉一个人。',
    hint: '击杀 1 名敌人',
    check: c => st(c, 'kills') >= 1,
  },
  {
    id: 'kill10', title: '十人斩', icon: '斩', tier: 2, cat: '战斗',
    desc: '十个人倒在你面前。你开始不去看脸了。',
    hint: '累计击杀 10 名敌人',
    check: c => st(c, 'kills') >= 10,
  },
  {
    id: 'kill25', title: '二十五人斩', icon: '狠', tier: 3, cat: '战斗',
    desc: '这一片的人开始绕着你的方向走。',
    hint: '累计击杀 25 名敌人',
    check: c => st(c, 'kills') >= 25,
  },
  {
    id: 'butcher', title: '刽子手', icon: '屠', tier: 3, cat: '战斗',
    desc: '你不再数了。手上沾的东西洗不掉。',
    hint: '累计击杀 50 名敌人',
    check: c => st(c, 'kills') >= 50,
  },
  {
    id: 'kill100', title: '百人斩', icon: '魔', tier: 4, cat: '战斗',
    desc: '一百个。广播里念到的编号，有一半是你划掉的。',
    hint: '累计击杀 100 名敌人',
    check: c => st(c, 'kills') >= 100,
  },
  {
    id: 'crit50', title: '要害专家', icon: '准', tier: 3, cat: '战斗',
    desc: '五十次打进要害。你知道人身上哪里最不结实。',
    hint: '累计打出 50 次暴击',
    check: c => st(c, 'crits') >= 50,
  },
  {
    id: 'fist1', title: '拳头说话', icon: '拳', tier: 2, cat: '战斗',
    desc: '没有刀，没有枪，就靠一双手。',
    hint: '徒手击杀 1 名敌人',
    check: c => st(c, 'fistKills') >= 1,
  },
  {
    id: 'fist5', title: '赤手空拳', icon: '硬', tier: 3, cat: '战斗',
    desc: '五个人死在你的拳头上。武器是给胆小鬼用的。',
    hint: '徒手击杀 5 名敌人',
    check: c => st(c, 'fistKills') >= 5,
  },
  {
    id: 'lowhp', title: '残血不倒', icon: '撑', tier: 3, cat: '战斗',
    desc: '血快没了，你还站着。',
    hint: '生命 ≤5 时依然活着',
    check: c => c.alive !== false && (c.hp || 0) > 0 && (c.hp || 0) <= 5,
  },
  {
    id: 'nogear', title: '裸装硬汉', icon: '裸', tier: 3, cat: '战斗',
    desc: '一件防具都没穿，照样杀了五个。',
    hint: '不穿任何防具的情况下击杀 5 人',
    check: c => wornArmor(c) === 0 && st(c, 'kills') >= 5,
  },
  {
    id: 'champion', title: '油田之王', icon: '王', tier: 4, cat: '战斗',
    desc: '最终 BOSS 倒在你脚下。整片油田安静了。',
    hint: '击杀最终 BOSS',
    check: c => st(c, 'bossKills') >= 1,
  },

  // ================= 生存 =================
  {
    id: 'survivor', title: '不死鸟', icon: '生', tier: 2, cat: '生存',
    desc: '三十个回合过去，你还在走。',
    hint: '单局存活 30 回合',
    check: c => (c.turn || 0) >= 30,
  },
  {
    id: 'turn60', title: '长跑者', icon: '跑', tier: 3, cat: '生存',
    desc: '六十个回合。地图上的每个角落你都闻过一遍。',
    hint: '单局存活 60 回合',
    check: c => (c.turn || 0) >= 60,
  },
  {
    id: 'turn80', title: '马拉松', icon: '远', tier: 4, cat: '生存',
    desc: '八十个回合。广播都念累了，你还在走。',
    hint: '单局存活 80 回合',
    check: c => (c.turn || 0) >= 80,
  },
  {
    id: 'fullbag', title: '满载而归', icon: '满', tier: 2, cat: '生存',
    desc: '一格都不剩。你连口袋缝里都塞了东西。',
    hint: '背包格数用满',
    check: c => {
      const used = (c.bag || []).reduce((s, i) => {
        const d = ITEMS[i.id];
        return s + (d ? d.size : 1);
      }, 0);
      const slots = BASE_SLOTS + ((c.equip && c.equip.bag && ITEMS[c.equip.bag.id] && ITEMS[c.equip.bag.id].bagBonus) || 0);
      return slots > 0 && used >= slots;
    },
  },
  {
    id: 'allarmor', title: '全副武装', icon: '甲', tier: 3, cat: '生存',
    desc: '六个部位全包住了。刀砍上来只听到一声闷响。',
    hint: '头/身/手/腿/面/脚 六件防具全部装备',
    check: c => wornArmor(c) >= 6,
  },
  {
    id: 'topweapon', title: '神兵利器', icon: '锋', tier: 3, cat: '生存',
    desc: '手里这把东西，是这片油田最不该出现的。',
    hint: '装备一把稀有度 5 的武器',
    check: c => {
      const w = c.equip && c.equip.weapon;
      const d = w && ITEMS[w.id];
      return !!d && d.rarity >= 5;
    },
  },
  {
    id: 'ep_low', title: '油尽灯枯', icon: '竭', tier: 3, cat: '生存',
    desc: '腿在抖，眼前发黑，但你没倒。',
    hint: '精力 ≤5 时依然活着',
    check: c => c.alive !== false && (c.ep || 0) > 0 && (c.ep || 0) <= 5,
  },

  // ================= 剧情 =================
  {
    id: 'hostage1', title: '第一个人', icon: '救', tier: 1, cat: '剧情',
    desc: '你第一次没有丢下她。',
    hint: '带走 1 名女性人质',
    check: c => st(c, 'savedHostages') >= 1,
  },
  {
    id: 'savior', title: '人质救星', icon: '护', tier: 3, cat: '剧情',
    desc: '十个人因为你活了下来。这在这个地方近乎奇迹。',
    hint: '累计解救 10 名女性人质',
    check: c => st(c, 'savedHostages') >= 10,
  },
  {
    id: 'song1', title: '唱给你听', icon: '歌', tier: 2, cat: '剧情',
    desc: '废墟里，还有人愿意为你唱一支歌。',
    hint: '让她给你唱 1 首歌 / 讲 1 个故事',
    check: c => st(c, 'songs') >= 1,
  },
  {
    id: 'ten_perfect', title: '百听不厌', icon: '曲', tier: 4, cat: '剧情',
    desc: '十次了。她的歌你都会跟着哼了。',
    hint: '累计听 10 次歌 / 故事',
    check: c => st(c, 'songs') >= 10,
  },
  {
    id: 'seven1', title: '带他回家', icon: '归', tier: 2, cat: '剧情',
    desc: '你牵着那只手，沿着铁轨一直往东走。',
    hint: '第一次带走七娃',
    check: c => !!(c.flags && c.flags.sevenWaHome) || ((c.career && c.career.sevenWa) || 0) >= 1,
    // 计入本轮排名的条件：必须本轮真的带回家了，不能靠历史次数蹭
    roundCheck: c => !!(c.flags && c.flags.sevenWaHome),
  },
  {
    id: 'seven3', title: '第三次', icon: '三', tier: 3, cat: '剧情',
    desc: '第三次了。你已经知道他会站在哪面墙下面。',
    hint: '累计 3 次带七娃回家（跨轮次）',
    check: c => ((c.career && c.career.sevenWa) || 0) >= 3,
    careerOnly: true,
  },
  {
    id: 'seven5', title: '第五次', icon: '五', tier: 3, cat: '剧情',
    desc: '第五次。广播员大概已经开始记住你了。',
    hint: '累计 5 次带七娃回家（跨轮次）',
    check: c => ((c.career && c.career.sevenWa) || 0) >= 5,
    careerOnly: true,
  },
  {
    id: 'good_dad', title: '好爸爸', icon: '爸', tier: 4, cat: '剧情',
    desc: '十次。你每次都把他带回了家。',
    hint: '累计 10 次带七娃回家（跨轮次）',
    check: c => ((c.career && c.career.sevenWa) || 0) >= 10,
    careerOnly: true,
  },
  {
    id: 'liuying1', title: '红蓝之间', icon: '药', tier: 2, cat: '剧情',
    desc: '你从她手里拿了一颗药丸，然后答了她的问题。',
    hint: '遇到刘颖 1 次',
    check: c => st(c, 'liuying') >= 1,
  },
  {
    id: 'liuying5', title: '她的老朋友', icon: '颖', tier: 3, cat: '剧情',
    desc: '五次。她开始问你今天叫什么名字。',
    hint: '遇到刘颖 5 次',
    check: c => st(c, 'liuying') >= 5,
  },
  {
    id: 'npcall', title: '人脉', icon: '访', tier: 3, cat: '剧情',
    desc: '八个常驻的人，你都跟他们说过话。',
    hint: '和全部 8 个常驻 NPC 交谈过',
    check: c => Object.keys(c.npcTalkTurn || {}).length >= 8,
  },
  {
    id: 'npcfav', title: '老熟人', icon: '熟', tier: 3, cat: '剧情',
    desc: '有人愿意把好东西留给你了。',
    hint: '任意 NPC 好感度达到 10',
    check: c => Object.values(c.npcFavor || {}).some(v => (v || 0) >= 10),
  },

  // ================= 神秘 =================
  {
    id: 'drunk1', title: '一杯倒', icon: '醉', tier: 2, cat: '神秘',
    desc: '半瓶二锅头下去，世界开始晃。',
    hint: '进入醉酒状态 1 次',
    check: c => st(c, 'drunk') >= 1,
  },
  {
    id: 'drunk5', title: '酒鬼', icon: '酒', tier: 3, cat: '神秘',
    desc: '五次。你已经能在晃的时候瞄准了。',
    hint: '进入醉酒状态 5 次',
    check: c => st(c, 'drunk') >= 5,
  },
  {
    id: 'poison', title: '剧毒之身', icon: '毒', tier: 2, cat: '神秘',
    desc: '你吃了那朵长得很漂亮的蘑菇。',
    hint: '进入中毒状态',
    check: c => !!(c.status && c.status.type === 'poisoned'),
  },
  {
    id: 'frozen', title: '冻成冰', icon: '冻', tier: 2, cat: '神秘',
    desc: '把液氮泼在自己腿上，是个很坏的主意。',
    hint: '进入冻结状态',
    check: c => !!(c.status && c.status.type === 'frozen'),
  },
  {
    id: 'clearmind', title: '清醒', icon: '醒', tier: 2, cat: '神秘',
    desc: '一杯黑咖啡，脑子像被擦干净了。',
    hint: '进入清醒状态',
    check: c => !!(c.status && c.status.type === 'clear'),
  },
  {
    id: 'lucky', title: '锦鲤', icon: '运', tier: 3, cat: '神秘',
    desc: '运气好到不正常。地雷都绕着你走。',
    hint: '幸运达到 50',
    check: c => {
      const base = (c.attrs && c.attrs.luk) || 0;
      const buff = (c.buffs && c.buffs.luk) || 0;
      return base + buff >= 50;
    },
  },
  {
    id: 'allstatus', title: '五毒俱全', icon: '杂', tier: 4, cat: '神秘',
    desc: '醉过、毒过、冻过、清醒过。你还是活着。',
    hint: '解锁醉酒/中毒/冻结/清醒四个状态称号',
    check: c => {
      const a = c.achievements || {};
      return !!(a.drunk1 && a.poison && a.frozen && a.clearmind);
    },
  },

  // ================= 特色 =================
  {
    id: 'collector', title: '拾荒之王', icon: '藏', tier: 2, cat: '特色',
    desc: '别人看到的是废墟，你看到的是货架。',
    hint: '背包里同时有 20 种不同物品',
    check: c => new Set((c.bag || []).map(i => i.id)).size >= 20,
  },
  {
    id: 'gunsmith', title: '军火商', icon: '枪', tier: 2, cat: '特色',
    desc: '你背着的火力，够打一场小型遭遇战。',
    hint: '同时携带 5 把火器',
    check: c => (c.bag || []).filter(i => {
      const d = ITEMS[i.id];
      return d && d.type === 'weapon' && d.noise >= 8;
    }).length >= 5,
  },
  {
    id: 'alchemist', title: '炼金术士', icon: '炼', tier: 2, cat: '特色',
    desc: '给你一堆破烂，你能还一件武器。',
    hint: '合成成功 20 次',
    check: c => st(c, 'crafts') >= 20,
  },
  {
    id: 'jack', title: '全能选手', icon: '杂', tier: 3, cat: '特色',
    desc: '造过、买过、卖过、换过。这片废墟的每种活法你都试了。',
    hint: '合成、购买、出售、交易各至少 1 次',
    check: c => st(c, 'crafts') >= 1 && st(c, 'bought') >= 1 && st(c, 'sold') >= 1 && st(c, 'trades') >= 1,
  },
  {
    id: 'trade10', title: '交易达人', icon: '易', tier: 3, cat: '特色',
    desc: '十次交易。你连对方包里有什么都猜得到。',
    hint: '完成 10 次玩家交易',
    check: c => st(c, 'trades') >= 10,
  },
  {
    id: 'pacifist', title: '和平主义者', icon: '和', tier: 4, cat: '特色',
    desc: '三十个回合，一个人都没杀。这比杀三十个人难。',
    hint: '存活 30 回合且击杀为 0',
    check: c => st(c, 'kills') === 0 && (c.turn || 0) >= 30,
  },
];

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

module.exports = { ACHIEVEMENTS, BY_ID, CAT_ORDER };
