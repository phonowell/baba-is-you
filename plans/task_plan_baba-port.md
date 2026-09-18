# 从 ../baba（Rust 前身）吸收实现与数据

## 目标
把前身项目中优于现状的部分移植到本项目：

1. **ASCII 关卡格式**：`src/logic/parse-ascii-level.ts` 兼容 Rust 文本格式（图例、`x on y` 叠放、大写=文本、unicode 字形表、`---` 分层、`right pad`），输出 `LevelData`
2. **关卡数据移植**：`../baba/levels/**/*.txt` → `levels/`（纯数据拷贝，含 index.txt 地图文件备用）
3. **Golden replay 回归**：`../baba/goldens/*.ron.br` 提取输入序列 → 用我们引擎回放 → 通关者写入 `goldens/*.json`（每步状态快照）；`src/logic/goldens.test.ts` 全量回放比对
4. **simulate 支持 ASCII 关卡**：`pnpm simulate --ascii levels/xxx.txt rrr`
5. AGENTS.md 目录结构同步

## 映射规则
- `goldens/{N}-{r}` ↔ `levels/{N}-*.txt`（顶层世界）
- `goldens/{S}/{N}-{r}` ↔ `levels/{S}-*/{N}-*.txt`（子世界，N 可为 `extra-M` 或字母）
- 输入编码：u/d/l/r/w（wait）/z（undo=弹历史栈）

## 不移植（记录原因）
- 被否决规则文本打叉渲染：需 Rule 携带 sourceCells，改动面大 → 后续单独做
- Overworld-as-level（Level/Cursor 实体机制）：需新实体类型 → 后续
- 调色板/sprite 变体：3D 渲染体系不同 → 后续再说

## 状态
- [x] parse-ascii-level + 测试（10 例，`src/logic/parse-ascii-level.test.ts`）
- [x] 关卡文件拷贝（`levels/` 102 个，95 个可解析；7 个 index.txt 大地图因 Level/Cursor 实体跳过）
- [x] `src/logic/replay.ts`（u/d/l/r/w/z 编码、serializeState、replayLevel，语义与 CLI 一致）
- [x] `scripts/port-rust-goldens.ts` + `goldens/`：85 条前身通关录像全部通关并落盘
- [x] `src/logic/goldens.test.ts`（85 条逐快照断言，全部通过）
- [x] `scripts/diff-rust-golden.ts`：逐屏比对 rust 录像与我们引擎（支持 recorded-layout 兜底）
- [x] `pnpm simulate --ascii <file>`；AGENTS.md 目录结构已同步；`pnpm check` 全绿（271 tests）

## 语义对齐修复（回放驱动排查，85/85 逐屏一致）
1. `step()` 的 `changed` 改为净结果语义（对比输入/输出 items），对齐 rust `screen != history.last`
2. 过期关卡兜底：`levelFromScreen()` 从录像首帧重建 LevelData，布局签名不一致时采用 recorded layout
3. `AND` 继承运算符：`X IS A AND HAS B` / `X IS A AND IS B` 复用同一主语（`rules-subjects.ts`/`rules.ts`）
4. HAS 生成物继承被删实体朝向（`appendHasSpawns` 移除 preserveDirection 开关）
5. `x is x` 否决该实体全部变身（`resolve-transforms.ts`，含 `x is all` 且 x 在场的情形）
6. 否定主语（`NOT X IS ...`）只匹配非文本实体（`rule-match.ts`）
7. mover 收集改为行主序（y,x），对齐 rust 格点遍历（`move-single.ts`/`phases-movement.ts`）
8. replay 输入不门控：lose 后 MOVE 照常推进（rust 无 lose 概念）
9. tele RNG 逐位移植 oorandom 11.1.3（u64 PCG-XSH-RR + Lemire rand_range），种子 = turn+1（= rust history.len()）
10. `applyShift` 按 float 层分组（`splitByFloatLayer`）：地面 shift 不搬动漂浮文本（5/6-0）
11. `canMove` 依赖链：stop/pull 阻挡者若本身是本阶段 mover，则递归求其 canMove（`WALL IS YOU`+`WALL IS STOP` 整排可走，0-1）

## 后续可做（本次未做）
- 逐 id 的 walk-cycle 动画推导（state diff → 计数器 %4），契合 3D 按需渲染约束

