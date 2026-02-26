# task_plan_split_levels_and_and_import

## Goal
先将关卡数据从单文件拆分为多文件，再扩展引擎支持 `AND` 规则，并继续按顺序导入，遇到下一个未支持特性立即中断并上报。

## Steps
- [x] 1. 拆分关卡数据结构：新增分片文件并在 `src/levels.ts` 聚合导出。
- [x] 2. 扩展规则解析支持 `AND`（X AND Y IS Z / X IS Y AND Z）。
- [x] 3. 补充/更新测试，验证 `AND` 规则生效且不破坏现有行为。
- [x] 4. 调整导入脚本支持 `AND` 并重新按顺序导入。
- [x] 5. 输出新的中断位置与原因。

## Status
- completed: 1,2,3,4,5

## Risks
- 推测，待确认：后续关卡可能在 `AND` 之后立即命中 `NOT/HAS/ON/MAKE` 或更复杂机制。

## Result
- 分片结果：`src/levels-data/00-root.ts`、`src/levels-data/01-1-the-lake.ts`，`src/levels.ts` 聚合导出。
- 顺序导入结果：成功导入 10 关，停在 `1-the-lake/3-affection.txt`。
- 中断原因：`unsupported text word "move" via glyph "→" at (11,5)`。
