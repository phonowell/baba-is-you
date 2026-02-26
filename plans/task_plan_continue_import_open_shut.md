# task_plan_continue_import_open_shut

## Goal
继续顺序导入关卡：补齐当前阻塞特性 `open/shut`，重新导入并报告新的中断位置。

## Steps
- [ ] 1. 扩展属性集合支持 `open/shut`，同步渲染文本码。
- [ ] 2. 在 `step` 交互阶段实现 `open + shut` 消解规则。
- [ ] 3. 调整导入脚本支持 `open/shut` 文本并继续顺序导入。
- [ ] 4. 补充测试并运行 `type-check/test/lint`。
- [ ] 5. 输出最新导入进度与下一个阻塞特性。

## Status
- in_progress: 1

## Risks
- 推测，待确认：`open/shut` 在同格多对象时的精确配对细则可能与官方存在边缘差异。
