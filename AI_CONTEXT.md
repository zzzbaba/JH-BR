# 江汉BR · AI 开发上下文

> **这份文件是给 AI 看的事实清单，不是设计文档。**
> 里面的函数名、字段名、公式、文件行数都是从当前代码里核对过的。
> 改代码前先读完 §2 硬约束和 §7 修改菜谱，不要凭印象猜。
>
> 📖 **想知道「为什么现在是这样」→ 读 [`DEVLOG.md`](./DEVLOG.md)**（15+ 轮迭代的完整复盘、设计决策理由、踩坑记录）。
>
> 最后核对：2026-10-19（第 18 轮）· 代码总量约 10200 行

---

## 直接可用的开场提示词

把下面这段连同本文件一起给 AI：

```
你在维护一个已经能跑的项目：江汉BR（项目根目录）。
先读项目根目录的 AI_CONTEXT.md，那是事实清单，里面的函数名和公式都是核对过的。
读完先复述：项目由哪几个文件组成、角色对象有哪些字段、战斗伤害怎么算。
复述正确后再动手。改动前告诉我你要改哪个文件的哪个函数。测试脚本已移除，改完至少自己起服务点一遍主流程，见 §11。
不要引入任何 npm 依赖，不要用框架，不要改数据存储方式。
```

---

## 1. 项目定位

**游戏名：江汉BR**（全站统一，不要再叫"江汉油田 BR"；但地名"江汉石油管理局"、剧情里的"油田"是背景设定，保留）。

复刻《大逃杀》（Battle Royale）设定的**网页多人文字生存游戏**，舞台是江汉油田。

- 8×8 = 64 个区块的地图，四个片区（广华 20 / 向阳 20 / 五七 20 / 十号地 4）
- 一轮 30 分钟（最迟 45 分钟），多账号同服
- 三种胜利/结束方式：击杀最终 BOSS、带走七娃、全员出局
- **视觉**：黑底 + 暗红（不是大红，是 #c8453a 这种带灰的质感红），像素风
- 像素风 Canvas 地图 + 弹窗式交互 + 程序化像素立绘

**不是**：不是动作游戏，没有实时战斗，没有 3D，不是单机离线游戏。

---

## 2. 硬约束（违反会破坏整个项目）

1. **零依赖**。只用 Node 内置模块（`http` `fs` `path` `crypto`）。不许 `require('express')`、不许 `npm install`、不许 ws 库。
2. **前端无框架无构建**。原生 JS + Canvas，`<script src="app.js">` 直接引。不许 React/Vue/TS/打包器。
3. **存储只用 JSON 文件**。不许数据库。目录 `store/`。
4. **数值必须走配置**。凡是可调数值，从 `W.settings()` 读，不许在逻辑里写死新常量。
5. **中文面向玩家，英文面向代码**。变量名/函数名英文，注释和文案中文。
6. **改完必须跑测试**（§11 五套），全绿才算完成。
7. **`store/` 不是缓存**，不要删。里面是账号、存档、世界状态。

---

## 3. 文件地图

| 文件 | 行数 | 职责 | 什么时候改它 |
|---|---|---|---|
| `server.js` | 2284 | HTTP 服务、**27 个后台接口**、账号、轮次结算、GM 命令、**假人 AI**、**输入净化/聊天冷却**、运行日志/内存采样 | 加接口、改鉴权、改 GM、改假人 |
| `game.js` | 2516 | **全部游戏逻辑**（移动/事件/战斗/状态/合成/强化/商店/人质/特殊角色/成就/金币/PVP/**黑市/雇佣兵/战报**) | 几乎所有的玩法改动 |
| `world.js` | 340 | 轮次状态机（45/60 分钟）、**自动开轮**、聊天存储、全局设置、历史榜单、**黑市刷新**、日志钩子 | 改轮次规则、加设置项 |
| `trade.js` | 67 | 玩家交易（内存态，重启清空） | 改交易规则 |
| `storage-queue.js` | 118 | **串行存储队列**：合并快照、临时文件+fsync+原子 rename、按版本确认、失败重试、`status()` 健康上报 | **一般不用改**，改落盘策略才碰 |
| `data/map.js` | 131 | 64 区块、片区、危险度生成、邻居计算 | 改地图 |
| `data/items.js` | 324 | **137 件物品**：武器22（火器 11） / 防具29 / 背包5 / 材料18 / 药物26 / 对敌6 / 弹药12 / 暗器9 / 配件6 / 特殊4；含 `FIRE_MODES` 射击模式表 + `REMOVED_WEAPONS` | 加物品 |
| `data/recipes.js` | 118 | **80 条合成配方**（医疗7/弹药12/武器21/防具20/背包5/暗器8/配件7） | 加配方 |
| `data/enemies.js` | 77 | 20 种敌人 + 5 档掉落表 | 加敌人/调掉落 |
| `data/events.js` | 201 | 8 个剧情 NPC、环境描写、地雷/宝箱文本 | 加剧情 |
| `data/weather.js` | 57 | **6 种天气**：晴/阴/大风/暴雨/大雾/沙尘，影响攻击命中精力遭遇 | 加天气 |
| `data/status.js` | 73 | 5 种状态定义 + 道具映射 | 改状态效果 |
| `data/npcs.js` | 254 | **8 个常驻 NPC** + **黑市 `BLACK_MARKET`**（随机区块/三倍价/8 分钟）+ **佣兵头子 `MERC_CAMP`**（固定 z22/三档雇佣） | 加 NPC、调黑市价目 |
| `data/special.js` | 56 | 七娃、刘颖、12 道 ABC 题 | 改特殊角色 |
| `data/achievements.js` | 383 | **53 个称号**（6 分类）+ 判定函数 + CAT_ORDER | 加称号 |
| `data/shop.js` | 69 | 24 种商品 + 18 个商人分布 | 改商店 |
| `data/boss.js` | 34 | 最终 BOSS「广播员」+ 掉落 | 改 BOSS |
| `public/pixel.js` | 1038 | **像素美术**：物品图标（24×24）+ 人物（24×32），全程序化绘制 | 改美术 |
| `public/index.html` | 224 | 游戏页骨架 | 加界面元素 |
| `public/app.js` | 3808 | **全部前端逻辑**（渲染/弹窗/地图绘制/**地图标记**/聊天/**右栏两卡**/悬浮提示/天气/特效） | 几乎所有的界面改动 |
| `public/style.css` | 1939 | 全部样式（暗色废土 + 像素硬边框 + 血量三档/受击/状态/天气特效 + 强化/勾选） | 改视觉 |
| `public/admin.html` | 1277 | 后台（单文件，内嵌 CSS+JS，含单轮控制页、**日志页**） | 改后台 |

**测试脚本已从工作目录删除**（2026-10-23 瘦身，见 §11）。九套测试在 git 历史里，需要时 `git checkout` 恢复。

**`shots/` 和 `dev/legacy/` 也删了** —— 197 张历史截图 + 31 个一次性 UI 验证脚本（硬编码 Windows Chrome 路径，
界面改版后本来也跑不起来）。要写新的验证脚本，用 `playwright-core` + 本机 Chrome，见 §11。

**项目根目录现在只有运行和部署必需的东西**：5 个核心 js + `data/` + `public/` + 6 个部署文件 + 7 个 MD。
打包产物 30 个文件 / 236 KB。

---

## 4. 数据模型

### 4.1 角色对象 `char`（存在 `store/saves/<md5前16位>.json` 的 `.char`）

```js
{
  name: '老陈',                      // 角色名，最长 12 字
  attrs: { sta, str, cha, int, luk },// 五维基础值，初始 8-18，上限 100
  buffs: {},                         // 本局永久临时增益 { sta: 5 }（不清理）
  tempBuffs: {},                     // 限时增益 { sta: { v: 10, until: 时间戳 } }（刘颖药丸用）
  hp, ep,                            // 当前生命/精力
  gold: 100,                         // 金币
  invincible: false,                 // GM 无敌
  status: { type: 'normal', until: 0 },  // 状态，type ∈ normal|drunk|clear|poisoned|frozen
  frozenUntil: 0,                    // 冷冻麻痹的禁止移动截止时间
  career: { sevenWa: 0 },            // 跨轮次累计（从 users.json 继承）
  equip: {
    weapon: { id, dur, mods: { sight, muzzle, grip } },   // 武器是实例，带耐久和改装槽
    head, body, hands, legs, face, feet, bag,              // 其余部位是 { id } 或 null
  },
  bag: [ { id: 'med01', n: 3 }, ... ],   // 背包，同 id 堆叠（背包里的武器不记耐久）
  pos: 'z33',                        // 当前区块 id（z + y + x）
  turn: 0,                           // 回合数
  // ---- 第 44/45 轮新增 ----
  merc: null,                        // 雇佣兵 { tier, name, atk, hp, maxHp }，只帮一场，打完清空
  keyLog: [],                        // 战报关键事件 [{ kind, turn, text }]，kind ∈ firstkill|firstgun|noise|death
  //                                 和 c.log 分开：log 是 120 条流水会被冲掉，keyLog 只留能写进战报的
  bot: false,                        // 假人标记（不进 users.json，只有存档）
  level: 1, exp: 0,                  // 等级 1-30，经验
  kills: 0,                          // 旧字段，等于 stats.kills（保留兼容）
  alive: true,
  flags: { mapUnlocked, bossDefeated, sevenWaHome, sevenWaCooldown, liuyingUntil, settled },
  achievements: { first_blood: 时间戳, ... },
  stats: { kills, crafts, savedHostages, songs, trades, bossKills, bought, sold, goldEarned, moves, crits, fistKills, drunk, liuying },
  hostages: [ { name: '林知夏', at: 时间戳, mood: 'happy|normal|sad', moodUntil, babies } ],   // 跟随的女性人质
  npcFavor: { npc_han: 3 },          // 各常驻 NPC 的好感度
  npcTalkTurn: { npc_han: 12 },      // 上次交谈的回合，用于算冷却
  npcRewarded: { npc_han: [2, 4] },  // 已领取过的好感奖励阈值
  roundId: 3,                        // 属于哪一轮，跨轮作废
  log: [ { t, text, kind } ],        // 最近 120 条
  scene: 'map',                      // 见 §5
  pending: null,                     // 当前场景的临时数据
}
```

### 4.2.5 世界对象新增字段（`store/world.json`）

```js
market: null,        // 黑市 { zone, until }；null = 没开。由 world.tick 随机刷，8 分钟，收摊隔 6 分钟再刷
nextMarketAt: 0,     // 下一次允许开市的时间戳
```

黑市商品和价目在 `data/npcs.js` 的 `BLACK_MARKET.goods`（`[id, 基础价]`），
实际售价 = 基础价 × `markup(3)`，由 `NPCD.marketGoods()` 算。
佣兵三档在 `MERC_CAMP.hire`，位置固定在 `MERC_CAMP.zone = 'z22'`。

### 4.2 世界对象 `world`（`store/world.json`）

```js
{
  round: {
    id, state,                       // state ∈ idle|running|ended
    startedAt, endsAt, hardEndsAt,   // endsAt = +30min, hardEndsAt = +45min
    extended,                        // 是否已延长到 45 分钟
    winner, endReason, bossKilled,
  },
  settings: {
    lootRate, goldRate, bossHp, bossAtk, autoStart,
    moveCost, exploreCost, encounterMul, mineMul, shopMul,
    startGold, statusMs, bossEnabled, sevenWaChance,
  },
  chat: [ { id, ch, from, to, text, zone, kind, at } ],   // 最多 400 条
  nextChatId, history: [ { roundId, endedAt, reason, winner, top } ],
}
```

**`settings` 是唯一合法的调参入口**，后台「数值」页写的就是它。

### 4.3 账号 `store/users.json`

```js
{ users: { 用户名: { salt, hash, created, isGM, career: { sevenWa } } } }
```

密码：`crypto.scryptSync(password, salt, 32).toString('hex')`，salt 16 字节 hex。

---

## 5. 场景状态机

`char.scene` 决定前端弹什么窗。**这是整个游戏的中枢。**

