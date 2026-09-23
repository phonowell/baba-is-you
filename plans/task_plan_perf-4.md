# 无损性能优化 · 第四轮（条件/规则求值 + fall 板面复用 + 启动惰性解析）

前三轮已落地（`task_plan_perf_lossless.md`、`task_plan_3d-perf.md`、`task_plan_perf_lossless-2.md`）。本轮基于新的 CPU profile + 逐阶段插桩数据，目标是**条件求值的路径复杂度**与 **fall 移动的重复建板**。

## 基线（M4 / tsx，逐阶段插桩 `tools-out/bench-pipeline.mts` + 部件 `bench-frame.mts`）

| 关卡 | ms/step | 热点 |
|---|---|---|
| 399 BABA INVADERS (335 items / 52 rules) | **5.0** | 阶段合计仅 ~2.4ms；frame 管线 ~2.6ms：`applyProperties` 0.34×2、`checkWin` 0.47、`collectRuleRuntime` 0.24；阶段：interactions 0.58、shift 0.48、auto-move 0.42、gravity 0.40 |
| 106 HEAVY CLOUD | ~1.0 | gravity 0.40 |
| 419 GARDEN? | 1.03 | transform 0.27 |
| 518 FALLEN WORDS | 0.87 | gravity 0.70 |
| 313 SIDEWAYS FIREPLACE | 0.76 | gravity 0.56 |

关键发现（决定改什么）：

1. **`x without y` 条件是 O(items²)**：`matchesWithout` 每次调用全扫 `context.items`；`group is nudgedown <without book>` 这类 wildcard 规则对每个非 text item 都评估 → 330×330 ≈ 109k eval/applyProperties。
2. **`resolveLevelPropsGlobal` 是 O(边框格 × 规则 × 条件)**：有任一条件 level 规则就对 ~98 个边框格各评全部条件规则；`level is weak <without rocket>` 的 `without` 与位置无关却逐格重扫 → checkWin/interactions/shift 三处各 ~0.4ms。
3. **`resolveEmptyPropsByCell` 每次调用重算**：传入 context 时占用判断本就来自冻结的 `context.byCell`，同一 runtime 内结果不变，却每 `moveItems`/`moveItemsBatch`/stage 重算。
4. **applyFall 每格下落 = 一次完整 `moveItems`**（克隆+census+grid+eats ≈ O(items×4)）：fall 关卡里 10–30 格下落 → 0.4–0.7ms。
5. **applyShift 调两次 `resolveLevelPropsGlobal`**（'shift'/'float' 各一次），且 `steered` 对已属私有克隆的 `multiItems` 再克隆一次。
6. **`rollCondition`/`chill`/`empty` 种子哈希先拼字符串**再逐 charCodeAt —— 可在不分配的情况下按同一字节序列喂 FNV-1a。
7. **`applyTransforms` 等仍是 O(items × 桶内规则)**：每 item filter + `resolveRuleTargets` 双 Set 分配（B7 延续项）。
8. 启动 `levels.map(parseLevel)` 566 关 = 18.2ms；title-only 解析 0.2ms（已实测 0 mismatch）。

## 本轮改动（按 ROI 排序，全部行为不变）

### S1 规则求值路径（低风险，先行）

- [x] **W1 `matchesWithout` 每-context 记忆化**（`rule-match.ts`）：`without` 语义 = "无其他 unit 满足对象测试"。按 `(object, objectNegated)` 缓存 `{count, soleId}` —— count=0 → 全真；count=1 → 仅该 matcher 自身为真；≥2 → 全假。数学等价，O(items²)→O(items)。context 生命周期=一次规则 pass，安全。
- [x] **W2 `resolveLevelPropsGlobal` 重构**（`step/shared.ts`）：条件按位置无关性分流——`idle/powered*/without/facing(仅方向)` 在 (0,0) 评一次即定案；位置相关条件逐边框格评估，object 已定案即跳过，pending 全决提前 break。`unconditionalNo` 种子保证无条件否定逐格否决语义。
- [x] **W3 `resolveEmptyPropsByCell` 每-context 缓存**（`empty.ts`）：`WeakMap<RuleMatchContext, Map>`，`context.rules === rules` 校验防误命中；调用方全只读（已核实 11 处）。`resolveActiveEmptyProps` 顺带受益。
- [x] **W4 `rollCondition` 免分配哈希**（`rule-match.ts` + `empty.ts` + `phases-movement.ts` chill）：`fnvChar/fnvInt/fnvText`（`helpers.ts`）按同一字节序列喂 FNV-1a（含 `-` 负号与十进制数字逐位），不建字符串。字节级一致 → 回放决定论不变。
- [x] **W5 `applyShift` 去重**（`phases-movement.ts`）：`resolveLevelPropsGlobal` 单次（仅 levelDir 存在时），'shift'/'float' 同读；steer 阶段就地改 `multiItems`（元素全为本函数私有克隆或 batch 新对象）；`levelHeldIds` 在全部 level 规则位置无关时共享一次 `resolveLevelProps`。

