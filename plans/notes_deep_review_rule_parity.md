# Notes: Deep Review Rule Parity

## Focus
- 仅关注规则一致性，不做范围外重构。
- 以 `../baba/src/game.rs` 作为可核对语义参照。

## Fixed
- `NOT` 语义
  - 由“补全集展开”改为 yes/no 约束求值。
  - 支持主语侧 `NOT`（`NOT BABA IS YOU`）与谓语侧 `NOT`。
- `PULL` 前向阻挡
  - 在可移动判定中将前方 `PULL` 纳入阻挡条件（非 push/swap 时阻挡）。
- `TELE`
  - 传送阶段后移到交互删除后。
  - 改为按回合 seed 的随机目标选择，不再固定循环。
  - 不再按对象名分组；改为 tele pad 集合。
- `SHIFT`
  - 调整同格多 shift 的推进逻辑，使 shifter 之间也可互推（接近参照实现）。

## Added tests
- `src/logic/rules.test.ts`
  - NOT predicate parsing
  - NOT subject parsing
- `src/logic/resolve.test.ts`
  - identity transform precedence
  - NOT transform constraints
  - transform-to-empty + HAS drop
- `src/logic/step.test.ts`
  - NOT runtime exclusion behavior
  - pull-front blocking behavior
  - tele cross-type coverage

## Verification
- `pnpm test` pass (`30`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)

## Round 2 Fixes (Official Step Order)
- `step` 执行顺序对齐原版
  - YOU 移动 -> MOVE 移动 -> SHIFT 移动 -> 重扫规则 -> 方向旋转 -> 变形 -> 删除交互 -> TELE -> WIN 判定。
- `MOVE` 语义修正
  - `UP/RIGHT/DOWN/LEFT` 不再触发自动移动；仅 `MOVE` 触发自动移动。
  - `MOVE` 受阻时同回合翻转并重试一次；按回合初始朝向仅处理一次，避免重复二次移动。
- 方向属性语义修正
  - `UP/DOWN/LEFT/RIGHT` 改为旋转阶段生效，优先级按原版循环顺序（最终 `RIGHT` 覆盖）。
- 删除阶段语义修正
  - 按同层原始集合计算删除并求并集，避免“先删后算”导致的 `OPEN/SHUT` 漏删。
  - 顺序与原版一致（sink -> defeat -> melt -> open/shut）。
- 移动阶段碰撞语义修正
  - 支持 `OPEN` 与 `SHUT` 在移动判定中直接相互销毁（含 `SHUT+STOP` 阻挡场景）。
  - 移动阶段销毁同样触发 `HAS` 掉落，与删除语义保持一致。
- 回合内规则快照修正
  - 交互/传送/胜负判定使用“重扫后快照规则”，不在本回合中途再次重扫后立刻生效。

## Added tests (Round 2)
- `src/logic/step.test.ts`
  - RIGHT 属性不触发自动移动（无 MOVE）
  - 本回合新形成的 `IS MOVE` 下回合才开始自动移动
  - 变形在 MOVE 之后执行（新变成 MOVE 的对象本回合不自动移动）
  - MOVE 受阻后同回合翻向并重试
  - OPEN 撞 SHUT+STOP 的移动阶段销毁
  - OPEN/SHUT 移动阶段销毁 + HAS 掉落

## Verification (Round 2)
- `pnpm test` pass (`36`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)

## Round 3 Fixes (Movement/Teleport Parity)
- `OPEN/SHUT` + `PUSH` 边界修正
  - 当 mover 因 `OPEN/SHUT` 在移动阶段销毁时，不再强制推进被阻挡的 `PUSH` 目标。
- `TELE` 顺序修正
  - pad 扫描顺序改为按棋盘坐标顺序（`y,x`），不再依赖实体插入顺序。
  - traveler 选择顺序按格子+浮层扫描，贴近原版 `select` 语义。
- `TELE` 随机源修正
  - 替换为 `oorandom::Rand32` 同步算法（同 seed 同输出）。

## Added tests (Round 3)
- `src/logic/step.test.ts`
  - OPEN/SHUT 销毁不强推被阻挡 PUSH
  - TELE pad 扫描顺序为棋盘序
  - TELE RNG 与官方 oorandom 在 turn 0 对齐