| scene | 含义 | 可用 action | 前端渲染函数 |
|---|---|---|---|
| `map` | 地图上，可移动/探索 | move, explore, rest, shop_buy, shop_sell, craft, equip, unequip, use, drop | 地图 Canvas |
| `encounter` | 遭遇，等待选择 | encounter（fight/spare/item） | `renderEncounter()` |
| `battle` | 战斗中 | battle（attack/item/swap/defend/flee） | `renderBattle()` |
| `loot` | 战利品 | loot, close | `renderLoot()` |
| `box` | 开箱 | box, close | `renderBox()` |
| `hostage` | 人质去留 | hostage（ask/leave） | `renderHostage()` |
| `hostage_result` | 她的回答（表情反馈） | hostage_done | `renderHostageResult()` |
| `npc` | 常驻 NPC 对话面板 | npc（talk/buy/repair/leave） | `renderNpc()` |
| `sevenwa` | 遇到七娃 | sevenwa（talk/ignore） | `renderSevenWa()` |
| `liuying` | 刘颖（三阶段） | liuying | `renderLiuying()` |
| `sevenwin` | 带走七娃的胜利画面 | — | `renderSevenWin()` |
| `dead` | 出局 | — | `renderDead()` |
| `settled` | 已结算（点了胜利画面的「结算」） | — | 无；`/api/state` 返回 `hasSave:false, settled:true`，前端进等待区 |
| `roundOver` | 本轮已结束（时间到/BOSS/七娃/全员出局/管理员） | — | `hasSave:false`，前端立刻切「本轮结束」 |

⚠️ **`settle` 是唯一能在「本轮已结束」后调用的 action**：七娃成功的那一刻 `endRound('sevenwa')` 就执行了，
`/api/action` 开头那两个「对局已结束」的拦截必须给它开白名单，否则结算永远失败。

**规则**：
- `map` 以外的场景会挡住地图操作，前端 `renderZone()` 里 `const busy = S.scene !== 'map'`。
- 加新场景必须同时改三处：`game.js` 的 `act()` 分发、`public/app.js` 的 `renderModal()`、以及写对应的 `renderXxx()`。
- `pending` 是场景私有数据，切场景时会被覆盖，**跨场景要传的数据必须显式复制**（参考 `startBattle` 里保留 `hostage`/`npc`/`boss`）。

---

## 6. 数值公式（精确，全部已核对）

### 属性

```
effAttr(k) = clamp(attrs[k] + buffs[k] + tempBuffs[k](未过期), 1, 100)
```

**上限规则**：任一项到 100 后，其他项永久不能提升（`gainAttr` 里检查，返回提示语）。

### 生命 / 精力

```
hpMax = floor(55 + 体力 × 1.8)
epMax = 100（固定）
```

### 战斗

```
玩家命中 = clamp(82 + 幸运×0.12 + 12(带瞄准镜) - 敌人闪避 + 状态命中加成, 15, 98)
玩家伤害 = 武器伤害 × (1 + 武力/150) × rand(0.85,1.15) × 状态攻击系数 × 100/(100 + 敌防×2.5)
暴击率   = 8 + 幸运×0.25（百分比），暴击伤害 ×1.8
敌人命中 = clamp(70 - 玩家幸运×0.15 - 20(烟雾中), 20, 90)
敌人伤害 = 敌人攻击 × rand(0.85,1.15) × 100/(100 + 玩家防御×2.5)
玩家防御 = (六件防具防御和 + 10(带防弹插板)) × 状态防御系数
```

**防御是递减式减伤，不是直接相减。** 历史上写成相减导致高防敌人完全免疫匕首，别改回去。

### 武器耐久与改装

```
最大耐久：火箭筒 3 / 冷兵器 70 / 狙击 80 / 手枪步枪冲锋枪霰弹 100 / 机枪 150
每次攻击消耗：冷兵器 1 / 普通枪械 2 / 机枪 3（不管中没中都磨损）
耐久归零 → 武器报废，攻击自动改徒手（不会卡死）
修理：修理包 +40（配方 = 废铁+机油+胶带），或找「修车的老韩」花 40 块修满
```

改装槽（只有火器 `moddable: noise >= 8` 才有）：

| 槽位 | 配件 | 效果 |
|---|---|---|
| `sight` 瞄具 | 瞄准镜 `buff_scope` | 命中 +12 |
| `muzzle` 枪口 | 消音器 `buff_silencer` | 噪音 -6 |
| `grip` 握把 | 战术握把 `buff_grip` | 伤害 +8% |

配件从背包消耗，装进 `equip.weapon.mods`。换武器或卸下时配件**自动拆回背包**，不会丢。

⚠️ **改装加成要在两处同时生效**：`playerAttack`（实际战斗）和 `snapshot`（界面显示）。漏掉后者会导致"界面显示 84% 命中，实际算 96%"——这个 bug 出现过一次。

### 天气影响

```
大风：攻击 ×0.9，命中 -8，噪音 +1
暴雨：移动精力 ×1.4，命中 -5，噪音 -3（雨声掩盖）
大雾：命中 -15，遭遇率 ×0.7
沙尘：攻击 ×0.95，命中 -10，移动精力 ×1.2
晴/阴：无影响
```

天气全局生效，每 7-10 分钟自动切换并广播。**改天气影响时三处要同步**：`playerAttack`（实际战斗）、`rollEvent`（遭遇率）、`snapshot`（界面显示）。

### 等级与经验

```
升级需求 = 40 + (等级-1) × 18      // Lv1→2: 40，Lv29→30: 544
击杀经验：tier1 15 / tier2 30 / tier3 50 / tier4 75 / tier5 110 / BOSS 500
每升 1 级：五维各 +2%（至少 +1，四舍五入），并回复 15 血、10 精力
上限 30 级，到顶后经验清零不再增长
```

**升级遵守"满百锁死"规则**：某项已 100 时不再提升；某项到 100 后其他项也停止提升（和 `gainAttr` 一致）。

### 各种成功率

```
放我一马 = clamp(35 + 魅力×0.65 - 敌人tier×3, 8, 100)     魅力100 → 100%
人质带走 = clamp(30 + 魅力×0.55 + 幸运×0.15, 5, 95)
逃跑     = clamp(45 + 幸运×0.45 - tier×3 + 30(烟雾), 10, 95)；BOSS 战固定 8%
合成     = clamp(30 + 智力×0.7 - 配方难度×8, 5, 100)；智力 ≥ 100 时必成
```

**合成的空间前置条件**：扣完材料后必须 `canFit(c, 成品id, 成品数量)` 才能继续。
放不下就把材料原样还回去、返回 `ok:false`，**绝不能出现「材料没了、成品也没了」**。
`canFit` 的规则要和 `addItem` 完全一致（现有堆叠空位 + `floor(空格/成品size) × stack`），
前端 `bagCanFit()` 是它的镜像，区别是前端会**先模拟扣掉材料**再算空间 —— 因为材料正好用完会腾出格子，
不模拟就会把「其实能合」误判成背包满。

### 事件权重（`rollEvent`，总和归一化后随机）

```
战斗   = (18 + 危险度×4 - 幸运×0.1) × encounterMul
人质   = 7
七娃   = 3（冷却期内为 0）
刘颖   = 4（药效期内为 0）
宝箱   = 10（探索时 22）
地雷   = max(0, 4 + 危险度 - 幸运×0.05)
剧情   = 12（探索时 -4）
无事   = 25
探索时额外：战斗 +6，人质 +3，七娃 +1，刘颖 +1
```

### 消耗

```
移动 -moveCost(默认4) 精力      探索 -exploreCost(默认3) 精力
战斗每回合 -2 精力              防御 -1 精力
休息 +10~18 精力，且有 18+danger×3 % 概率遭遇
中毒状态：每次移动/探索，当前血量和精力各 ×0.8（掉 20%）
```

**精力见底 ≠ 死亡**（2026-10-19 改）：
- 唯一的死法只有 `hp <= 0`（`checkDeath` 里不再判 ep）
- 精力不够时：移动/探索直接拒绝并提示「先原地休息」；战斗里不能「攻击」，但「防御 / 逃跑 / 用道具」照常
- 所有 `c.ep -=` 都钳到 0，不会出现负数

### 药物回复（名义值 ≠ 实得值）

```
实得 = clamp(当前 + 名义值, 0, 上限) - 当前      // 名义值 = items.js 的 hp / ep
纯回血药在满血时 → 不消耗，直接返回「生命已经满了」
纯回精药满精力、纯解毒药没中状态 → 同样不消耗
buff 类（止痛药/蛋白粉/类固醇/…）写进 c.buffs，**本局有效、不限时**，文案不许写「临时」
perm 类（vit_*）走 gainAttr，受「满百锁死」限制
```

### 剧情 NPC（`data/events.js` 的 `NPC_EVENTS`）

```
交涉成功率 = clamp(35 + 魅力×0.65 - 敌人tier×3, 8, 100)
成功 → 打印 talkOk → 发 reward.items / reward.attr
失败 → 打印 talkFail → 直接进战斗（敌人用 foeName/foeDesc）

trade: true 的 NPC（目前只有「摆摊的人」）：
  成功后会真的从背包拿走 1 件 —— takeOneForTrade() 只挑稀有度最低的，
  跳过 special（地图/钥匙）和 modSlot（配件），日志顺序必须是「失去 X」→「获得 Y」
```

### 人质心情与挑逗（2026-10-20 改，原来的「受孕」已移除）

```
心情三档：happy 开心 / normal 一般 / sad 不开心
tickHostageMood(c)：过期就重摇（开心 32% / 一般 46% / 不开心 22%），持续 90-240 秒
只在 act() 和 snapshot() 里调，保证前端看到的和下一次行动一致

挑逗（action: tease, { index }）：
  条件：scene 必须是 map，且该人质 mood === 'happy'
  成功率 20% → stats.songs++、hostage.songs++、心情刷新
    成功文案二选一：给你唱首歌 / 给你讲个故事（各 50%）
  失败 → 心情降到 normal，重新计时
休息时的夜间事件也要求至少有一个 happy 的人质，触发时唱歌一次

⚠️ 原来叫「受孕 / 生孩子」，2026-10-20 按用户要求整块换成「挑逗 / 唱歌或讲故事」，
字段 children → songs、hostage.babies → hostage.songs、动作 impregnate → tease。
改的时候要同步 5 处：game.js（逻辑+统计+排名权重）、data/achievements.js（两个成就）、
public/app.js（按钮+文案+公式）、public/admin.html（详情行）、server.js（CSV 导出列）。
```

### 合成系统（2026-10-19 大重构，90 条配方）

**核心原则：全部「小 → 大」，玩家一眼能看懂升级路线，不再有碎片化材料。**

```
医疗（血）：绷带 → 止血带(绷带×2) → 急救包(止血带×2 + 草药, reqInt 35)
医疗（精）：速溶咖啡 → 能量饮料(咖啡×2)
弹药：钢珠/箭矢/弩矢/762p/38/9mm/12ga/762r/58r/556/信号弹/电池组/火箭弹 —— 13 种全部可造
武器：匕首 → 棒球棍 → 铁锤 → 砍刀 → 长矛 → 消防斧 → … → 火箭筒(reqLv 18)
防具：初级 6 / 中级 5 / 高级 6 / 传说 2(reqLv 10) / 史诗 1(reqLv 15)
背包：布袋 → 帆布包 → 登山包 → 军用背包 → 战术背囊
```

**材料从 30 种砍到 18 种**（布条/木板/铁钉/胶带/空瓶/火药/电池/铜线/弹簧/钢管/绳子/废铁/皮革/玻璃片/螺丝/医用酒精/草药/木炭）。前中后期都有用，不再有「捡到一辈子用不上」的垃圾。

**已删除的 4 把低级武器**（木棍/钢管/铁锹/扳手）写在 `REMOVED_WEAPONS` 里，加载时跳过但保留 id —— 老存档里还引用着这些 id，硬删会让存档崩。

**等级/智力门槛**：高级以上防具和后期武器带 `reqLv`，急救包带 `reqInt`。合成按钮 `can = 智力够 && 材料够`，不够时 `disabled` + 文案变「材料不足 / 智力不足」。

### 性能（2026-10-19 优化，699ms → 13ms）

```
问题：每次 /api/action 都 readdir + 读全部 617 个存档，还跑完整 snapshot
     其中 614 个是历史轮次遗留，根本不该被读

修法：
1. c._nearby 只在 move / explore 时算（战斗、开箱、商店不需要邻居）
2. listSavesCached() 1.5 秒缓存，避免同一次操作里重复 readdir
3. 算邻居用轻量属性（只读需要的字段），不再调完整 snapshot()
4. 清理旧轮存档：617 → 5
5. serveStatic 加 Cache-Control: no-cache, must-revalidate（改完立刻生效，不用手动清缓存）
```

### 强化系统（2026-10-19 新增）

