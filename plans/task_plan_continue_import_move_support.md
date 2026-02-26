# task_plan_continue_import_move_support

## Goal
继续顺序导入官方关卡：补齐当前阻塞特性 `move`，重新导入并报告新的中断位置。

## Steps
- [x] 1. 扩展规则属性集支持 `move`，修正文本渲染代码映射。
- [x] 2. 在 `step` 中实现 `MOVE` 自动移动（基础版）并补充回归测试。
- [x] 3. 调整导入脚本将 `move` 从未支持列表移除并重新导入。
- [x] 4. 运行 `type-check/test/lint` 并输出最新进度与下一个阻塞点。

## Status
- completed: 1,2,3,4

## Risks
- 推测，待确认：导入数据目前不携带原始朝向，`MOVE` 初始方向默认 `right`，行为与官方可能存在偏差。
