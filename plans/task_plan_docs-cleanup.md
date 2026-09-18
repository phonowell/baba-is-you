# 文档整理：过时 / 错误 / 重叠 / 通用知识

## 背景
仓库文档与现行实现出现偏差：体素渲染、overworld cursor 阶段、`line` 地贴、
`levels-data` 扩到 5 包等改动未回写文档；另有一次性审计报告与通用教程
不属于项目文档。

## 核对依据（以工作区现行代码为准）
- 阶段序列：`src/logic/step/phase-list.ts`（含 `cursor-move`，共 12 阶段）
- 堆叠：`src/view/stack-policy.ts`（`cursor > you > text > move/fall > push/pull > open/shut > else`；
  地贴 `tile/water/belt/line`）
- 渲染：`src/web/board-3d-renderer-materials.ts`（sprite → 体素几何；
  其余 → 字板 + 前面纹理；方向箭头为凸起体素层）
- 数据包：`src/levels-data/00`–`04-official.ts`（`src/levels.ts` 聚合 5 包）
- `data/baba` 已 gitignore，`verify-levels:official` 依赖本地 dump

## 计划
- [x] 核对文档声明与代码一致性（README×3、AGENTS.md、docs/*、plans/*）
- [x] 修正 README.md / README.zh-CN.md / README.ja.md（包数、堆叠、地贴、
  渲染描述、watch 命令、verify 数据依赖）
- [x] 修正 docs/logic-architecture.md（cursor-move 阶段、RuleRuntime 消费方、
  补 rules-override / overworld 小节）
- [x] docs/clay-style-research.md 标注终端相关段落失效（CLI 已移除）
- [x] AGENTS.md 目录结构补 `src/web/pixel-sprites/`；verify 命令补 `data/baba` 依赖
- [x] 删除 docs/llm-seo-report.md（一次性审计快照，建议项未落地）
- [x] 删除 .codex/skills/threejs-postprocessing/SKILL.md（通用教程，零项目内容）
- [ ] `pnpm lint` 校验编码与 lint

## 边界
- `plans/task_plan_*.md` 为任务记录，完成项保留不改写历史
- README 规则词表与 `CORE_PROPERTIES` 一致，保留（用户向特性清单）
- 不改代码语义