```
同种装备两件合一件：+0 → +1 → +2 → +3（MAX_PLUS = 3）
属性倍率：1 + plus × 0.1   即 +10% / +20% / +30%

doEnhance(c, { itemId, plus })
  1. findCopies(c, id, plus) 收集「装备位 + 背包」里同 id 同强化等级的实例
  2. 少于 2 件 → 拒绝，提示还差几件
  3. 装备中的那件优先当底（保住耐久和已装改装件）
  4. 另一件移除，底件 plus+1

数据落在 entry.plus 上：
  装备位  c.equip.weapon = { id, dur, mods, plus }
           c.equip[slot]  = { id, plus }
  背包    c.bag[i] = { id, n:1, plus }

⚠️ 强化等级只存在于「实例」上，不能走 addItem（那个只认 id）。
   往背包塞装备要用 addEntry(c, entry)，它会带上 plus。
   换装 / 卸下 / 强化 / 丢弃 全部改成走 addEntry 或按 plus 精确匹配，
   否则 +3 会退化成 +0。
```

**读取点只有三处，别再散落**：`playerDef` 用 `entryDef`，`playerAttack` 用 `entryDmg`，`snapshot` 也用这两个。

### 火器射击模式（2026-10-19 新增，回答「自动和半自动差在哪」）

| 模式 | 每击发数 | 单发 | 总伤 | 命中 | 噪音 | 磨损 | 定位 |
|---|---|---|---|---|---|---|---|
| 单发 single | 1 | 100% | 1.00 | +4 | 0 | ×1 | 火箭筒、信号枪 |
| 半自动 semi | 1 | 100% | 1.00 | **+8** | **-1** | ×1 | 打得准、省弹、打得久 |
| 点射 burst | 2 | 62% | 1.24 | -4 | 0 | ×1.5 | 折中 |
| 全自动 auto | 3 | 45% | **1.35** | **-12** | **+2** | ×2 | 总伤高，但吃弹快、容易打偏、声音大 |
| 压制 mg | 4 | 36% | **1.44** | **-16** | **+3** | ×2.5 | 弹药黑洞，靠弹匣大撑 |

**火器只留 11 把，一个类别一个场景一把**（2026-10-20 精简）：

| 类别 | 枪 | 弹药 | 模式 |
|---|---|---|---|
| 手枪（警用） | 92式手枪 | 9mm | 半自动 |
| 手枪（老式） | 54式手枪 | 7.62mm 手枪弹 | 半自动 |
| 手枪（民间） | 左轮手枪 | .38 | 半自动 |
| 猎枪（民间） | 双管猎枪 | 12号霰弹 | 半自动 |
| 冲锋枪（警用） | 79式冲锋枪 | 7.62mm 手枪弹 | 点射 |
| 突击步枪（军用） | 95式自动步枪 | 5.8mm | 全自动 |
| 半自动步枪（民兵） | 56式半自动步枪 | 7.62mm 步枪弹 | 半自动 |
| 狙击（军用） | 88式狙击步枪 | 5.8mm | 半自动 |
| 机枪（军用） | 95式班用机枪 | 5.8mm | 压制 |
| 重火力 | 40 火箭筒 | 火箭弹 | 单发 |
| 信号 | 信号枪 | 信号弹 | 单发 |

**删掉的 9 把**（`REMOVED_WEAPONS` 跳过但保留数组位置，id 不能变）：
64式手枪、泵动霰弹枪、半自动霰弹枪、56式冲锋枪、81式自动步枪、AK-47、M16A1、85式狙击步枪、67式通用机枪。
**AK-47 / M16A1 是国内根本不可能出现的东西，删得最应该。**

⚠️ **删枪必须连弹药一起删**。M16A1 是 `ammo_556` 的唯一使用者，删枪不删弹就会出现「永远用不上」的孤儿子弹。
现在弹药 12 种，每种都有枪用（`test.js` 有孤儿检查）。

**所以选枪不再只看伤害数字**：全自动总伤最高，但一次打 3 发、弹匣两回合就见底，命中还低 20 个点；
半自动一发一发点，命中高、省弹、安静。`playerAttack` 里逐发掷命中，日志会写「3 发中 2 发，合计 X 点伤害」。

### 对敌道具（2026-10-19 新增）

```
type: 'hostile'，字段 foe: { freeze, blindPen, atkMul, dotPct, turns }
  液氮罐 h01  全程无法行动 2 回合
  石灰粉 h02  命中 -35，2 回合
  辣椒喷雾 h03 命中 -25，1 回合
  强效镇静剂 h04 攻击 -45%，3 回合
  毒瓶 h05    每回合掉 9% 最大血，3 回合
  （med19 老 id 保留，已改成 hostile，别让老存档的东西消失）

战斗中用：doBattle 的 choice:'item' → useOne 的 hostile 分支 → applyFoeDebuff
地图上埋设：doTrap(c, { itemId }) → c.trap = { itemId, zone }
           下一次在这个区块 startEncounter，对方开局就带着这个状态（trap 用掉即清）

结算在 enemyTurn 开头：先扣持续伤害 → 再看 freeze 是否跳过 → 否则按 blindPen/atkMul 出手。
对敌道具的 dot 可能把对方耗死，所以 doBattle 里统一走 runEnemyTurn(c)，
它会检查 e.hp <= 0 并调 finishBattle。
```

### 道具「能不能使用」必须按能力判断，不要写 id 白名单（2026-10-20 修）

`game.js` 的 `useOne()` 支持这些分支：`type==='med'`、`type==='hostile'`、
`type==='throwable'`、**带 `d.repair` 字段**、`id==='sp_map'`、`id==='sp_radio'`。

前端 `public/app.js` 必须用 `isUsableItem(d, id)` 判断，**不要再用
`d.type==='med' || d.type==='throwable' || ... || id==='sp_map'` 这种硬编码列表**。
以前的教训：加了修理包（`sp_repairkit`，`type:'special'` + `repair:40`），
后端支持、前端白名单没加 → 背包里没有「使用」按钮，道具完全用不了。

同一套判断要同时用在两处：
- `showItemDetail()`：背包详情区的按钮
- `openItemPicker()`：战斗中的道具面板

审计脚本（以后加新道具可以再跑一遍）：

```bash
node -e "const D=require('./data/items');for(const [k,v] of Object.entries(D.ITEMS))if(v&&v.repair)console.log(k,v.name,v.type)"
```

**修理包现状**：`sp_repairkit`，`repair:40`，给当前武器 +40 耐久（上限封顶）。
来源：合成（废铁+弹簧+胶带，智力 7）／找修车的老韩买 55 块／老韩好感 2 赠送。
另有一条更划算的路：老韩的 `repair` 服务花 40 块直接修满。防具没有耐久系统。

### 排名评分（2026-10-20 重做，`game.js` 的 `scoreOf`）

**原则**：大逃杀「名次/成长为主，击杀为辅」，同时给新手一条非战斗的得分路。

```
排名 = 存活分 + 等级×8 + 本轮称号×10 + 击杀×5 + 探索×0.4 + 合成×3 + 金币÷50 + 存活奖励30
存活分 = 回合数 × 0.8（上限 50）
额外：击杀 BOSS +150 · 本轮带七娃回家 +400 · 每首歌 +5 · 每个人质 +6
```

| 字段 | 权重 | 说明 |
|---|---|---|
| `turn` | 0.8，上限 50 | 存活时间。**必须封顶**，否则挂机躲着就能刷 |
| `level` | 8 | 本轮成长 |
| `title` | 10 | **只算本轮拿到的**（见下） |
| `kill` | 5 | 从 10 降下来，不再是绝对主项 |
| `moves` | 0.4 | 探索。新手打不过老兵，但探索做得到，且必须动起来才有 |
| `craft` | 3 | 合成。同上，`stats.crafts` 以前从没累加过，本轮一起修了 |
| `gold` | 0.02 | 50 块 = 1 分 |
| `alive` | 30 | 活到最后 |

**关键：`c.roundTitles` 而不是 `c.achievements`。**
`newgame` 时会调 `syncCareerAchievements()`，把跨轮里程碑（七娃 3/5/10 次）
直接写进 `c.achievements`。用 `achievements` 算分等于老兵开局白拿 30 分，新手永远追不上。
所以：
- `createChar` 初始化 `roundTitles: {}`
- `checkAchievements()` 在发放时写入 `roundTitles`，但**跳过 `careerOnly` 的成就**
- 成就定义里 `careerOnly: true` 表示纯跨轮里程碑（seven3/seven5/good_dad）
- `roundCheck` 用来覆盖"本轮是否真做到"的判断（seven1 必须本轮真的带回家才算）
- `migrateChar()` 给老存档补 `roundTitles`（已有的非 careerOnly 称号）

实测三种玩家：老兵杀神 347 / 新手探索 149 / 新手谨慎 114，差距 2.33x（改前 4.10x）；
开局双方都是 40 分，没有任何白给的分。


### 等级与经验（2026-10-20 调整）

```
MAX_LEVEL = 30
expNeed(level) = 20 + (level - 1) * 9        // 原来 40 + (level-1)*18，整体砍半
1→30 总经验 ≈ 4234（原来 8468）
EXP_BY_TIER = { 1:15, 2:30, 3:50, 4:75, 5:110, 6:500 }
PVP_EXP_MUL = 2.5                            // 打赢真人 ×2.5，日志写「真人对手 2.5 倍」
```

### 金币来源（2026-10-19 补）

```
初始：settings.startGold（默认 100）
击杀：GOLD_BY_TIER[e.tier]   1:[8,22] 2:[18,45] 3:[35,80] 4:[60,150] 5:[100,300] 6(BOSS):[300,600]
开箱：GOLD_BY_TIER[zone.danger]（同上，写进 pending.gold，弹窗里显示）
卖出：price × 数量 × settings.goldRate
都受 settings.goldRate 倍率影响
```

### 玩家对战（PVP）

```
server.js 每次 move/explore 前算 c._nearby：
  同轮次 + 同区块 + 活着 + scene==='map' + 未结算 + 不是 GM
game.js resolveEvent('fight')：
  near 非空且 rand<settings.pvpChance(默认45) → enemyFromPlayer(随机一个)
  pending.pvp = { user, name, bot }
打赢 → finishBattle 设 c._pvpResult{win:true}
逃跑 → doBattle 的 flee 设 c._pvpResult{win:false}
server.js applyPvp()：对方扣 30% 当前血（6~60）、掉 20% 金币，写一条日志给他
  血量归零 → 对方出局 + 公屏公告
前端每 5 秒 pollState()，被打的人不动也能收到提示
GM 隐身：GM 不进别人的候选，GM 自己也遇不到别人
```

### 噪音与连续遭遇

```
冷兵器噪音 1-3，弓弩 1，枪械 8-10
战斗结束后：噪音 ≥10 → 50% 概率立刻再来一波；≥6 → 22%；最多 3 波
```

---

## 7. 修改菜谱（任务 → 动哪里）

| 想做的事 | 改这些地方 |
|---|---|
| 加一件武器/防具/道具 | `data/items.js` 的对应数组 → 加掉落 `data/enemies.js` 的 LOOT_TABLE → 想卖就加 `data/shop.js` 的 GOODS |
| 加合成配方 | `data/recipes.js`（注意 `out` 和 `inp` 引用的 id 必须存在） |
| 加一种敌人 | `data/enemies.js` 的 ENEMIES，`tier` 1-5 对应危险度 |
| 改地图区块 | `data/map.js` 的 RAW 数组（顺序即 64 格，危险度是自动按距离算的，别手改） |
| 加一种状态 | `data/status.js` 定义 → `data/items.js` 加触发道具（`setStatus`）→ 若要影响战斗，在 `playerAttack`/`enemyTurn`/`playerDef` 里读 `currentStatus(c)` |
| 加一个称号 | `data/achievements.js` 加对象（`check(c)` 返回布尔，**必须给 `cat`**，取值在 `CAT_ORDER` 里）→ 前端自动按分类分组渲染。要用新数据就在 `createChar`/`migrateChar` 的 stats 里加计数器 |
| 加一个场景 | `game.js` 的 `act()` 加 case + 写 `doXxx()` → `public/app.js` 的 `renderModal()` 加分支 + 写 `renderXxx()` |
| 加一个 API | `server.js` 里 `if (route === '/api/xxx')`；后台的加在 `handleAdmin()` |
| 加一个可调数值 | `world.js` 的 `defaults().settings` → `server.js` 的 `/api/admin/settings` 白名单 → `public/admin.html` 数值页加 input → 逻辑里读 `W.settings().xxx` |
| 加一个常驻 NPC | `data/npcs.js` 加对象（`zone` 必须存在且**不能和商人同区块**）→ 前端自动识别，无需改代码 |
| 加一个武器配件 | `data/items.js` 加 `type:'buff'` + `modSlot` → `data/recipes.js` 加配方 → 掉落表可选 |
| 改移动端布局 | `public/style.css` 末尾的 `@media (max-width: 768px)`，注意 `#gameScreen` 必须是 `position: static` 才能整页滚动 |
| 改等级曲线 | `game.js` 的 `expNeed()` 和 `EXP_BY_TIER`，前端自动读 `snapshot.char.expNext` |
| 改像素外观 | `public/pixel.js`：物品按 `type` 分派到 `drawWeapon/drawArmor/...`；人物用 `drawPerson(ctx,x,y,w,opts)`，`opts` 见 `heroLook/enemyLook/NPC_LOOK` |
| 改配色 | `public/style.css` 的 `:root`（红黑主题）；地图片区色在 `data/map.js` 的 `REGIONS` |
| 加一列 CSV | `server.js` 的 `charRow()` 返回数组 + `CSV_HEADERS` 同步加一列，**顺序必须对应** |
| 改批量使用规则 | `game.js` 的 `isBatchable(d)` 决定哪些能一次用多个；前端 `showItemDetail()` 里 `batchable` 判断要同步 |
| 改前端样式 | `public/style.css`，变量在 `:root`（`--bg` `--panel` `--line` `--accent` `--good` `--bad`） |
| 改后台 | `public/admin.html` 单文件，CSS 在 `<style>`，JS 在 `<script>`，两者都要改 |

