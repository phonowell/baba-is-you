# 抹平官方数据差距 — 分析与实施计划

数据源：`data/Baba Is You/Data/`（完整官方 dump：Worlds/{baba,new_adv,museum,debug} + values.lua tileslist + Editor/editor_objectlist.lua）。

## 差距清单（分析结论）

### A. 导入管线正确性
- 源目录失效：工具指向 `data/baba`（旧 dump），新数据在 `data/Baba Is You/Data/Worlds/*`。
- tile→对象解析模型错误：新存档格式中 `objectNNN` 仅是槽位，对象身份 = `[tiles]` 段 `objectNNN_name` 覆盖 > values.lua canonical tileslist > currobj 首个 name。现有实现按 tile 直取 currobj name，遇到槽位复用即错：
  - baba `104level`（tectonic movements）：fungus/hand 实为 cliff/rubble（144 块 tile）
  - new_adv 4 关（dreamwall/hedge、door2/ladder、float/auto 歧义）
  - museum 2 关（rocket/tree、pipe/hedge、reed/tree、bog/lava）
- `VANILLA_OBJECT_TILES` + `DEFAULT_OBJECT_ASSIGNMENTS` 为手抄表；values.lua tileslist（156 槽位）才是单一事实源。

### B. 关卡覆盖
- 已导入：baba 268/271（18 地图），3 关被 missing-you 过滤（155 metacognition、252 ba、253 ab —— 均为结尾序列关）
- 未导入：new_adv 184 关 + 8 地图（root=41level "New adventures!"）、museum 111 关 + 4 地图、debug 4 关（开发测试，排除）

### C. 词汇/语义（官方 editor_objlist type 分类）
- 动词(1)：is/has/make/eat/write/fear/follow/mimic/play/become —— 已全部接入：
  - `follow`：朝最近目标移动，大轴优先（垂直方向平手优先）
  - `fear`：邻格存在畏惧目标时朝反方向逃（官方顺序：背向起旋转探测，取最大畏惧计数的首个方向）
  - `mimic`：`X MIMIC Y` 把主语为 Y 的全部非 mimic 规则复制到 X（`X MIMIC NOT Y` 为保护，阻止复制；条件取被复制规则自身条件，缺省回落 mimic 条件）
  - `become`：与 is-transform 共用变换管线，但 `X BECOME X` 不抑制其它变换（仅 is 的同名目标触发 veto）
  - `play`：纯音频词，解析进桶无运行时效果
- 属性(2)：已实现语义 word/safe/still/broken/3d/you2/bonus/end/done/power(1-3)/phantom/auto/chill/turn/deturn/locked*/fallup/fallleft/fallright/boom + 本批新增：
  - `nudge*`：固定方向自主移动（并入 auto-move 阶段）
  - `reverse`：翻转自身移动方向（you 输入、move/nudge/follow/fear 全部生效）
  - `hold`：承载同格同 float 层未自行移动的实体（move-single/move-batch 统一接入）
  - `back`：锚定 prop 首次生效时的格位，每回合回卷（Item.prevX/prevY 持久记忆，prop 消失时清除锚点）
  - `revert`：`X IS REVERT` = 变回原形（Item.originName 记忆，transform 首次改名时固化）
  - 其余（select/情绪词/颜色词）按惰性属性接入词表
- 前缀条件(3)：lonely/idle/often/seldom/powered(1-3) —— 已全部接入
- 中缀条件(7)：on/near/facing/without/nextto/facedby/seeing/above/below/besideleft/besideright/feeling —— 已全部接入
- 特殊名词：group2/group3 已接入；letter units（type 5，a-z/0-9/sharp/flat）无需改动即工作——作为普通名词解析、text 卡片按 `name.toUpperCase()` 渲染，`WRITE A`/`PLAY C` 均通（数字词沿用 `!` 后缀消歧）

### D. 元数据
- .ld 的 palette/music/subtitle/particles/specials/images/icons 基本全丢（level meta 仅存 title/size）

### E. 视觉
- 官方对象 ~160 个；我们像素 sprite ~35、glyph ~65。新对象需占位渲染 + 颜色（tileslist.colour）。

## 实施顺序

