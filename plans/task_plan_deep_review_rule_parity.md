# Task Plan: Deep Review Rule Parity

## Goal
深度复盘当前引擎实现与原版规则的一致性，定位高风险语义偏差并完成修复。

## Steps
1. [completed] 锁定 review 范围并读取当前实现（rules/resolve/step）。
2. [completed] 对照 `../baba/src/game.rs` 提取关键规则语义（NOT/HAS/EMPTY/OPEN/SHUT/TELE/PULL/SHIFT/SWAP/FLOAT）。
3. [completed] 构造最小复现场景验证偏差（本地测试脚本）。
4. [completed] 完成修复并补充回归测试。
5. [completed] 运行 `pnpm test && pnpm type-check && pnpm lint` 与导入校验。

6. [completed] 第二轮对齐原版 step 顺序并补充回归测试（官方规则快照语义）。
7. [completed] 修复 OPEN/SHUT 在移动阶段碰撞与 HAS 掉落语义并新增回归测试。
8. [completed] 对齐 TELE 棋盘扫描顺序与 oorandom RNG，并修复 OPEN/SHUT+PUSH 边界。
9. [completed] 补齐 FLOAT 分层与 SHIFT/rotate 时序对照测试并验证通过。
10. [completed] 补齐 WEAK 语义（移动阻塞/删除阶段）并新增回归测试。
11. [completed] 将 MOVE/SHIFT 改为同批 movers 求解并补齐对向交互回归测试。
12. [completed] 修正 transform 阶段不触发 HAS 掉落，并更新回归测试。
13. [completed] 对齐 MOVE/SHIFT 朝向写回语义：MOVE 仅在实际移动时更新朝向；SHIFT 入队前先写朝向。
14. [completed] 对齐删除/胜负同体语义：YOU+WIN、YOU+DEFEAT、HOT+MELT、OPEN+SHUT 单体判定与原版一致。
15. [completed] 末轮验证：`pnpm test`、`pnpm type-check`、`pnpm lint`、`pnpm import-levels:jeremy`、`levels.length`。
16. [completed] 修正 `moveItemsBatch` 中 defer/block 优先级，阻挡优先于依赖等待，并补回归测试。
17. [completed] 修正 `NOT TEXT` 主语匹配语义（非文本对象匹配），并补 `step/resolve` 回归测试。
18. [completed] 修正批处理移动中 `OPEN/SHUT` 销毁后的 PULL 连带语义，并新增回归测试。
19. [completed] 修正同格多 SHIFT 的 shifter 朝向级联语义（后续 shifter 读取已更新朝向），并补回归测试。
20. [completed] 修正规则解析链式分句语义：避免把前一段谓词链错误带入后一段 `IS` 主语。