---

## 8. API 清单

### 公开（**不需要登录**）

```
GET /api/health          → 健康检查（容器探针/监控用）
GET /api/lobby           → **大厅数据**：轮次状态 + 倒计时 + 最近 12 轮看板 + 成就榜 + 在场人数
                           新玩家没登录就能看到「这游戏在干嘛、上一轮谁赢了、现在能不能进」
                           history[].startedAt/endedAt 是轮次起止；history[].top 是完整参赛名单
                           achievements[].titles 是 [{id, n: 名称, d: 说明}]（老轮次只有 count）
                           catalog/unlocked/titleCount/titleOwners 是称号图鉴用的
                           round.endedAt 用来判断「刚结束」，前端据此挂 90 秒横幅
                           **?lite=1 只回 { round, online }（194 字节）** —— 客户端每 3 秒轮询用这个；
                           全量 8063 字节里 4517 是静态的称号图鉴，重复发纯浪费
```

### 玩家侧（需 `Authorization: Bearer <token>`）

```
POST /api/register        { username, password } → { token, hasSave }
POST /api/login           { username, password } → { token, isGM }
POST /api/logout
GET  /api/meta            → 静态数据（地图/物品/配方/成就/商人/状态/特殊角色）
GET  /api/state           → { hasSave, stale, settled, dead, roundOver, state, round, isGM,
                              career, recent }   // career = 跨轮累计；recent = 最近 5 轮上榜
                           `?lobby=1` 省掉完整快照（约 3KB），大厅只要 hasSave/dead/career/recent
POST /api/newgame         { name } → 开新角色（同一轮死了会被拒）
POST /api/action          { action, payload } → { ok, msg, state, round, achievements }
GET  /api/poll?since=&state=0|1 → **合并轮询**：聊天 + （可选）完整快照。
                          state=1 才带快照，客户端每两次带一次（状态仍是 5 秒一刷）
POST /api/chat/send       { ch, text, to } → 含 GM 命令解析
                          ⚠️ 同一账号 **2 秒冷却**（GM 命令除外），超限 429
                          ⚠️ 正文/私聊目标/角色名都过 sanitize()，`<` `>` 会被删掉
GET  /api/chat/poll?since= → 增量消息
GET  /api/leaderboard
GET  /api/achievements  → { all, cats, mine }（cats 是分类顺序）
POST /api/trade/offer     { to, giveGold, giveItems, wantGold, wantItems }
GET  /api/trade/list
POST /api/trade/accept    { id }
POST /api/trade/reject    { id }
GET  /api/players/nearby  → 同区块玩家
GET  /api/players/bag?u=  → 同区块玩家的背包（交易用）
POST /api/round/start     （GM）
POST /api/round/end       （GM）
GET  /api/export          → 导出自己存档（JSON）
GET  /api/export/csv      → 导出自己存档（CSV，带 BOM，26 列）
```

### 后台（`Authorization: Bearer <adminToken>`）

> ⚠️ **只认登录签发的 token**。以前允许 `Bearer admin:<明文密码>` 直通，等于绕过所有限流给爆破开后门，已封。
> 所有 `/api/admin/*` 在 `handleReq` 里统一先过 `authAdmin`，再进独立的 `handleAdmin()`。

```
POST /api/admin/login     { password } → { token }
GET  /api/admin/items     → 物品清单 + 区块清单
GET  /api/admin/overview  → players, accounts, settings, round, history
GET  /api/admin/stats     → 运行指标 + 区块热力 + 称号统计
GET  /api/admin/chat      → 最近 120 条聊天
GET  /api/admin/logs      ?since=&level=all|error|warn|sys|info → 运行日志增量 + 内存采样
POST /api/admin/logs/clear  → 清空日志缓冲
POST /api/admin/logs/probe  → 立即采一次内存
POST /api/admin/reload      → 全量重读磁盘（手改存档后用）
POST /api/admin/loadone     { username } → 只重读一个玩家
POST /api/admin/chat/clear  { match? } → 不带 match 清空全部；带 match 只删含该关键词的消息
                            （发错公告时用，不用把整屏聊天清掉）
GET  /api/admin/bagview?u=
GET  /api/admin/playerdetail?u=
POST /api/admin/settings  → 14 个字段，白名单校验
POST /api/admin/player    → 改单个玩家 hp/ep/gold/pos/alive/invincible/attrs/name
POST /api/admin/bag       { username, action: add|remove|clear|clearAll, itemId, n }
POST /api/admin/global    { action: heal|gold|item|invincible|reset, ... } → 批量
POST /api/admin/gm        { username, isGM } → 绑定/解绑
POST /api/admin/gmcmd     { username, cmd } → 管理员代发 GM 命令
POST /api/admin/round     { action: start|end|forceEnd|supply|market|marketOff, zone? }
                          supply = 手动空投，market = 手动开黑市（可指定 zone），marketOff = 关黑市
POST /api/admin/bots      { n } 或 { action:'clear' }  → 假人，上限 50，重复调用不会超
POST /api/admin/broadcast { text }
POST /api/admin/kick      { username }
POST /api/admin/roundcfg  { zone, lootMul, force, forceChance } / { clear:true }
GET  /api/admin/roundcfg  → { round, zones, overrides, bots }
POST /api/admin/password  { old, next }  ⚠️ 改完所有旧 token 立即失效
GET  /api/admin/export/csv → 导出全服存档 CSV
```

`/api/action` 的 action 取值：
`move explore rest encounter battle loot box hostage hostage_done sevenwa liuying
 equip unequip mod sort_bag use craft trap enhance drop shop_buy shop_sell
 npc market hire close settle tease`

> `market` = 黑市买卖（`payload.choice: buy|talk`），`hire` = 佣兵头子（`payload.choice: hire|talk`）。
> 两者都要求 `c.scene === 'map'` 且站在对应区块，**不切 scene**（用弹窗交互）。

### GM 命令（聊天框输入，前缀 `@//gm/`）

```
show me the money        金币 +10000
god bless you            切换无敌
give me 物品名 [数量]     获得物品（支持中文名、英文 id、模糊匹配）
help                     列出命令
```

---

## 9. 前端结构

### 全局变量（`public/app.js`）

```js
META      // /api/meta 的静态数据
S         // /api/state 返回的快照，null 表示没有角色
ROUND     // 轮次信息
TOKEN / USERNAME / IS_GM
chatSince / chatMsgs      // 聊天增量游标
chatCh                    // 聊天频道，取值 'info' | 'zone' | 'private'（'info' = 个人日志+公共频道）
tipTarget                 // 悬浮提示当前目标
```

### 右栏：两张卡 + 标题内按钮切换（第 44 轮定稿）

```
#panelTop   [公屏*] [排名]  + 右侧常显「N 人在场」
            #paneSys（系统播报，只渲染 from==='系统' 的聊天）
            #paneRank（本轮排行榜）
#panelInfo  [信息*] [区块] [私聊]
            #chatList 一个窗口 —— 'info' 时把 c.log 和公共频道**按时间戳合成一条流**
            下面是输入框
```

- `#logList` 已删除，`renderLog()` 开头有 `if (!box) return` 兜底
- `.pane` 在 `#panelTop` 里必须写死 `height: 150px`，否则 `flex:1 1 0` 会塌成 0（踩坑 #55）
- 频道 tab 的类名是 **`.ctab`**（不是 `.chtab`），改样式时别搞错（踩坑 #54）

### 提示条（toast）

`noticeLatestLog()` 把 `warn/good/bad/loot/story/npc` 类日志弹成底部提示条。
`positionToast()` 以 `.map-wrap` 的 `getBoundingClientRect()` 为准定位：
水平居中到地图、底边贴地图下沿往上 8px；等待/结算界面没有地图时退回 `bottom:40px`。

### 地图标记

右上角小圆点，和商人金点同一套位置逻辑：
- **红点 + 光晕** = 黑市（限时，`S.market.zone` 匹配时画）
- **蓝点** = 佣兵招募点（常驻，`META.merc.zone` 匹配时画）
- 鼠标悬停的 `#mapTip` 会多出一行红/蓝强提醒（`★ 黑市在此 · 剩 04:08`）

### 大厅（`#lobbyScreen`，第 46 轮）

**登录页 `#loginScreen` 和等待页 `#waitScreen` 已经删掉**，合成一个大厅：

```
#lobbyScreen
  .lobby-head    品牌 + 轮次状态（进行中/已结束/等待开局）+ 倒计时 + 在场人数
  .lobby-main    #lobbyBoard 看板（历史轮次 top3）｜ #lobbyAch 成就榜（每轮称号）
                 + 「怎么玩」四格说明（新玩家第一眼要知道的）
  .lobby-foot    #lobbyLogin（未登录：账号密码）/ #lobbyMe（已登录：状态 + 战报 + 按钮）
```

- 数据来自 `GET /api/lobby`（公开），**每 3 秒自己刷**，不用再点「刷新」
- **轮询走 `?lite=1`**（194 字节），只有轮次 id/state 变了才重新拉全量（8063 字节）
- `hasSave` / `dead` 由服务端给标记，不要从 `state.char` 推 —— 轻量轮询没有 `state`
- 榜单有内容签名（`boardSig`/`achSig`），**内容没变就不重建 innerHTML** ——
  否则轮询会把鼠标底下的元素换掉，悬浮窗直接消失
- 称号 chip 用 `data-hint`，`initHints()` 是**事件委托**（动态元素才绑得上）
- `lobbyState` 存 `/api/state` 的结果，用来判断「加入本局 / 进入游戏 / 你出局了」
- 战报（`st.report`）从结算页搬到这里，常驻在底部
- 登录表单的 ID 没变（`#inUser` `#inPass` `#btnAuth` `.tab`），处理器照旧能用

### 三个界面层

```
#loginScreen  登录/注册
#waitScreen   等待开局 / 已出局观战 / 本轮结束
#gameScreen   游戏主界面
#modal        弹窗层（场景弹窗 + 背包/合成/商店/交易/成就/排行）
#tip          道具悬浮说明
```

### 关键渲染链

```
render() → renderZone() + renderChar() + renderLog() + renderModal()
loop()   → drawMap() 每帧（requestAnimationFrame，用于玩家呼吸动画）
```

### 轮次结束 → 结算画面（四条路径，缺一条就会卡住）

`roundOverTo(st)` 是唯一的切换入口，带 `roundOverShown` 去重，做了四件事：
`S=null → 清定时器 → 关弹窗 → showWait()`，并 toast「本轮结束，正在结算…」。

| 触发路径 | 时机 | 说明 |
|---|---|---|
| `pollState()` 每 5 秒 | 主路径 | **`hasSave` 的判断放在场景/弹窗检查之前**，否则在战斗弹窗里永远轮不到 |
| `chatPoll()` 每 2.2 秒 | 快路径 | 用 `j.round.state === 'ended'` 判断，比 pollState 快 |
| `tickRound()` 倒计时归零 | 最即时 | 本地倒计时到 0 立刻问一次 `/api/state`（`endPolled` 去重，服务器还没 tick 就一秒后重试） |
| `doAct()` 收到 `roundOver` | 兜底 | 后端 400 带 `roundOver:true`，说明玩家在死掉的界面上点了按钮 |

