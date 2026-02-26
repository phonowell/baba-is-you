# task_plan_level_select_and_import_audit

## Goal
新增选关能力；全面排查并修复 jeremy 关卡导入中可能丢失“活动区域限制/布局约束”元数据的问题，并输出原始关卡元数据值清单。

## Steps
- [x] 1. 梳理当前 CLI 输入与状态切换路径，确定最小侵入选关方案并实现。
- [x] 2. 扫描 `../baba/levels` 全量元数据键值，生成可审阅报告（含逐文件原始值）。
- [x] 3. 对照导入脚本，定位被忽略且会影响布局/活动区域的字段并修复。
- [x] 4. 重新执行导入并对比关键关卡尺寸与对象坐标结果。
- [x] 5. 运行 `type-check/test/lint` 并输出排查结论与后续建议。

## Status
- completed: 1,2,3,4,5

## Risks
- 推测，待确认：`+ key = dx,dy` 语义可能用于渲染/自动铺贴，也可能改变实际碰撞布局，需以坐标统计验证。
- 推测，待确认：活动区域偏移可能不是 `pad` 字段，而是由多层（`+++`）或 world-map 语法间接表达。

## Result
- 选关功能已完成：启动参数 `--list-levels`、`--level N`，运行时按 `[`/`]` 前后切关。
- 元数据全量报告已生成：
  - `plans/jeremy-level-meta-all-values.json`
  - `plans/jeremy-level-meta-values.md`
- 关键结论：
  - 活动区域相关字段仅发现 `right pad`（21 处），导入器已读取并生效。
  - 未发现 `left pad` / `top pad` / `bottom pad`。
  - `+ ... = ...` 在官方实现中用于颜色覆写，不用于活动区域。
  - 真正会影响后续导入完整性的点是多层地图（5 个文件含第二个分隔线），当前导入器仍按不支持中断。
