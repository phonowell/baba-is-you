# task_plan_import_official_levels

## Goal
将 Baba Is You 官方后续关卡数据导入本项目 `src/levels.ts` 可消费格式，并确保 `pnpm type-check` / `pnpm lint` 通过。

## Steps
- [x] 1. 确认官方后续关卡数据来源与许可边界，记录可复现拉取方式。
- [x] 2. 分析官方数据格式与本项目关卡 DSL 的差异，定义转换规则。
- [x] 3. 实现一次性转换脚本并生成更新后的 `src/levels.ts`。
- [x] 4. 运行类型检查/静态检查，必要时修正导入数据中的兼容问题。
- [x] 5. 输出变更明细、来源路径和后续维护方式。

## Status
- completed: 1
- completed: 2
- completed: 3
- completed: 4
- completed: 5

## Risks
- 推测，待确认：官方完整关卡数据可能不在公开仓库中，需要用户本地游戏资源或额外下载源。
- 推测，待确认：后续关卡可能包含当前引擎未实现的对象/规则，导入后可加载但玩法不完整。