---

# 第二批：Overworld / 否决规则标记 / 原版调色板

## 前身实现要点（已调研）
- **Overworld**：目录即子世界（`index.txt`=地图，`LevelGraph` 递归）；`Level(LevelName)` 实体当入口（Number/Letter/Extra/SubWorld/Parent），`Cursor` 运行时放在 `place_cursor`（返回时放在刚完成的关卡图标上，否则 `•` Parent，兜底 `Number(0)`）；step 内独立 "move cursor" 阶段（在 move-you 之后、move-move 之前）：向输入方向走一格，仅当目标格含 `line` 或 `level` 实体；`Enter` 是会话级输入：光标格内有 Level → 进入（Parent=弹栈返回）；Win 也返回父图
- **否决规则打叉**：`scan_rules` 记录每条规则的文本格坐标；`partition_overridden_rules` = (a) 谓词否定否决：`X IS NOT P` 否决同主语 `X IS P`，`NOT A IS NOT P` 否决 `B IS P`(B≠A)；(b) `x is x` 否决该主语全部非同一变身；overridden 格集 − active 格集 → 打红色 X
- **调色板**：`palette = name`（默认 default）；`+ <glyphs> = cx,cy` 覆盖名词实体色；`+ "<glyphs>" = a,b,c,d` 覆盖名词文本 [inactive,active] 色；`#[props]` 表 = (obj cx,cy, 文本 inactive cx,cy, active cx,cy, sprite variant)；文本按 active（处于生效规则中）取不同色 —— PNG 实体不可得（原版权素材，../baba 仓库亦无），只能内置坐标→RGB 表

## 计划
- [x] **P1 解析层扩展**：`types.ts` 加 `LevelName`/`LevelItem.levelTarget`/`LevelData.meta`；`parse-ascii-level.ts` 支持关卡图标字形（0-9/𝟎-𝟗/𝟙-𝟞/𝔸-𝔼/•）、`map N icon` 图例、`palette`/`background`/`+` 元数据 → 102 个关卡全部可解析（含 7 个 index.txt）
- [x] **P2 光标与会话逻辑（纯 logic）**：`src/logic/overworld.ts`（placeCursor/moveCursor/resolveEnterTarget/session 栈）；step 管线插入 `cursor-move` 阶段（player-move 后、auto-move 前）；单测
- [x] **P3 Overworld 驱动（IO 侧）**：`src/cli-map.ts`（`pnpm map` 交互入口：levels/ 图加载、回车进入、胜利返回父图光标落完成关）；`simulate --ascii` 支持 `e`=enter/`b`=leave 输入 + 自动建图；地图含 cursor 时不判 lose（装饰性 `BABA IS YOU` 文本不再锁死光标）
- [x] **P4 否决规则标记**：`rules.ts` 产出带 cells 的 `RuleInstance`（`collectRules` 语义不变）；`src/logic/rules-override.ts` 移植 partition → `collectTextRuleMarks`/`collectOverriddenTextIds`；CLI 渲染：overridden 文本红色+删除线（`ANSI_OVERRIDDEN`），Web/3D 同语义（`cardSpecForItem` overridden 分支 + 纹理划线）
- [x] **P5 调色板**：`src/view/palette.ts`（17 个原版调色板 7×5 hex 网格——来自 babaiswiki 坐标表；`NOUN_COORDS` 移植 rust `#[props]`，`WORD_COORDS` 补全非名词词）；`meta.palette`/`+` 覆盖贯穿 LevelData→GameState；`render-helpers` 文本按名词+active 状态着色、对象按坐标着色、关卡图标/回退码也可调色
- [x] **P6 收尾**：`pnpm check` 全绿（lint+type-check+292 tests）、`pnpm build` 通过、85/85 rust golden 复扫逐屏一致、AGENTS.md/本计划更新

## 边界
- Web/3D 侧已接否决打叉（纹理划线）；调色板坐标表在 `src/view/palette.ts` 单一事实源，3D 粘土配色暂保留原程序化调色（数据已就绪，接色是后续小改）
- goldens 不受影响（rust 录像不含 Enter/地图导航）
- 不改语义：cursor 阶段只在有 cursor 实体时生效，普通关卡零影响