⚠️ **`sevenwin` 必须排除**：轮次因七娃结束的那一刻，玩家要看到胜利画面并亲手点「结算」。
所以后端 `/api/state` 在 `roundOver` 时仍然放行 `scene === 'sevenwin'`，前端三条路径也都判断 `S.scene !== 'sevenwin'`。

### 地图绘制（`drawMap`）

- Canvas 800×800，`CELL = 100`，8×8
- 每个格子：片区底色 → 26 个噪点方块 → 图标（`ICON_DEFS` 点阵）→ 名字 → 边框
- 商人区块右上角画金色圆点，当前格呼吸描边，相邻格金色虚线
- 玩家小人 `drawPlayer()` 带上下浮动

### 悬浮提示（`tipHtml`）

事件委托监听 `[data-tip]`，值为物品 id。对比逻辑在 `tipRow(label, v, curV, 'high'|'low')`，`'low'` 表示数值越低越好（如噪音）。

### 像素美术（`public/pixel.js`）

全局对象 `window.PX`，无外部图片资源，全部用 Canvas 画：

```js
PX.itemCanvas(id, size)        // → canvas，16×16 网格
PX.personCanvas(opts, w, h)    // → canvas，24×32 网格
PX.heroLook(char)              // 主角外观（按装备+状态）
PX.enemyLook(enemy)            // 敌人外观（按 kind+tier）
PX.NPC_LOOK[npcId]             // 常驻 NPC 外观表
PX.specialCanvas(who, w)       // 七娃/刘颖的高精度立绘（48×64 网格，4 倍分辨率）
```

前端用 `pxItem(id, size)` / `pxPerson(opts, w)` 生成 `<img src="dataURL">`，图标带 `iconCache` 缓存。

⚠️ **pixel.js 通过 `window.META.items` 读物品定义**。app.js 里 `let META` 是词法绑定、不挂 window，所以加载 meta 后必须显式 `window.META = META`，否则所有图标静默画不出来。

**动物立绘**：`enemyLook()` 对 `kind === 'animal'` 返回 `{ animal: true }`，
`drawPerson()` 开头有 `if (o.animal) { ...四足侧身...; return; }` 分支。
⚠️ 这个分支曾经不存在 —— `enemyLook` 返回了 `animal: true`，但绘制函数没接，结果「野狗群」一直画成人。
加新的动物敌人时，确认 `drawAnimal` 的坐标还在 24×32 网格内。

**图标规格**：24×24 网格（`u = size / 24`），**不画稀有度边框**（早期版本画过上下两条横线，被用户明确否掉）。武器按 `weaponClass(d)` 分 11 种轮廓，材料按 `MAT_KIND` 分 10 类，弹药按 `AMMO_KIND` 分 8 类。

**主角情绪**：`heroLook(char)` 在没有异常状态时按 `min(hp%, ep%)` 返回 `expression`（happy/worried/sad）和 `mood`（good/mid/bad），前端据此换 `.hero-stage.mood-*` 背景色。

### UI 约定

- **字号全部用 `clamp(Npx, N/14 vw, N*1.6px)`**，不要写死 px。批量改字号时用正则一次遍历，别逐条 replace（会连锁）
- **日志标签**：后端 log 的 `kind` 决定前端标签——`sys/move/flavor`→系统、`story`→剧情、`npc`→人物、`battle`→战斗、`loot`→拾取、`ach`→成就
- **合成按钮**：`can = 智力够 && 材料够`，不可合成时 `disabled` 且文案变「材料不足 / 智力不足」
- **背包双击**：`ondblclick` 直接生效——武器/防具/背包**装备**，药物/暗器/地图/对讲机**用 1 个**，单击仍是查看详情。战斗/遭遇的「使用道具」面板双击整行也生效
- **详情区高度**：`#itemDetail` 不再预留高度，靠**弹窗顶部对齐**（`.modal { align-items: flex-start }`）保证内容变高时上面的格子不移动。**不要改回 `align-items: center`**，改了双击立刻失效（居中会整体重排，第二下点空）
- **道具详情必须给实际值**：药物写「60/87 → 75/87 +15」，装备写「防御 2 → 7 +5（当前：劳保手套）」，不要只抄 `d.hp` / `d.defense` 名义值
- **实际效果要跟着数量走**：`showItemDetail` 里的 `realHtml(n)` 是函数，`#useQty` 一 `input` 就重算并替换 `#itemReal`（含溢出浪费、buff ×n）。新增任何数量控件，必须同步它显示的计算结果，否则就是「选了 6 个还显示 1 个的效果」
- **悬浮提示也要跟着数量走**：`tipHtml` 里用全局 `tipQty / tipQtyId`，med 分支按 `times` 乘并标注「按一次用 N 个计算」。改数量的地方（背包滑块、战斗道具下拉）都要 `tipQtyId = id; tipQty = n;` 再 `showTip(id, lastMouse)` 重画。`openModal` 会重置这两个值
- **升级绿点**：`isUpgrade(d)` 判断背包里这件是否比身上的强（武器比 `dmg`、防具比同部位 `defense`），是则在格子右上角闪绿点（`.up-dot`）。新增装备类型要同步扩这个函数
- **弹窗遮罩**：`rgba(5,7,4,0.55)`，不要调回 0.82——太黑会把右侧记录面板糊成一片，玩家读不到事件
- **点遮罩关窗**：`openModal(..., noClose)` 的第 4 个参数决定 `modalClosable`。浮层（背包/合成/商店/称号/交易）点外面就关；场景弹窗（遭遇/战斗/七娃/人质）传 `true`，点外面**不能**关，否则流程会卡死
- **丢弃数量**：和「使用」同一套 `.qty-row` 滑块（`#dropQty` + 「丢弃 N 个」+「全丢」），后端 `doDrop` 收 `n`。矮屏（`max-height:760px`）会自动压缩网格高度，保证按钮不用滚动就能看见
- **战斗/遭遇「使用道具」**：面板按 id 合并（背包里同种药可能拆成多格），可批量吃的药右边多一个 `.qty-sel` 下拉（1..n），按钮文案跟着变「用 N 个」，点了就把 `n` 传给 `battle`/`encounter` 的 `choice:'item'`。批量吃只算一个回合
- **称号面板**：按 `META.achCats` 分组，每组头部显示「分类 + 已解锁/总数」。加称号必须给 `cat`
- **弹窗位置**：`.modal` 是 `align-items: flex-start`，`openModal` 在 rAF 里量一次高度算 `marginTop` 做视觉居中。**内容变高时只往下长**，不会整体重排（重排会让双击点空）。不要改回 CSS 的 `align-items: center`
- **满状态跑马灯**：血量与精力**同时**满时，`.vital` 加 `state-full`，条上盖一层 `::after` 斜纹 + `marchLight` 平移动画，字变绿
- **血量三档**：`applyVitalState()` 按 60% / 30% / 15% 给 `.bar` 和 `.vital` 同时加 `state-high|mid|low|crit`：条换色 + 边框发光 + 低血量脉冲（`barPulse`）+ 填充闪烁（`vitalBlink`），「生命/精力」四个字也跟着变色；`heroLook` 返回 `critical`，舞台加 `.vital-crit` 闪红。⚠️ `.bar` 不能加 `overflow:hidden`，会把外发光裁掉。档位判断统一走 `vitalStateOf(pct)`，**别在别处再写一遍三元表达式**
- **战斗窗口血条同步**（2026-10-19 补）：`hpBarHtml(cur, max, cls, state, full)` 输出的结构是 `.vital > .bar > .bar-fill`，**和左上角完全一样**，所以 `state-*` 的发光/脉冲/闪烁和 `state-full` 的绿跑马灯全部自动继承。数字行 `.mini-row` 也带 `state-*`，`.num-hp` 跟着变色（`state-crit` 会 `vitalBlink`）。`full` 的判定是「血满 **且** 精力满」，和左上角一致；敌人不传 `full`（没精力，挂上会误导）
- **战斗窗口立绘共享同一套特效**（2026-10-19 补）：战斗窗口里「你」和敌人那两格用的是 `<div class="hero-stage fx-stage ...">`，**同时带 `hero-stage` 类**，所以血量档位光效 / 濒危闪红 / 受击抖动 / 状态笼罩（中毒乌云、冰冻、醉酒）**全部自动继承**，不用另写一套动画。特效类由 `stageFxClass(char, look)` 统一生成，左上角头像和战斗窗口都调它——**改特效只改这一处，两边永远一致**。
  - `.fx-stage` 只负责尺寸覆盖（`max-width:176px; height:96px; overflow:visible`），别把 108×144 的卡片尺寸带进来
  - 敌人额外挂 `.enemy-fx`（红底，避免绿底被误认成中毒）和 `.boss-aura`（BOSS 红晕）；`full-aura`（绿跑马灯）对敌人要 `.replace()` 掉，因为敌人没有精力，挂上会误导
  - **受击震动要单独补**：战斗窗口是每回合 `innerHTML` 整块重建的，`hitFx()` 加的 class 会被下一次渲染冲掉。所以 `renderBattle()` 用 `btLastHp / btLastFoeHp` 自己记基准血量，在 `openModal()` **之后**调 `shakeStage()`；`renderModal()` 里 `scene !== 'battle'` 时把这两个值清空，避免下一场拿上一场的血对比误触发
- **开箱**：`pxBox(kind, 76)` 画箱子（5 种外观，按 `p.text` 关键字挑），顶部是「箱子图 + 描述 + 提示」。战利品/开箱的底部有「背包」按钮，`openBagFromScene()` 打开背包，关掉会 `renderModal()` 回到原来那一页
- **随行**：`#hostLink` 悬停走 `data-tip="hostages"` 显示人名/心情/唱歌次数，点击开 `openHostages()`，只有开心的人质才有「挑逗」按钮
- **属性说明**：`META.attrTips` + `META.moods`。属性行带 `data-tip="attr_xxx"`，道具说明里用 `attrNotes()` 追加用途——新加增益道具记得让玩家看得懂
- **底部提示**：`noticeLatestLog()` 会找出「这一批新增日志」，再取其中**最后一条值得弹的**（`story/npc/good/bad/warn/loot`），**有 bad 就优先弹 bad**（少东西比多东西更该被看见）。不能只看最后一条——剧情后面常跟一句没标签的环境描写，会把它吞掉
- **弹窗不能裸关**：`closeModal()` 里判断 `BLOCKING_SCENES`（遭遇/战斗/战利品/开箱/人质/NPC/七娃/刘颖），场景没结束就 `renderModal()` 把弹窗画回来。否则玩家会卡在「没弹窗 + 地图按钮全灰」的死锁里。`renderModal` 自己调用时传 `true` 跳过这层
- **自愈看门狗**：`app.js` 里有个 1 秒的 `setInterval`，发现「弹窗隐藏 + 场景属于 BLOCKING_SCENES」就重画一次。这是最后一道保险——不管以后哪条新路径把弹窗关掉了，玩家最多卡 1 秒
- **快捷键**：弹窗内 ↑↓←→/空格/Esc；地图上 **Enter 探索**、B 背包、M 合成。整套连起来可以不碰鼠标：Enter 探索 → 出遭遇 → 空格战斗 → 空格攻击，直到战利品
- ⚠️ **聊天框会抢回车**：`#chatText` 的 Enter 只在有内容时发消息，空着按回车会 `blur()` 把焦点还给 body，这样后续回车才是探索。改这块别把 blur 删了
- **静态文件不缓存**：`serveStatic` 发 `Cache-Control: no-cache, no-store, must-revalidate`。不加的话改了前端、用户刷新还是旧 `app.js`，看起来就是「功能没生效」
- **资源带版本号**：`index.html` 里 `style.css?v= / pixel.js?v= / app.js?v=`，大改后把 `v` 改一下（如 `20261019c`），可以绕过浏览器里已经存在的旧缓存条目。**这是「我改了你却说没变化」最省事的解法**
- **两条提示条**：`#modal` 打开时显示「↑↓←→ 选择 · 空格 确定 · Esc 关闭」，地图上显示「Enter 探索 · 空格 战斗 · B 背包 · M 合成」。统一由 `updateHints()` 决定显示哪条，别在别处直接 toggle
- **地图**：canvas 内在 800×800（`CELL=100`），CSS `width:100%` 撑满中栏，不设 max-width

### 键盘操作（方向键 + 空格）

