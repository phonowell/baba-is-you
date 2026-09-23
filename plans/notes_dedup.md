# notes_dedup — clone 盘点与处置

jscpd（min-lines 6 / min-tokens 60）+ 语义平行常量排查。✅=做 ❌=跳过(理由)

## A. logic
- ✅ helpers.ts 新增 `MOVE_DELTAS`+`ORTHOGONAL_DELTAS` 单一事实源；shared.ts re-export；
  rule-match 删 `ORTHOGONAL_DELTAS`(302)/`DIRECTION_DELTAS`(309)，empty 删 `EMPTY_LINE_DELTAS`(52) —— 三处同值平行常量
- ✅ shared.ts `hasYouLikeProp(props)`：5 处内联 `has('you')||has('you2')||has('3d')`
  （move-single:44, win:43/70/106, interactions:320）
- ✅ `LOCKED_PROPS` 上移到 shared.ts（canonical，Record<Direction,Property>）；move-core 删本地定义改 import；
  move-batch-runtime/move-single-runtime 的 LOCKED_PROPS import 改指 shared；shared 原 `LEVEL_LOCKED_DIRS` 删除并去 `as Property` 强转
- ✅ `NUDGE_DIRS` canonical 于 shared；`LEVEL_NUDGE_DIRS=Object.entries`；phases-movement `NUDGE_PROPS` 替换
- ✅ move-core.ts 新增：`collectMovementSets`（byId+prop 桶+movers+hasHolder）、`stripBlockedMoveProps`、
  `pinLevelHeldUnits`、`createEmptyPropLookup`、`appendMovementSpawns`、`markEmptyLandingSpecials`
  → move-single.ts / move-batch.ts / move-batch-apply.ts / move-single-runtime.ts 收敛
  ※ still/phantom/pin 的 swap 剥离在 batch 侧缺失——所有 swap 消费端（batch-runtime:302/448/556、batch-apply:130/149、
  move-core:296、mover 侧均不触达被剥 id）已独立检查 still/phantom/pinned，统一为「含 swap 剥离」观察等价
- ✅ move-single-runtime 内部 swapTargets 循环×2（510↔613）→ `applySwapTargets` 闭包
- ✅ empty.ts `toEmptyMatchContext`（268↔397 两处相同对象构造）
- ✅ step.ts `rebindRuntime`（rebindFrameWithSameRules↔refreshProperties，脏文件但只动该块）
- ✅ solve.ts `expandActions`+`admitVisited`+`solvedAt`：beam/bfs/layout 三份 expansion 机制收敛；
  续：`searchGuard` 统一 deadline 采样（1024 掩码）与 depth 终态/跳过策略，三个搜索驱动收敛
- ✅ helpers.ts `forEachDelta`+`NEIGHBOR_DELTAS`：empty.ts nextto/near/facedby 与 rule-match.ts
  facedby/nextto/near 五处邻域遍历统一（空格/单位域差异留在回调内）
- ✅ move-core.ts `openMovementSets`：collect→strip→pin 开场序列统一，move-single/move-batch 收敛
- ❌ empty↔rule-match 无参条件守卫（8 行）——3 个短判定的组合，提取谓词收益不抵间接层
- ❌ solve.ts 驱动循环体（frontier 初始化 + pop→expand→push 骨架，~16 行）——frontier 种类、
  目标判定、入队方式各自不同，属编排差异而非语义重复

## B. tools
- ✅ 新 `src/tools/cli.ts`：`argValue`/`numArg`/`walkFiles`/`runCliMain`
  迁移：solve-levels、import-solutions、import-official-levels(-sprites)、build-level-code-map、
  scripts/{port-rust-goldens,resnapshot-goldens,convert-ascii-levels}
- ✅ `slugify` 由 solve-levels export → import-solutions 复用（两副本逐字相同）
- ✅ `levelItemSignature`/`layoutSignature`/`normalizeLevelTitle` → logic/helpers.ts；
  goldens.test、solve-levels、app-golden-binding（itemSignature re-export 兼容 app-goldens）
- ✅ -binary.ts `croppedBounds`+`forEachBoardTile`：convert/verify 的裁边+双层遍历收敛
- ❌ import-solutions `normTitle`（保留 `?`，与 campaign normalize 刻意不同）

## C. scripts
- ✅ lib-rust-golden.ts 收 `layoutOf`+`findLevelFile`（port/diff 两副本）
- ✅ scripts/shared/pixel-sheet.ts：`createPixelSheet`+`drawSpriteFrame`；sprite-preview/sprite-zoom 收敛
- ✅ worktree/git-utils.js：`exitWith`/`ensureNoInProgressState`/`ALLOWED_BRANCHES`/
  `requireWorktreeBranch` 收敛（land/rebase 两副本）
- ❌ worktree 两脚本 parseArgs 循环骨架——flag 表不同（--plans-dir 仅 land），共享 spec 表属过度设计
- ❌ rules.ts 内部 clone——声明式规则表条目（数据非逻辑）
- ❌ strictLayoutSignature（scripts/lib-rust-golden）↔ layoutSignature（logic/helpers）——
  刻意不同：strict 含朝向（回放板面逐字比对），helpers 版朝向不敏感（golden 绑定）

## D. web（脏文件，只碰 clone 块）
- ✅ voxel.ts `paintedCells` → 复用 blit.ts `forEachPixel`
- ✅ board-3d-effects.ts `spawnRadialBurst` 参数化（SPAWN_PUFF_*/DESPAWN_POOF_* 常量族）
- ✅ board-3d-renderer-runtime.ts `nodeSpot`/`spotsOrCenter`（celebrationSpots↔ashSpots 尾段）
- ✅ style.css：铆钉 ::before 双选择器合并（475↔1042）；fullscreen primary 重申合并（413↔519、420↔526）
- ❌ CSS vendor 前缀对（-webkit-mask-image/mask-image）——必需
- ❌ CSS `.board::before/::after` mask 轴对调——公共头已合并，轴参数无 CSS 本地抽象可用
- ❌ CSS `@keyframes plaque-glow` 帧体重复——每帧须完整声明 animated 属性，仅外层 glow 变化
- ❌ voxelDrawRect↔frameContentDrawRect：Y 轴翻转不同域
- ❌ outcome-card/menu-preview 铆钉变体（top/color/glow 刻意不同）
- ❌ board-3d-effects spawnPuff/despawnPoof 薄封装——公共动词入口（调参表已收敛 spawnRadialBurst）
- ❌ input-web game/menu 前缀骨架（ctrl 检查+direction 查找+switch）——keymap 表全异，
  共享部分仅剩 4 行 prologue，包装收益为负
- ❌ objects-official.ts 像素数据内部重复——生成数据
- ❌ *.test.ts 内部/间 clone——测试夹具按用例组块；renderer-runtime.test.ts 为并行在途文件不动

## 终态
- jscpd 残留（非 test/data）：empty↔rule-match 守卫 1 对、rules 表 2 对、solve 驱动骨架 2 对、
  input-web 1 对、effects 封装 1 对、CSS 3 组、worktree parseArgs 1 对——均已记录为刻意保留
- 验证：tsc 全绿；oxlint 0 告警；tsx --test 898/898（含金标回放）