1. [done] canonical 对象表：import-official-levels-object-table.ts 直接解析 values.lua tileslist
2. [done] buildLevelTileMap = objectId 中心（[tiles] 覆盖 > canonical > currobj）；verify 三世界全绿（分歧均为合法覆盖）
3. [done] 多世界导入：566 关 / 30 地图；baba/106level、new_adv/41level、museum/85level 为根；missing-you 关卡保留（lose 需先有 YOU）
4. [done] 词表对齐官方分类：全部条件词 + 高频属性（见 §C）
5. [done] 语义补齐：word/safe/still/broken/3d/you2/bonus/end/done/power*/phantom/auto/chill/turn/deturn/locked*/方向 fall/boom/nudge*/reverse/hold/back/revert
6. [superseded] app 多 campaign overworld（levels-maps/worlds/Tab 切换）已按需求移除——回滚为扁平菜单选关（menu|game，`select-menu-level`/`enter-game`/`return-to-menu`）；overworld.ts/map-level.ts/levels-maps.ts/map-icons.ts/import-official-levels-maps.ts 已删除，cursor-move 阶段与 LevelIcon/levelTarget/meta.map 已清理；导入器仍解析地图文件用于校验但不再生成地图数据
7. [done] 动词 fear/follow/mimic/play/become + mimic 规则复制/保护 + letter units 验证 + icon 跨世界 fallback（museum/79level → new_adv/22level，unresolved=0）
8. [done] `LEVEL IS X` 全局语义（对照 blocks.lua "things" 循环重写——官方 level 是虚拟实体、按 float 层与全场单位接触，不是仅边框）：
   - `resolveLevelPropsGlobal`：无条件规则全局生效 + 条件规则按全部边框格 OR 求值（`level is weak without X` 等条件式已支持，覆盖 BABA INVADERS/SNAKEKE）
   - interactions：`level is defeat`→全场同层 you 死；`hot`→全场 melt 融；`open`/`shut`→全场对方解锁；`sink`/`boom`→清场；`weak`/`melt`/`open`+`shut` 配对/`x eat level`/`empty eat level`/`level is you`+`x is defeat`→destroylevel（lose）；`level is you`+`x is bonus`→拾取；`level eat x`→吞全场匹配单位（`level eat all`/`empty` 官方同为死分支）
   - win：`level is win/end/done`+（同层 you ∨ level-you ∨ empty-you）→win；`level is you`+`x is win/end`/`empty is win/end`→win
   - `level is hold`：边框单位钉住（positional，move-single/move-batch stillIds）；`level is float`/`safe` 全部门控
9. [done] `EMPTY` 伪单位（官方 unitid 2，每空格一个 mover）：
   - `empty is you/you2/3d`：按输入方向推挤目标格可推单位（move-single，reverse 看 `empty is reverse` 走对应 pass）
   - `empty is swap`：与目标格单位换位（空向单位滑=逆输入方向）
   - `empty is move/auto`：按 `empty is <dir>`/`empty follow x`（emptydir 逐格求向，follow 覆盖 dir 规则）自走推挤（auto-move 阶段）
   - `empty is still/sleep` 阻断；`empty is stop`/`push` 全局障碍语义已在移动引擎；`empty is win`+`empty is you`→win（checkWin）
   - `empty eat`（非 level 目标）/`empty is hide`/`empty fear` 官方同为死规则或纯视觉——保持 no-op 即忠实
10. [done] `LEVEL IS X` 视觉侧（官方 MF_scrollroom/maprotation 等效）：`GameState.levelOffset`（环形累计位移，步末由 `advanceLevelRoom` 按最终规则结算）+ `levelDir`（mapdir，默认 down）；`computeEntityBaseTarget` 按 offset wrap 渲染。you/you2 输入滚 1 格并转 mapdir；move/auto/chill/nudge*/fall* 自主滚动；`level is <dir>` 设 mapdir；`level is push/pull`（边框推/拉滚房间，位移差检测）；`level is shift`（全体单位沿 mapdir 移位）；`level is tele`（全体传送）。still/locked<dir>/reverse/sleep 齐备
11. 剩余（已确认的深水区，均为视觉/死规则/无消费端）：
   - 渲染侧房间旋转（maprotation 90/180/270°）：`level is right/up/left` 才有视觉旋转；接入需旋转整板+单位朝向，纯渲染工程
   - level meta：.ld `palette/music/subtitle/particles` 未导入（渲染端无 palette 消费，无音频引擎，属死数据）
   - `select` 属性：官方为 overworld 光标单位标记，我们的 `selector` spawn 已等价；导入地图无 `x is select` 规则
   - `empty is boom`/`empty is weak`/`empty is shut/open` 按格交互：官方存在但无导入关卡使用（BLOW THE CANDLES OUT 的 `empty is stop`、COMBINATION LOCK 的 `empty is push below` 已由全局近似覆盖）
   - `level is <名词>` 变换（`level is text`）：官方 transform 循环只迭代 units，level 不在其中——死规则
   - play 动词仅解析（音频无引擎）；level/empty 主体规则的逐格条件与官方 `testcond` 仍有近似差（border-OR vs 官方 unitid-1 全局）

## 验证
- `pnpm verify-levels:official`：0 unknown tile key；剩余 mismatch 均为合法 `[tiles]` 覆盖诊断
- `pnpm check` 全绿（500 tests）；`pnpm build` 通过；goldens 回放不受影响；29 个含 level/empty 规则的真实关卡冒烟 60 步 0 崩溃