- `kbFocusables()` 收集当前弹窗里可操作的东西：`.btn`、`.bag-cell[data-id]`、`.pill-btn`、`.shop-item`
- **方向键**用几何判定找最近的元素（`kbMove`），所以网格、竖排、底部按钮一套代码通吃；左右键限制在「同一行」，防止从底部按钮斜着跳回网格
- **空格 / 回车**：有焦点就点它；没焦点就点 `modalDefaultBtn`。`modalDefaultBtn` 来自 `openModal` 按钮配置里的 `def: true`（遭遇的「战斗」、战斗的「攻击」），场景弹窗退化为 primary；**浮层不设默认**，避免空格误关背包
- **Esc** 关闭可关闭的浮层（`modalClosable`）
- 第一次按方向键只做「落焦点」：优先 `def` 按钮，否则内容区按阅读顺序第一个（跳过底部按钮和 `.tiny` 小工具按钮）
- 空格选中格子后，`showItemDetail` 会把焦点直接送到详情的第一个操作按钮，再按一次空格就装备/使用
- 焦点样式 `.kbd-focus`；底部提示条 `.kbd-hint`（`@media (hover:none)` 隐藏）
- ⚠️ 焦点元素被弹窗重绘（`openBag()` 之类）清掉是正常的，`openModal` 会重置 `kbEl`

**改外观只改 pixel.js，不要在业务代码里画。**

### 自动战斗

`autoBattle` 布尔 + `autoStep()` 递归 `setTimeout`（650ms 一次）。血量 ≤25% 自动停。勾选框在战斗界面，`renderBattle()` 每次重建 DOM，状态从变量读。

### 背包分类

`BAG_CATS` 数组定义分类（全部/装备/药物/材料/弹药/其他），`bagCat` 记当前分类。分类视图不补空格子，只有「全部」补。

**同类合并**：`bag` 数组里同 id 可能有多项（超过 stack 上限会拆格），`bagHtml()` 用 Map 合并显示，格子带 `data-id` 而非 `data-idx`。`showItemDetail(itemId)` 接收 id，自己统计总数。

**批量使用**：`isBatchable(d)` 在 `game.js`（`med` 类型且非 `setStatus`/`cureStatus`/`repair`）。`useItemInternal(c, itemId, ctx, n)` 循环调用 `useOne()`。前端滑块是原生 `<input type="range">`，`oninput` 更新按钮文案。

**强化数值 = 百分比 与 至少 +N 点 取大**（`plusValue(base, entry)`）：

```
p = 0  → 基础值
p > 0  → max(base + p, round(base × (1 + p×0.1)))
```

为什么要有「至少 +N」这一条：安全帽基础防御只有 **3**，按 10% 算是 3.3，四舍五入**还是 3** ——
玩家强化完一看数值没动，会认为「强化了个寂寞」。加了兜底后 3 → 4 → 5 → 6。

⚠️ **前后端两套实现必须同步**：`game.js` 的 `plusValue()` 和 `app.js` 的 `plusValOf()` 是同一个公式，
改一个必须改另一个，否则面板显示的伤害和实际打出来的对不上。

**提示框也要带强化等级**：`tipHtml(itemId, plus)` 第二个参数是强化等级，
来源是格子上的 `data-tip-plus`（`showTip` 从 `tipTarget.dataset.tipPlus` 读）。
不带的话悬停一个 +3 的安全帽，提示里还写「防御 3」。

### 强化附魔词条（2026-10-20 新增）

```
+1：只有数值加成（10%），无词条
+2：随机附 1 条人物属性（3~6 点）
+3：保留 +2 那条，再补 1 条（5~10 点），共 2 条

AFFIX_ATTRS = ['sta','str','cha','int','luk']
AFFIX_MAX   = 10        // 单条硬上限
```

**数据结构**：词条挂在「实例」上 —— `entry.affix = [{ k:'luk', v:8 }, { k:'cha', v:10 }]`。
和 `plus` 一样，**换装 / 卸下 / 强化都必须用 `addEntry` 搬运**，
否则一卸装备词条就被洗掉了（`addEntry` 和 `doEquip` 里都要复制 `affix`）。

**生效范围**：只算**装备中**的那件（`gearBonus` 里遍历 `c.equip`），背包里的不叠加 ——
不然玩家可以靠塞满背包白嫖属性。

**品质标签**：`+1 优秀 / +2 史诗 / +3 传说`（**递进是 优秀 < 史诗 < 传说**，别搞反），
`gradeHtml(plus, entry)` 生成 `.tip-grade.g1|g2|g3`，**标签里带附魔小字**（`<i>` 那行）。

⚠️ **只能放在描述行右侧**（`.tip-subrow`）。塞进标题行（`.tip-name`）会把
「88式狙击步枪 +3 武器」挤成竖排 —— 名字一长就崩，300px 的提示框装不下三段文字。

**老存档补词条**：`migrateChar()` 里对 `plus >= 2` 但没有 `affix` 的装备调 `seededAffix(seed, ...)`，
seed 用 `名字|物品id|等级`。**必须确定性**，不能用 `Math.random` ——
`migrateChar` 每次 snapshot 都跑，随机的话刷新一次词条就变一次。

**显示三处**：
- 提示框：`tipHtml(itemId, plus, entry)`，`entry` 由 `entryOfTarget()` 精确解析
  （装备栏按 `data-slot`，背包按 `data-key` 的 `id|plus`，不能只按 id 猜）
- 详情区：`.item-affix` 紫色块
- 背包格子：左上角 `.affix-dot` 紫点

**强化作用在哪一件**：`doEnhance` 优先把**装备位**那件当底（那才是你在用的），
背包里同种同级的会被当材料消耗。所以背包详情里点「强化」，
可能强化的是身上那件而不是眼前这件 —— 详情区必须写清「会强化你正在用的那件，背包里这件会被当材料消耗掉」，
强化成功后 toast 也要说明「你正在用的 X 已强化到 +N」。`doEnhance` 返回 `where: 'equip'|'bag'`。

⚠️ **`/api/action` 的返回要把动作自己的字段透传出去**。以前只挑 `ok/msg/achievements/state/round`，
`doEnhance` 返回的 `plus` / `where` 被丢掉，前端拿不到就以为没生效。
现在用 `Object.assign({}, r, {...})`。

**可强化黄标**：背包格子如果「同 id + 同强化等级」凑够 2 件且没到 +3，
加 `.enh-able`（黄边框脉冲）+ 右上角 `.enh-dot`（黄底「＋」，闪烁）。
件数用一次遍历预先算进 `copyMap`（`id|plus` → 件数，**装备位也算**），
别在每格里调 `copyCount()` 反复扫背包。同时有「比身上强」的绿点时，绿点自动右移到 `right:22px` 让位。

**分类着色**：背包格子带 `t-{type}` 类（如 `t-weapon`），CSS 在 `public/style.css` 末尾「背包按类别着色」段。武器浅红、防具浅蓝、药物浅绿、暗器浅橙、弹药浅黄、材料灰棕、配件浅紫、特殊浅金，全部用虚线边框。

**装备栏（`.equip-slot`）**：两行布局，第一行 `槽位 + 名字 + 强化标记`，第二行 `耐久 + 配套弹药`。
**武器槽跨两列**（`[data-slot="weapon"] { grid-column: 1/-1 }`），因为武器名最长。
⚠️ 名字的省略号只能加在 `.es-name` 上 —— 以前加在 `.equip-slot b` 上，
把塞在同一个 `<b>` 里的耐久/弹药一起裁掉了，弹药直接看不见。

**整理**：`action: 'sort_bag'` → `doSortBag()`，按 `BAG_TYPE_ORDER`（武器→防具→背包→药物→暗器→弹药→材料→配件→特殊）分组，同类按稀有度降序、再按名字拼音。

### 三栏布局（`.layout`）

```
┌──────────┬─────────────────────┬──────────┐
│ col-left │     col-center      │ col-right│
│ 300px    │  flex:1（地图 672）  │  340px   │
│ 状态     │   Canvas + 区块信息  │ 记录/聊天 │
│ 属性     │                     │ /排行    │
│ 装备     │                     │ 底部按钮  │
└──────────┴─────────────────────┴──────────┘
```

- 地图 `canvas` 内在 800×800（`CELL=100`），CSS `width:100%` 自适应中栏
- 右栏 `.card.grow` 撑满高度，日志/聊天/排行区 `flex:1` 吃满剩余空间
- 断点：1400 收窄左右栏；1080 变成上下堆叠（地图在最上）

**改布局只动 `public/style.css` 末尾的「三栏布局」段和 `index.html` 的 `<main class="layout">` 结构。**

### 合成红点

- `craftableList()` 算出材料+智力都够的配方
- `craftSeen`（localStorage `br_craftSeen`）记录已读的配方 id
- `updateCraftDot()` 在每次 `render()` 末尾跑：有未读可合成 → 合成按钮右上角亮圆点
- **颜色规则**：`CRAFT_RED_CATS = ['武器','防具','背包','配件']` → 红点；其余（医疗/暗器/弹药）→ 绿点
- 配方变得不可合成时会从 `craftSeen` 移除，下次凑齐材料会重新提示
- 悬浮合成按钮显示 `craftTipHtml()`（走 `data-tip="craft"` 这条特殊分支）
- 合成面板顶部有提示条 + 「知道了」按钮，点了调 `markCraftSeen()`

### 移动端（`@media (max-width: 768px)`）

关键几点，改动时别破坏：

- `#gameScreen` 必须 `position: static; height: auto`，否则内部溢出被裁切、无法滚动
- `html, body` 要 `height: auto; overflow: visible`，让 body 整页滚动
- `#map` 用 `width: 100% !important; height: auto !important; aspect-ratio: 1/1`
- `.col-map` / `.map-wrap` 要 `flex: none`，防止被 flex 压扁
- `.bottom-btns` 是 `position: sticky; bottom: 0`
- 弹窗改成底部抽屉（`align-items: flex-end`，全宽）

---

### 存储：内存优先（2026-10-20 重构）

**以前的写法**：每个 `/api/action` 都 `readdir(store/saves)` + 读全部存档 + `JSON.parse`。
282 个存档 ≈ 38ms，而 Node 是单线程 —— 一次读盘期间整个服务停摆。
30 人并发 150 请求，P50 **12.7 秒**。

**现在**：启动时全量载入内存，运行期读写都走 `Map`，磁盘只做「每 2 秒批量落盘」。

```js
SAVES      Map<user, saveObj>   // 全部存档
USERS_DB   users.json 的内存副本
DIRTY      Set<user>            // 待落盘的
usersDirty boolean

loadAllStorage()   // 启动 / reload 时调
flushStorage()     // 每 2 秒；只写 DIRTY，没改动就零 IO
deleteSave(user)   // ⚠️ 删存档必须走这里，只删文件的话内存里还在，玩家会「死而复生」
```

**结果**（851 份存档下实测）：

| 指标 | 重构前（282 份） | 重构后（851 份） |
|---|---|---|
| 30 人并发 × 5 次 | 总耗时 25152ms / 6 req/s | **288ms / 521 req/s** |
| P50 | 12758ms | **189ms** |
| 串行单次 rest | 147ms | **3ms** |
| 堆内存 | 15~25MB | 8~12MB（不再反复 parse） |

### 删除文件：必须走回收站（2026-10-20 第 38 轮）

**本机 `fs.unlinkSync` 单文件约 27ms**（Windows Defender 行为扫描；在 WorkBuddy 工具的
`NODE_OPTIONS` 安全钩子下会变成 600ms）。删 700 个 = 20 秒到 7 分钟阻塞事件循环，
表现是「点一下后台按钮，整站打不开」。

```js
store/_trash/                 // 回收站，不在 SAVE_DIR 里 → 重启不会加载
deleteSave(user)              // rename 进回收站（1ms），不 unlink
sweepTrash()                  // 每 60 秒后台清，每批 20 个 + setTimeout(0) 让出事件循环
```

**批量清理绝不许逐个删**：`/api/admin/cleanup` 用整目录 rename（O(1)）：
`saves` → `_trash/bulk_<ts>`，保留的 `copyFileSync` 回来（2ms/个），墓地交给后台异步删。
实测 723 份 **357ms**，清理期间 99 次探测 0 超时。

**保留规则**（`GET /api/admin/cleanup` 返回 `total/keep/drop/recent/round`）：
1. 属于当前轮次
2. **6 小时内还有动作**（`char.updatedAt`）—— 否则轮次刚切换时点清理会把上一轮玩家全清空

