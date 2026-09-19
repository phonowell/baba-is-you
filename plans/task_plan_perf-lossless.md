# Task Plan: 无损性能优化（逻辑 + 画面）

目标：在不改变玩法语义、回放确定性、渲染外观与生命周期的前提下削减每步/每帧成本。

## 实测基线（mid-state，100 步混合方向后）

| 关卡 | items | step() | collectRuleRuntime | applyInteractions | moveItems | applyProperties |
|---|---|---|---|---|---|---|
| 0-baba-is-you | 67 | ~78µs | ~18µs | ~0.8µs | ~12µs | ~2µs |
| 5-volcano | 192 | ~206µs | ~30µs | ~25µs | ~23µs | ~8µs |
| 6-off-limits | 153 | ~180µs | ~28µs | ~17µs | ~18µs | ~7µs |

另外：启动 `levels.map(parseLevel)`（566 关）≈ 21ms；`levelPushPullDelta` 每方向步 ~2-5.7µs 且无 `level is push/pull` 时纯浪费。

## 改动项

### A. 跨步规则源复用（最大收益）
- `GameState` 增加 `rulesSourceItems?: readonly LevelItem[]`——上一次 `collectRuleInstances` 的输入数组引用。
- `step()` 开头：若 `rulesSourceItems` 与 `state.items` 的**解析器可见子序列**（isText 或 `word` prop 单位，按序比较 id/name/x/y/isText）相等，则跳过 `collectRuleInstances`+partition+dedupe+mimic，直接 `createRuleRuntime(state.items, state.rules, …, state.overriddenTextIds)` + `applyProperties`。
- 同一判定也用于步内：`synchronizeStageFrame`/`keepFrame` 的 recollect 分支在可见子序列未变时降级为 rebind（`synchronizeStageFrame` 分支复制旧路径的 no-extras 行为，保持无损）。
- `StepFrame` 携带 `ruleSourceItems`；`resolveFrame` 设为收集输入；rebind/refresh 透传。
- `createInitialState` 记录 `transformResult.items` 为源；无 transform 时直接复用首个 runtime。
- 不变式：`collectRuleInstances` 在建网格前就跳过非 text 非 `word` 单位，普通单位移动/生成/消失不扰动已存规则。

### B. `level` 规则桶
- `RuleBuckets` 增加 `level: Rule[]`（`is-property && subject==='level' && !subjectNegated`）。
- `resolveLevelProps`/`resolveLevelPropsGlobal` 改收 `levelRules`；`advanceLevelRoom` 的方向扫描也用桶。
- `levelPushPullDelta`：桶中无任何 `object==='push'|'pull'` 时直接返回 null（省 beforeById + 全量扫描）。
- `checkWin`：无 level 规则时 level 段提前返回；`WIN_LIKE_PROPS` 数组外提。
- `moveItems`/`moveItemsBatch` 的 `hasLevelHoldRule`、`applyInteractions` 的 `hasLevelRules`、`applyShift`/`applyTeleport` 全部走桶。

### C. `applyProperties` 静态属性缓存
- `resolve.ts` 模块级 `WeakMap<Rule[], Map<string, Property[]> | null>`：无带条件的非-empty is-property 规则且无非否定 `all is group*` 时，props 是 `(isText, name)` 的纯函数，按名缓存并跨 rebind/跨步共享（同一 rules 数组引用）。
- 安全性：全仓无 `.props` 就地突变（已 grep 验证）；`empty` 主语永不匹配实体故其条件不取消资格。

### D. `applyInteractions` 单元格门控
- 入门扫描同时收集棋盘级 `presentInteractionProps`。
- 每 cell 先查 `list.some(item=>item.props.some(INTERACTION_PROPS))`；无交互 prop 且无 eat 目标（单层长度<2）直接跳过，省掉 `splitByFloatLayer` 分配与逐层扫描。
- 各 prop 检查以棋盘级集合做 O(1) 前置。

### E. `buildEntityViews` 单趟化
- 单 item cell 直接产出 view（跳过排序/索引图/concat）；多 item cell 保留排序但去掉两张索引 Map。

### F. `itemsWithMemory` 快速跳过
- 无 `back` prop 且无 `prevX/prevY` 时跳过 startPositions Map 与 map pass。

## 验证
- `pnpm check`：lint 0 错误 + type-check + **485 tests 全过**（含 goldens 全量回放——规则复用的主要回归锁）✅
- `pnpm build` ✅
- 新增测试（`step-pipeline.test.ts`）：
  - `step rule-source reuse stays transparent across unit-only turns`：有/无 `rulesSourceItems` 两条并行轨迹逐步 deepEqual。
  - `step re-collects rules when pushed text breaks a phrase`：推走 `stop` 文字后 `wall is stop` 立即失效。
- 基准复测（mid-state，`tools-out/bench-step.ts`）：

| 关卡 | step() 单步 | step() 空闲 | collectRuleRuntime | applyProperties |
|---|---|---|---|---|
| 0-baba-is-you | 78→42µs | 34→17µs | 18µs（仅文本变化时才付） | 2.1→1.1µs |
| 5-volcano | 206→113µs | 89→58µs | 30µs（同上） | 8.0→2.1µs |
| 6-off-limits | 180→97µs | 73→35µs | 28µs（同上） | 7.1→2.4µs |

- 阶段级：`applyInteractions` 17–25→1–16µs；`levelPushPullDelta`/`advanceLevelRoom` 无 `level is …` 规则时 ~0.02–0.08µs；`checkWin` 2–3→1.5–1.9µs。

## 已发现并记录但不改的行为问题
- `synchronizeStageFrame` 的 `recollect-rules` 分支未透传 `contextExtras`（idle/turn），与 `keepFrame`/`refreshProperties` 不一致——会让 `often`/`seldom`/`idle` 条件在步中 recollect 后按 turn=0/idle=undefined 评估。属行为语义问题，非无损优化范围，单独报告。