### S2 主语索引扩展（B7，中风险）

- [x] **W6 非 property 桶的主语索引**（`rule-match.ts` `subjectRuleCandidates`）：`{byName, text, wildcard}` + 按名合并缓存（源顺序保持——transform 首个变体/targets 顺序依赖）。消费方：`applyTransforms`（is/become/selfDeleted/negated 四处）、`spawn-by-rule`(make/write)、`appendHasSpawns`、`interactions`/`move-core` eat 循环、`fearDirection`/`followAim`。
- [x] **追加：`applyProperties` 无条件/条件拆分**（`resolve.ts`）：无条件规则按 (isText,name) 缓存 yes/no 基线；条件规则独立分区逐 item 评。旧的「有任一条件规则→全量逐 item」回退路径消除。

### S3 fall 板面复用（较大，隔离做）

- [x] **W7 `applyFall` 板内开销**（`phases-movement.ts` + `move-single.ts`）：
  - `emptyPropsByCell` 已由 W3 per-context 缓存天然共享；
  - `level is hold` 逐格解析在位置无关时提升为单次（`isLevelConditionPositionFree`，与 applyShift 同模式）；
  - 下落循环 `current.find(id)` ×2/格 → 每 check-entry 一次 find + 链式位置跟踪（entry 间其他 unit 的推动会改写位置，故按 entry 重读）。
  - **未做**：`moveItems` 每次调用整板克隆+census 重建（拆分三层共享板的完整重构）——对 move-single 引擎侵入大、行为风险高，留作下一轮在 fall 单侧验证后推广。

### S4 Web/UI（小而独立）

- [x] **W8 `renderRulesListHtml`**（`render-html.ts` + `app-game-view.ts`）：拆出 `renderRulesLinesHtml`，`renderRules` 每帧只跑一次（diff 与 innerHTML 复用同一批行）。输出逐字节不变。
- [x] **W9 关卡惰性解析**（`app.ts`）：`levelData` 为 Proxy 惰性数组——索引首访 `parseLevel` 并回填槽位，`length`/迭代语义不变；菜单标题走 `parseLevelTitle`（同语法轻量扫描，566 关 0 mismatch 已实测）。`env.levels`/`campaignLevels`/预览全部只经索引访问（已核实），构建期 `bindGoldensToLevels` 不受影响。

## 结果（同插桩脚本；负载 ~3.5 时绝对值整体 ×~1.8，取低载运行）

| 关卡 | 基线 | 本轮 |
|---|---|---|
| 399 BABA INVADERS | ~5.0ms/step | **~2.5ms/step**（interactions 0.58→0.13、shift 0.48→0.01、auto-move 0.42→0.26、gravity 0.40→0.34、make 0.07→0.06） |
| 106 HEAVY CLOUD | ~1.0 | ~0.64 |
| 419 GARDEN? | 1.03 | ~1.0（transform 阶段 0.27→0.18） |
| 518 FALLEN WORDS | 0.87 | ~0.84 |
| 313 SIDEWAYS FIREPLACE | 0.76 | ~0.66 |
| 103 CONNECTOR | ~0.55 | ~0.3（负载下实测 0.65） |
| 启动 parseLevel ×566 | ~18-38ms | 菜单路径 ~0.2ms（title 扫描）；整板解析推迟到选关/预览 |

验证：`pnpm check`（lint+type-check+888 tests）全绿、`pnpm build` 通过、goldens 回放全过。

## 不做/延后

- moveItemsBatch 多轮（still_moving/fear/shiftCounts）共享板：同构于 W7 但多 mover、轮间规则互作面更大，本轮先验证 fall 单侧路径再推广。
- B6 扁平索引（Int32Array）：跨层大改，收益需重测。
- B9 InstancedMesh：架构级视觉改动。
- C10–C14 渲染微优化：runtime 已足够瘦，无新证据。
- D16 之外的 store/Undo 历史 O(n) 拷贝：量级小。

## 验证

- 每项落地后跑 `pnpm test`（逻辑改动）+ 增量 bench；全部完成后 `pnpm check` + `pnpm build`。
- 基准复测同一插桩脚本：预期 BABA INVADERS 5.0→~2.5ms、fall 关 -30~50%、GARDEN transform 归零化。
- goldens 回放（`pnpm test` 内含）为语义等价主证据。
