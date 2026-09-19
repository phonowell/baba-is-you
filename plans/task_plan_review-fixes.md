# 审查问题修复计划

来源:open-code-review-delegate 全量审查报告(79 文件)。全部完成。

## 高 — 阻断 pnpm check
1. [x] `src/tools/solve-levels.ts:194` `readFileSync` → `await fs.readFile`(async 上下文,与 fs.promises 风格一致)
2. [x] `goldens/1/2-0.json` — 旧 inputs 在当前布局不再获胜;四策略均撞预算(bfs OOM、beam/wastar/greedy ~110-170k 扩张)。按 handoff 预案删除(goldens/1/ 下其余 12 个 fixture golden 保留),docs/solver-handoff.md 已记录决定

## 中 — 逻辑正确性
3. [x] `level is hold` 钉住自主移动:新增 `pinnedIds` 与 `still` 分离(still 允许自走,hold-pin 不允许)——move-single.ts mover 循环跳过、move-batch.ts 入 context 由 resolveBatchArrows 停 arrow
4. [x] `carryHeldRiders` 加 `uncarryable` 参数,调用处传 `stillIds`(覆盖 prop-still ∪ level-hold pin)
5. [x] `solve.ts` `boardActivity`:`isYouLike` 单一事实源(修掉 `you3d`→`3d`);`AUTO_PROPS` 删 fear/follow/mimic 补 `more`/`boom`/`tele`;规则扫描 kind∈{fear,follow,mimic} → hasAuto;顺带修掉 `else if` 漏检 you+auto 复合单位
6. [x] `stateKey`:存在 often/seldom 条件或 chill/tele(含 `level is`)时并入 `state.turn`

## 低
7. [x] `.gitignore` 补 `/tools-out`

## 测试
- [x] `LEVEL IS HOLD` 测试改为规则行偏移(ruleRow +xOffset),baba 下方格清空——钉扎真实生效
- [x] 新增 `STILL units still move under their own power`、`HOLD does not carry STILL riders`

## 验收
- `pnpm check`:lint 0 / type-check 0 / test **483/483** 全绿
