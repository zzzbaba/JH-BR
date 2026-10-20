// 江汉BR —— 最终 BOSS
// 位置：广华寺（z00），地图最远的角落
// 击杀后整轮游戏立即判定胜利

const FINAL_BOSS = {
  id: 'boss_broadcaster',
  name: '广播员',
  zone: 'z00',
  tier: 6,
  hp: 420,
  atk: 34,
  def: 25,
  dodge: 10,
  kind: 'armed',
  flee: 0,
  desc: '钟楼顶上站着一个人，穿着干净的白衬衫。他手里握着一支话筒，从第一个编号念到最后一个，中间没有停顿。',
  taunt: [
    '他停下来，低头看你："第 37 号。你来得比我想的早。"',
    '"规则很简单。"他说，"最后活着的那个人，可以离开。"',
    '"你看，我从来不骗人。"他把话筒别回腰上，抽出了枪。',
  ],
  intro: '钟楼的铁门在你身后合上。楼梯很窄，一共 72 级。走到顶的时候，风很大。',
};

// BOSS 掉落（击杀即胜利，这些是纪念品）
const BOSS_LOOT = [
  ['w35', 1],        // 40 火箭筒
  ['med03', 3],      // 急救包
  ['vit_sta', 1],
  ['vit_str', 1],
  ['sp_policekey', 1],
];

module.exports = { FINAL_BOSS, BOSS_LOOT };
