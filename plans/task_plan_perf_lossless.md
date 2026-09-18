# 无损性能优化计划（极端场景）

## 测量基线（~2050 items，`all is more` + `baba is you` 堆叠场景，~2.4ms/step）

- `sameItems`：~1.2ms/step —— `itemSignature` 在第一个循环里每项算 2 次（get+set 各一次），第二个循环再算 1 次 → 3×N 字符串构建
- `resolveFrame`/`recollect-rules`/`reapply-props`：~1.0ms/step —— `applyProperties` ~0.27ms × ~3 次/step（每 item 2×Set + filter+sort+spread 分配）
- `stage:player-move`：~0.8ms —— `canMove(id, new Set())` 每次根调用分配 Set；`getLiveCellItems` 每次调用 filter 分配数组；`sortedMovers` 比较器每对 2 次 `byId.get`
- `checkWin`+`hasAnyYou`：~0.1ms（有 `empty is X` 规则时两次全图扫描 + 两次 context 构建）
- `empty is you` 40×30 场景：~0.5ms/step —— checkWin/hasAnyYou/moveItems 各自独立扫描全空格

## 改动项（全部 src/logic，行为不变）

1. `step.ts` `sameItems`：引用相等短路 → 逐位字段相等快路径 → 签名多重集兜底（每项只算一次）
2. `step.ts`：`resolveActiveEmptyProps` 每步算一次，`checkWin`/`hasAnyYou` 共用
3. `step/win.ts`：`checkWin` 单遍层键集合（不建 cell map）；签名接收预计算 emptyProps
4. `rule-runtime.ts`：`RuleBuckets` 增加 `propertyBySubject`/`propertyWildcard`（具体非否定主语按名索引；特殊/否定主语进 wildcard）
5. `resolve.ts` `applyProperties`：按桶评估规则；yes/no 用数组（小规模）替代 Set；props 未变时复用原 item 对象
6. `step/move-core.ts` `getLiveCellItems`：`removed` 为空时直接返回格内列表（调用方均只读）
7. `step/move-single-runtime.ts`：`visiting` scratch Set 复用（`canMove` 根调用不再各分配）
8. `step/move-single.ts`：mover 排序用预存 {id,x,y}（去掉比较器内 byId.get）；prop 集合单遍构建
9. `step/move-batch.ts`：prop 集合单遍构建
10. `empty.ts`：`resolveActiveEmptyProps`/`emptyHasProp` 预过滤 empty 主语规则，不再每格全扫 rules
11. `resolve-transforms.ts`：空格生成循环外预过滤 empty 变换规则
12. `rules-override.ts`：`partitionRuleInstances` 否决规则按 `kind|object|cond` 建索引，O(Y×N)→~O(Y)

## 仅报告不改（src/web 有未提交改动）

- `syncEntityNodes` → `collectOverriddenTextIds` 每次渲染同步重跑完整 `collectRuleInstances`（规则扫描在 step 已做过；可考虑把 overridden ids 随 step 结果带出）

## 验证

- 基准脚本重测三场景（more-fill / dense-move / empty-is-you）
- `pnpm check`（lint + type-check + 全量测试含金回放）

## 结果（已完成）

同进程 A/B（~2050 items）：`sameItems` 同序 1.31ms→0.022ms（~60×），乱序最坏 1.31→0.88ms；`applyProperties` 0.34→0.21ms（~1.6×）。

端到端 `step`（ms/step，机器负载有波动但方向一致）：
- real-level-0：0.210 → 0.124（-41%）
- dense-40x30-move（607 items + all is move）：1.470 → 0.913（-38%）
- more-fill（增长到 1561 items）：3.911 → 1.949（-50%）
- rule-dense-20-rules：0.378 → 0.242（-36%）
- empty-is-you 40×30：0.493 → ~0.29（~40%，去重 checkWin/hasAnyYou 双扫描）
- push-chain-200：0.335 → 0.178（-47%）
- stacked-cell-50：0.115 → 0.081（-30%）

`pnpm check` 全绿：lint 0 警告、type-check 干净、394 测试通过（含 85 golden 回放断言）。

未改动项（记录在案）：
- `src/web` 渲染侧 `collectOverriddenTextIds` 每次同步重跑规则扫描（web 目录有未提交改动，未触碰）
- `canMove`/`doMove` 结果不可跨移除事件缓存（弱项被移除会改变可达性），未做