⚠️ 用工具启动服务测试文件操作时，必须 `NODE_OPTIONS= node server.js`，
否则安全钩子会让删除慢 22 倍并拦截 >50 个文件的批量删除。用户 `start.bat` 无此问题。

### 静态资源：gzip + 内容哈希版本号（2026-10-20 第 39 轮）

**旧写法**：`Cache-Control: no-cache, no-store, must-revalidate`，无压缩。
每次打开都全量重下 **282KB**（app.js 154KB + style.css 82KB + pixel.js 37KB + index.html 9KB）。

**现在**（`serveStatic` / `assetMeta` / `htmlBody`）：

| 机制 | 做法 |
|---|---|
| 压缩 | `zlib.gzipSync`，按 mtime 缓存压缩结果，不重复压 |
| 版本号 | 文件内容 md5 前 8 位，**服务端实时注入** index.html 的 `?v=`，不用手改 |
| 强缓存 | `?v=` 等于当前哈希 → `max-age=31536000, immutable` |
| 兜底 | 版本号不对/没带 → `no-cache`，强制回源，永远拿不到旧代码 |
| HTML | `no-cache` + `ETag`，没改就回 304 |

实测首屏 **282KB → 79KB（-71%）**，第二次打开资源 0 字节。

`json()` 也加了 gzip：>1KB 且客户端支持才压（小响应压了反而更大，gzip 单次约 0.05ms）。
`/api/meta` 是 63KB 常量，用 `sendMeta()` 缓存序列化和压缩结果（→18KB）。

`GET /api/admin/stats` 返回 `assets` 字段（各文件当前版本号），后台「运行」页可看，
用来确认浏览器该拿哪一版。

### 部署：Mac mini + OrbStack（2026-10-20 第 41 轮）

目标形态：Mac mini 常年命令行运行，不碰桌面，对外网提供服务。

**产物**：`jianghan-br-deploy.zip`（项目根目录，约 200KB，28 个文件）。
解压后 `chmod +x deploy.sh && ./deploy.sh` 一条命令完成构建 + 启动，端口仍是 **8123**。

**打包/重建**：改完代码跑 `./build-deploy.sh` 重新生成 zip。
它用 Python 的 `zipfile` 而不是 `Compress-Archive` —— 后者在 Windows 上写反斜杠路径，
macOS 解压会得到文件名里带 `\` 的单个文件；而且 `create_system` 默认是 FAT，
unzip 读不到 Unix 权限位，`deploy.sh` 会丢掉可执行属性。

**关键文件**

| 文件 | 作用 |
|---|---|
| `Dockerfile` | `node:22-alpine`（arm64 原生，不用 Rosetta），非 root 用户，HEALTHCHECK |
| `docker-compose.yml` | 端口映射、`./store` volume、`init: true`、日志轮转、`mem_limit` |
| `deploy.sh` | 一键部署；`--data` 导入老数据、`--status/--logs/--restart/--stop/--destroy` |
| `README-DEPLOY.md` | 给用户看的完整说明（含外网暴露方案、备份、FAQ） |
| `build-deploy.sh` | 重新打 zip |

**必须记住的两点**
1. 容器内 `HOST=0.0.0.0`（代码里 `process.env.HOST || '127.0.0.1'`），否则 `-p` 映射进不来
2. `./store` 必须挂 volume。内存优先存储，不挂就是「容器一删数据全没」

**外网暴露**：不要直接映射 8123 到公网。用 Cloudflare Tunnel（自带 HTTPS）或 Nginx 反代。
代码里已设 `keepAliveTimeout=65s`，比常见反代的 60s 长，不会出 502。

**`GET /api/health`**（公开、零 IO、不泄露玩家信息）：

```json
{"ok":true,"uptime":312,"memMB":61,"saves":290,"dirty":0,
 "storage":true,"round":{"id":223,"state":"running"},"build":"7acbdd20"}