## Verification (Round 3)
- `pnpm test` pass (`39`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 4 Fixes (Layer/Timing Parity)
- `FLOAT` 分层验证补齐
  - WIN/SINK/TELE 均按浮层分离，不跨层交互。
- `SHIFT` 时序验证补齐
  - SHIFT 使用 shifter 当前 `dir`（旋转前），不直接使用本回合 `UP/DOWN/LEFT/RIGHT` 属性。

## Added tests (Round 4)
- `src/logic/step.test.ts`
  - FLOAT 分层下 win 不触发 / 同层触发
  - FLOAT 分层下 sink 不触发
  - TELE 仅匹配同浮层 tele 源
  - SHIFT 与 rotate 的先后时序

## Verification (Round 4)
- `pnpm test` pass (`44`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 5 Fixes (WEAK Parity)
- 新增 `WEAK` 属性到规则系统与渲染字典。
- 移动阶段 `WEAK` 行为对齐
  - 非 MOVE 箭头受阻时，WEAK 物体在移动阶段销毁。
  - MOVE 阶段箭头受阻时，WEAK 不在该阶段销毁（仅翻向/停留）。
  - 被推目标若为 WEAK 且不可继续推动，会先销毁并允许前序推动继续判定。
- 删除阶段 `WEAK` 行为对齐
  - 同浮层同格存在复数物体时，WEAK 物体在删除阶段销毁。

## Added tests (Round 5)
- `src/logic/step.test.ts`
  - WEAK YOU 受阻即销毁
  - WEAK MOVE 受阻不销毁
  - WEAK 与其他物体同格时销毁

## Verification (Round 5)
- `pnpm test` pass (`47`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 6 Fixes (Batch Movement Parity)
- `MOVE/SHIFT` 同批求解对齐
  - 新增 `moveItemsBatch`，按同一批 movers 统一求解（pending/moving/stopped 状态），不再按方向分批推进。
  - 对齐官方队列语义：push 依赖、同向依赖等待、MOVE 受阻翻向重试、pull 补充入队。
- `WEAK` 在批处理中的一致性
  - 非 MOVE 箭头受阻时 WEAK 销毁；MOVE 箭头受阻仅翻向/停留。
  - push 链路中 WEAK 受阻可销毁并继续前序判定。

## Added tests (Round 6)
- `src/logic/step.test.ts`
  - MOVE 对向 PUSH movers 同批求解
  - SHIFT 对向 PUSH movers 同批求解

## Verification (Round 6)
- `pnpm test` pass (`49`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 7 Fixes (Transform/HAS Parity)
- 修正 `transform -> empty` 与 `HAS` 关系
  - 对齐官方：变形阶段（`IS noun`）删除不触发 `HAS` 掉落。
  - `HAS` 掉落仅在移动阶段 tombstone 与删除阶段 flush 触发。

## Added tests (Round 7)
- `src/logic/resolve.test.ts`
  - `applyTransforms` 在 `X IS EMPTY` 时不产生 `HAS` 产物

## Verification (Round 7)
- `pnpm test` pass (`49`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 8 Fixes (MOVE/SHIFT Dir Writeback Parity)
- `MOVE` 朝向写回修正
  - 批处理移动中仅对 `status=moving` 的实体写回 `dir`。
  - 移除“所有箭头统一写回 dir”的行为，避免 MOVE 受阻翻向但未移动时错误改向。
  - MOVE 受阻翻向重试不再单独标记 `changed=true`（无棋盘变化时保持不变）。
- `SHIFT` 朝向时机修正
  - 对齐原版：在入队前先将被 SHIFT 影响实体的朝向写为 shifter 朝向，再执行批移动。

## Added tests (Round 8)
- `src/logic/step.test.ts`
  - WEAK MOVE 受阻时保持原朝向（不被翻向写回）
  - MOVE 双向受阻时保持原朝向且 `changed=false`
  - SHIFT 受阻仍先写入朝向

## Verification (Round 8)
- `pnpm test` pass (`51`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 9 Fixes (Single-Entity Interaction Parity)
- 删除阶段单体语义修正
  - 去除 `layer.length <= 1` 的全局短路。
  - 保留仅“占位交互”需要 `>1` 的约束：`SINK`、`WEAK`。
  - 对齐原版的同体交互：`YOU+DEFEAT`、`HOT+MELT`、`OPEN+SHUT` 单体也会删除。
- 胜利判定修正
  - `checkWin` 不再要求同层至少两个实体；同体 `YOU+WIN` 直接判胜。

## Added tests (Round 9)
- `src/logic/step.test.ts`
  - same object: `YOU+WIN` -> win
  - same object: `YOU+DEFEAT` -> lose
  - same object: `HOT+MELT` -> delete
  - same object: `OPEN+SHUT` -> delete

## Verification (Round 9)
- `pnpm test` pass (`55`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 10 Fixes (Queue Resolve Priority Parity)
- `moveItemsBatch` 队列判定优先级修正
  - 对齐官方 `move_things`：当同一箭头同时命中“依赖未解（pending same-dir）”与“确定阻挡（stop/pull/edge）”时，优先走阻挡分支。
  - 实现上将 `blocked` 分支提前于 `defer` 分支，避免错误等待导致的行为漂移。

## Added tests (Round 10)
- `src/logic/step.test.ts`
  - `step resolves blocking before pending dependency when both apply`
  - 场景覆盖：push 依赖链 + 同格 pull 阻挡，验证阻挡优先语义（WEAK YOU 会立即被判阻挡移除）。

## Verification (Round 10)
- `pnpm test` pass (`56`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 11 Fixes (NOT TEXT Subject Parity)
- `matchesSubject` 语义修正（`resolve.ts` + `step.ts`）
  - 对齐官方 `subject_match(No(Text))`：`NOT TEXT` 匹配所有非文本对象。
  - 之前实现会把 `NOT TEXT` 误判为“全不匹配”，导致 `NOT TEXT IS ...` / `NOT TEXT HAS ...` / `NOT TEXT IS noun` 失效。

## Added tests (Round 11)
- `src/logic/step.test.ts`
  - `step applies NOT TEXT subject to all non-text objects`
- `src/logic/resolve.test.ts`
  - `applyTransforms applies NOT TEXT subject to non-text only`

## Verification (Round 11)
- `pnpm test` pass (`58`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 12 Fixes (OPEN/SHUT + PULL Batch Parity)
- `moveItemsBatch` 中的 tombstone 流程修正
  - 对齐官方 `move_things`：mover 在目标格触发 `OPEN/SHUT` 销毁后，不应提前跳过；仍需继续执行该箭头的后续判定。
  - 这样可保留官方行为：若无阻挡，销毁中的 mover 仍会触发其背后 `PULL` 物体入队并移动。

## Added tests (Round 12)
- `src/logic/step.test.ts`
  - `step MOVE open-shut destruction still pulls object behind`
  - 场景覆盖：`MOVE+OPEN` 撞 `SHUT`，mover/target 同步销毁，同时背后 `PULL` 物体仍被连带移动。

## Verification (Round 12)
- `pnpm test` pass (`59`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 13 Fixes (Multi-SHIFT Dir Cascade Parity)
- `applyShift` 语义修正
  - 对齐官方 `move shift` 实现：同格多 `SHIFT` 时，后续 shifter 读取的是“已被前序 shifter 改写后的朝向”，而不是原始朝向。
  - 改为在 `shiftedItems` 上顺序写回朝向并即时读取，再收集 movers；避免使用静态快照方向。

## Added tests (Round 13)
- `src/logic/step.test.ts`
  - `step SHIFT uses updated shifter dir within same cell chain`
  - 场景覆盖：两个朝向相反的 shifter 同格 + 前方 STOP，验证第一个 shifter 方向主导并级联到后续 shifter。

## Verification (Round 13)
- `pnpm test` pass (`60`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`

## Round 14 Fixes (Rule Scan Segmentation Parity)
- `collectRules` 链式分句修正
  - 修复场景：`baba and keke is rock and wall is door`。
  - 之前会错误生成 `rock is door`，与官方 `scan_rules_line` 不一致。
  - 新逻辑在主语侧 `and` 继续解析时，遇到前序 `is/has` 边界会截断延伸，保留正确的“最近主语”语义。

## Added tests (Round 14)
- `src/logic/rules.test.ts`
  - `collectRules does not carry predicate list into following IS subject`

## Verification (Round 14)
- `pnpm test` pass (`61`)
- `pnpm type-check` pass
- `pnpm lint` pass
- `pnpm import-levels:jeremy` pass (`102`)
- `levels.length` = `102`