```

`build` 是前端资源版本号，一眼看出线上跑的是哪版代码。容器 HEALTHCHECK 和外部
uptime 监控都用它，**不要拿首页当探针**（首页要走静态资源逻辑 + gzip）。

**`smoke-test.sh`**：部署后自检 10 项（健康、页面、版本注入、gzip、强缓存、鉴权、
数据目录、容器健康）。`deploy.sh` 跑完会自动调它。改完代码也建议手动跑一遍。

### 安全基线（2026-10-20 第 42 轮，无人值守 + 公网）

**⚠️ 已封掉的洞**：`authAdmin` 原来允许 `Authorization: Bearer admin:<明文密码>` 直通。
那等于给爆破开后门 —— 攻击者可以对任意 `/api/admin/*` 反复试密码，**完全绕过登录限流**。
现在只认登录签发的临时 token。

| 项 | 实现 |
|---|---|
| 后台密码 | `loadAdmin()` 首次启动 `crypto.randomBytes(9)` 生成 12 位随机密码，不再是 `jianghan`；不足 10 位启动时警告 |
| 改密码 | `POST /api/admin/password { password }`，至少 8 位，改完 `adminTokens.clear()` |
| 登录限流 | 两层：`guardKey`（IP+账号，8 次/10 分钟锁 1 分钟）+ `ipKey`（IP，50 次/10 分钟锁 5 分钟） |
| 真实 IP | `clientIp()`：直连只信 `socket.remoteAddress`（头可伪造）；**对端是本机/内网**才读 `cf-connecting-ip` → `x-forwarded-for`（取最右）→ `x-real-ip` |
| 防枚举 | 「账号不存在」和「密码错」统一返回「账号或密码不对。」；重复注册也记一次失败 |
| 响应头 | `SEC_HEADERS`（nosniff / DENY / no-referrer / Permissions-Policy）+ `CSP`（仅 HTML） |
| 会话 | 7 天滑动过期；管理员 token 12 小时；每小时清理 |

**反代下的坑**：挂 Cloudflare Tunnel / Nginx 后，所有请求的对端都是 127.0.0.1。
如果直接用 `remoteAddress` 做限流键，**一个攻击者就能把全服锁死**。
所以必须先解析真实 IP，且只在「对端可信」时才信任代理头。






**为什么没做「索引」**：内存化之后 `listSaves()` 只是遍历 Map（851 个对象 ≈ 0.05ms），
`_nearby` 和「全员死亡检查」直接遍历就够快，额外维护 `byRound/byZone` 是过度设计，还容易和写入不同步。
原来那个 1.5 秒的 `listSavesCached()` 也一并去掉了 —— 现在它只是 `listSaves()` 的别名。

⚠️ **内存化带来的三个副作用**：

1. **手改 `store/saves/*.json` 不再生效** —— 服务读的是内存。
   用 `POST /api/admin/reload`（全量）或 `POST /api/admin/loadone { username }`（单个）。
   后台日志页有「重载存储」按钮。
2. **新存档最多 2 秒后才出现在磁盘上** —— 测试脚本如果立刻读文件会 ENOENT，
   要么等，要么改完调 `loadone`。
3. **进程被强杀会丢最多 2 秒数据** —— `SIGINT/SIGTERM` 有 flush 钩子，但 `kill -9` 救不了。

**测试适配**：`ui-test.js` 的 `patchSave()` 和 `pvp-test.js` 的 `patch()/read()`
都改成「等文件落盘 → 改文件 → 调 `loadone`」，`read()` 改走 `/api/admin/playerdetail`。

### 后台运行日志（2026-10-19 新增）

**只放内存，不落盘** —— 重启就清空，避免把日志文件也变成性能负担（存档读盘已经是瓶颈了）。

```js
// server.js 顶部
LOG_MAX = 1000           // 环形缓冲，满了从头丢
rlog(level, tag, text, extra)   // level: info|warn|error|sys
MEM_BUF                  // 每 5 秒一次内存采样，保留 120 条
```

**三类东西会自动进日志：**

| 来源 | 怎么进来的 |
|---|---|
| 全服广播（开局/空投/BOSS/结束/死亡） | `W.setLogHook()` —— `world.js` 的 `sys()` 里回调，一次广播同时进公屏和日志 |
| 请求异常 / 慢请求 | `http.createServer` 外层包了 `.catch` + `.finally`，≥200ms 记 `warn` |
| 未捕获异常 / Promise 拒绝 | `process.on('uncaughtException' / 'unhandledRejection')` |
| 轮次结算 | `W.onEnd` 里记一条摘要（人数 + 冠军 + 分数） |

**内存采样内容**：`heapUsed / rss / external / 存档数 / 聊天条数 / 日志条数 / 在线人数 / uptime / roundId / state`。
后台日志页画成柱状图（按实际峰值缩放，不是固定刻度）。

⚠️ **`sys()` 的日志钩子必须包 try-catch**：日志写失败不能把游戏广播也带崩。

## 10. 历史 bug（别重犯）

| bug | 症状 | 根因 | 修法 |
|---|---|---|---|
| 开局赤手空拳 | 玩家全程打 4 点伤害，模拟 0/20 存活 | 初始武器只 `addItem` 没 `equip` | `createChar` 里直接 `c.equip.weapon = { id: 'w05' }` |
| 高防敌人免疫 | 匕首打退伍兵只掉 5 血 | 伤害公式用减法 `- def` | 改成 `× 100/(100+def*2.5)` |
| 商店 0 元购 | 任何物品都能白拿 | `Math.round(priceOf(id) * mul)` 中 `null*1=0`，判空失效 | **先判 `basePrice == null` 再乘倍率** |
| GM 给物品不解锁成就 | 塞满 20 种物品没触发「拾荒之王」 | GM 命令不走 `act()`，跳过了 `checkAchievements` | `server.js` 的 GM 分支里手动调 |
| 死亡后卡死 | 点「留在这里」后所有按钮失效 | 场景仍是 `dead` | 改 `showDeadWait()` 切到观战页 |
| 交易看错背包 | 「你要对方给」列的是自己的东西 | 前端两次用了 `c.bag` | 新增 `/api/players/bag` |
| 冻结不生效 | 中毒/冻结状态无效果 | `frozenUntil` 没在 `doMove` 里检查 | 移动前检查 `Date.now() < c.frozenUntil` |
| 测试提前退出 | 平衡模拟中位数从 14 掉到 4 | 模拟脚本遇到新场景走 `else break` | 补上 sevenwa/liuying/hostage 分支 |
| 改装加成界面不显示 | 装了瞄准镜命中反而从 96 掉到 84 | `snapshot()` 还在用 `hasBuff(c,'buff_scope')` 判断，配件已从背包移到武器上 | 改成读 `inst.mods.sight`；`attack` 同理要乘 `grip` |
| NPC 面板打不开 | `TypeError: Cannot read properties of undefined (reading 'npc_han')` | `createChar` 没初始化 `npcFavor` 等三个字段（只有 `migrateChar` 补） | 两处都加 |
| 移动端地图被裁切 | 只显示地图底部两三行，且无法滚动 | `#gameScreen` 是 `position: fixed; inset: 0`，内部溢出被裁切，`overflow-y:auto` 无效 | 移动端改成 `position: static; height: auto`，让 body 整页滚动 |
| 服务器改了代码没生效 | 测试通过但行为还是旧的 | Node 无热重载，改完必须重启 `node server.js` | 改完先重启再测 |
| 字体调大后登录框重叠 | "64 区块 · 一个出口"和 tab 压在一起 | 登录框还是 380px 宽，字号涨了但容器没涨 | 加宽到 480px，`.logo-sub` 加 `margin: 14px 0 18px` |
| 等级测试不执行 | 加了测试但输出里没有 | 测试块被追加到 `process.exit()` 之后 | 把 exit 移到文件末尾 |
| 批量改 CSS 字号连锁 | 15px 改 16 后又被 16→17 再改一遍 | 用 `replace` 逐条替换会连锁 | 用一次正则遍历 + 映射表 |
| 同类物品分成多格 | 背包里出现两格「绷带」（x5 和 x4） | `addItem` 超过 stack 上限会开新格 | 前端 `bagHtml` 按 id 合并显示，`showItemDetail(id)` 统计总数 |
| 批量使用滑块不显示 | 详情面板只有描述，没有滑块和按钮 | 背包网格 32 格把详情挤出可视区 | `.bag-grid { max-height: 296px; overflow-y: auto }` |
| 提示框盖住弹窗 | 合成悬浮说明压在合成面板上方 | tooltip `z-index:400` 高于 modal `100` | `openModal()` 开头先 `hideTip()` |
| **双击装备/使用没反应** | 背包里双击防割手套，什么都不发生 | 第一次 click 让 `#itemDetail` 从空变有，弹窗变高、**居中布局整体上移**，第二下点到了别的格子，`dblclick` 根本没派发到原元素 | `#itemDetail { min-height: 248px }` 预留高度 + 空态放提示文字，弹窗高度恒定 |
| 药物回血只加 1 点 | 绷带写「回血 15」，实际只回 1~2 点 | 血量被 `hpMax` 截断，但日志照抄 `d.hp` 名义值；满血时还会白扔一个 | `useOne` 里算前后差值再写消息；纯回血/纯回精/纯解毒在无收益时**不消耗**直接拒绝 |
| 剧情对白串人 | 「拿着玩具枪的孩子」的弹窗标题显示「疯女人」，立绘是个中年男 | `renderEncounter` 用 `e.name`（随机敌人）当标题；敌人是 `npc.enemy` 映射来的 | 标题用 `npc.title`，敌人名单独一行「谈崩了动手的是：X」，立绘走 `PX.NPC_EVENT_LOOK` |
| 背包满没有任何提示 | 箱子里拿不动，点「全部拿走」毫无反应，以为卡了 | `doLoot`/`doBox` 在没拿到东西时 `return { ok: true, msg: '' }`，前端只在 `!ok` 时 toast | 没拿完就返回 `ok:false` + 剩余件数，前端底部红字提示 |
| 平衡模拟「存活 16/20」是假的 | 中位数 4 回合却显示存活 16 | 卡在 `loot`（背包满）和 `hostage_result`（模拟没这个分支）不推进，`scene !== 'dead'` 就被算成存活 | 模拟补 `hostage_result` → `hostage_done`；拾取失败就 `act('close')` |
| 击杀经验测试随机红 | 有时 `exp 0 → 0` | 测试只打一次，命中率约 75%，miss 就没击杀 | 循环攻击直到敌人 hp ≤ 0 |
| **七娃框一大片空白** | 立绘只有 200 高，边框却有 450 | `.enc-body` 是 `align-items: stretch`，`.enc-art` 被右侧长文案拉高 | `.enc-art { align-self: center }` |
| **胜利画面重复弹** | 点「结算」后刷新又回到胜利画面 | 前端只是 `location.reload()`，存档仍是 `sevenwin` | 加 `settle` 动作写 `flags.settled`，`/api/state` 见到就返回 `hasSave:false` |
| 点遮罩关不掉浮层 | 背包/合成必须点「关闭」或 × | 没绑遮罩点击 | `#modal` 上绑委托，`modalClosable` 由 `openModal` 的第 4 个参数控制 |
| 矮屏丢弃按钮被裁 | 1080×675 下「丢弃 N 个」在折叠线以下 | 弹窗居中 + 内容超过 88vh | 弹窗改顶部对齐 + `@media (max-height:760px)` 压缩网格/图例 |
| **开局就弹「解锁称号」** | 新一局点一下，蹦出「带他回家」 | 跨轮称号看 `career.sevenWa`，`createChar` 时 career 还没注入，第一步行动才判定 | `syncCareerAchievements()` 在 career 注入后静默标记，不写日志不弹窗 |
| **护身符写着 +8 幸运实际为 0** | 背包里放着护身符，属性没变 | `gearBonus` 只扫 `c.equip`，护身符是背包道具 | 补扫 `c.bag` 里的 `lukBonus` |
| 战斗提示频闪 | 底部红字一直在闪 | `autoStep()` 只判血量不判精力，精力 0 时每 620ms 攻击一次，每次都失败并重弹同一句 toast | `toast()` 同句 1.2s 去重 + `autoStep` 判 `ep<2` 和 `ok:false` 就停 |
| PVP 一开打就报 cfg is not defined | 每次遭遇战都 500 | `resolveEvent` 里用了 `rollEvent` 的局部变量 `cfg` | 改成 `W.settings().pvpChance` |
| 打了人对方却没掉血 | 战斗正常结束，受害者毫发无损 | `startBattle` 重建 pending 时没带 `pvp`，结算时不知道打的是谁 | `pvp: p.pvp || null` |
| 排行榜历史 ID 重叠 | 历史行显示成「#8a111」，轮次号和名字压在一起 | `.rank-row .no` 固定 18px，`#83` 两个字符溢出 | 历史行加 `.no.hist`，`width:auto; min-width:42px` |
| 弹窗跑到屏幕上方 | 视觉不居中 | 上一轮为修双击把 `align-items` 改成 `flex-start` | JS 量一次高度算 `marginTop`：视觉居中且高度变化不重排 |
| **点「结算」永远失败** | 胜利画面点结算，看起来进了等待区，但一刷新又回到胜利画面 | `/api/action` 开头拦了 `round.state !== 'running'`，而七娃成功的那一刻本轮就已经 `endRound` 了 → `settle` 必然 400，前端 `catch` 吞掉 | 给 `settle` 开白名单，跳过这两个轮次校验 |
| **老存档让整页崩**（`Cannot read properties of undefined (reading 'name')`） | 删了 4 把低级武器后，老存档里还引用这些 id，战利品/开箱渲染直接炸 | `META.items[id]` 是 undefined | `game.js` 的 `doLoot`/`doBox` 里 `if (!ITEMS[it.id]) continue`；`app.js` 渲染 `if (!d) return ''`。**删物品永远不能只删数据** |
| **遭遇战操作 699ms 迟滞** | 每次攻击都卡半秒多 | 每个 action 都 readdir + 读全部 617 个存档（614 个是历史轮次遗留）+ 跑完整 `snapshot()` | `_nearby` 只在 move/explore 算 + `listSavesCached()` 1.5s 缓存 + 轻量属性计算 + 清旧存档 → 13ms |
| **改了代码浏览器还是旧的** | 反复说「还是没变化」 | `serveStatic` 没设缓存头，浏览器拿 304 | `Cache-Control: no-cache, no-store, must-revalidate` + `index.html` 里资源加 `?v=` |
| **自动战斗提示疯狂频闪** | 精力 0 时每 620ms 弹一次同一句话 | `autoStep()` 只看血量，精力 0 攻击必失败，每次都重弹 toast | `toast()` 同句 1.2s 去重 + `autoStep` 判 `ep<2` 或 `ok:false` 就停 |
| **打 PVP 对方不掉血** | 赢了但对方血没变 | `startBattle` 重建 pending 时没带 `pvp` 字段，`finishBattle` 拿不到对手 | `pvp: p.pvp || null` |
| **合成成功但数量是 0** | 日志「合成成功：牛仔裤 x0」，材料没了、东西也没进包 | `doCraft` 不看 `addItem` 的返回值，背包满时 `added=0` 照样写「成功」 | 扣完材料后先 `canFit()` 预检，放不下就把材料还回去并返回失败；`add.added < on` 再兜一层 |
| 战斗窗口立绘没有特效 | 左边头像会发光，战斗窗口里是死的 | 特效选择器全挂在 `.hero-stage` 上，而它只出现在 `#heroStage` | 战斗立绘容器也带 `hero-stage` 类 + 特效类由 `stageFxClass()` 统一生成 |
| 受击震动加了但没抖 | `hit` 类加上去立刻没了 | `renderBattle` 每回合整块重建弹窗，class 被新 DOM 冲掉 | 震动放在 `openModal()` 之后，用 `btLastHp/btLastFoeHp` 记基准血量 |
| 「背包放不下」提示满天飞 | 每条材料不足的配方后面都跟着这句 | 前端无条件拼了 `spaceOk ? '' : '（背包放不下）'` | 只在**材料/智力/等级都够、唯独差格子**时才提示 |
| 强化等级会丢 | +3 的武器一换装就变回 +0 | 换装/卸下走 `addItem(c, id, 1)`，那个只认 id | 全部改走 `addEntry(c, entry)`，它带 plus |
| 背包里同种装备被并成一行 | 匕首+0 和 匕首+3 显示成一个「x2」 | 合并键只用 `it.id` | 合并键改成 `id + '\|' + plus` |
| 丢弃 +3 却丢了 +0 | 想扔哪件扔不掉 | `removeItem` 按 id 从后往前拿 | 丢弃支持 `plus` 参数，按 id+plus 精确匹配 |
| 对敌道具的持续伤害把敌人耗死但没结算 | 敌人血到 0 了战斗还在继续 | `enemyTurn` 只处理玩家掉血，没人检查敌人 | 统一走 `runEnemyTurn(c)`，它检查 `e.hp <= 0` 并 `finishBattle` |
| **时间到后卡在游戏画面** | 底部只弹一句「对局已结束。」，人还在游戏界面，只能手动刷新 | `/api/state` 的 `hasSave` 只看 `stale` 和 `settled`，**没看轮次是不是已经结束**，所以刷新又回到游戏；`/api/action` 的 400 也没带 round | ① `hasSave` 加 `roundOver` 判断（`sevenwin` 例外，胜利画面要留给玩家点结算）② 400 返回带 `round` + `roundOver` ③ 前端 `roundOverTo()` 统一切结算，`pollState` / `chatPoll` / `tickRound` / `doAct` 四条路径都接上 |

---

## 11. 测试

> ⚠️ **测试脚本已从工作目录删除**（2026-10-23，用户要求只保留运行必需的文件）。
> 九套游戏测试还在 git 历史里，需要时恢复：

```bash
git checkout HEAD -- test.js test2.js test3.js test4.js \
  api-test2.js api-test3.js api-test4.js pvp-test.js ui-test.js
```

### 恢复后能跑的九套

| 脚本 | 查什么 |
|---|---|
| `test.js` | 数据完整性（64 区块 / 物品 / 配方引用 / 掉落引用）+ 20 局平衡模拟 |
| `test2.js` | 人质成功率 / 挑逗 / 成就判定 / BOSS / 无敌 / 金币 |
| `test3.js` | 状态道具 / 中毒掉血 / 冻结 / 七娃概率 / 刘颖概率 / 掉落引用 |
| `test4.js` | 耐久 / 改装 / NPC / 配方 / 精力 / 强化 / 射击模式 / 对敌道具 / 智力门槛 |
| `api-test2.js` | 轮次 / 商店 / 聊天 / GM / 交易 / 后台基础 |
| `api-test3.js` | 后台统计 / 批量操作 / 代发 GM / 设置项是否生效 |
| `api-test4.js` | NPC 接口 / 改装接口 / CSV 导出（含 BOM 校验） |
| `pvp-test.js` | 玩家对战：同区块遭遇 / 打伤对方 / 不同区块不触发 / GM 隐身 |
| `ui-test.js` | 界面回归（需 playwright-core + 本机 Chrome） |

### 另外三套（已丢失，需要重写）

`chat-test.js`（聊天冷却/净化）、`feature-test.js`（黑市/佣兵/战报）、`admin-test.js`（27 个后台接口体检）
当时写在临时目录、**没有进过 git**，瘦身时一并没了。要重写的话照这个结构：

```js
// 1) 起一个隔离容器（别在线上跑破坏性接口）
// 2) 注册临时账号 → 打接口 → 断言 → 删账号
```

**测试环境必须用容器**，原因见踩坑 #52（fsync 在 bind mount 上会挂死）和 `.dockerignore` 会挡掉测试文件。

## 12. 代码风格

- 缩进 2 空格，无分号强迫症但保持一致
- 函数短小，一个函数一件事；`doXxx()` 处理一个 action
- 返回统一 `{ ok: boolean, msg?: string }`，前端只 toast `msg`
- 日志用 `log(c, text, kind)`，kind ∈ `info|good|bad|warn|sys|move|flavor|ach`
- 中文文案要具体、有画面感，避免"你受到了伤害"这种干巴巴的表述
- 数值改动优先加进 `settings`，而不是改死值

---

## 13. 还没做的（别假装有）

- 剧情主线（现在是纯生存沙盒 + 两条特殊结局）
- 武器改装只做了三个通用槽，没有口径/枪管/弹匣细分
- 存档导入（只能导出）
- 多进程/集群（单进程单端口，`server.js` 直接用内存 Map 存 session）
- 移动端只做了竖屏适配，横屏未优化

## 14. 后台在哪

```
http://127.0.0.1:8123/admin.html
密码：jianghan（存在 store/admin.json，登录后可在「数值」页改）
```

五个页签：**玩家**（改单人全量状态+背包）、**轮次**（开局/结束/广播/历史）、**运行**（统计+区块热力+批量操作+聊天记录+导出 CSV）、**数值**（14 个可调参数）、**GM**（命令手册+代发+绑定）。

GM 权限是**账号级**的，绑了才能在游戏聊天框用 `@//gm/` 命令；管理员不需要绑定也能在后台「GM」页代发。
