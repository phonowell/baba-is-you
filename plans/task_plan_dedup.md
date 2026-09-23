# task_plan_dedup — 全项目代码去重

类型：implementation（含 research 阶段）

## 背景
- jscpd 扫描（src+scripts，排除 levels-data/pixel-sprites data/test）：29 处 clone，约 347 行（1.18%）
- 工作区有 56 个未提交文件（sprite-recolor / genshin-ui / solution-confirm 在途），去重改动需避开或最小接触脏文件
- 约束：不制造假抽象（AGENTS.md）；保持分层与单向依赖；词表/常量须单一事实源

## 阶段
1. [done] 盘点 clone 清单：逐个读 clone 现场，判定真重复 vs 可接受相似 → notes_dedup.md
2. [done] 语义级重复检查：词表/常量平行副本（logic/view/web）、同功能异名 helper
3. [done] 决策点：用户确认脏文件也去重 → 全部 clone 纳入处理；注意与在途改动交错，编辑时只碰 clone 区
4. [done] 实施去重（清单见 notes_dedup.md）：A logic → B tools → C scripts → D web/css
5. [done] 验证：tsc 全绿；lint 0 告警；tsx --test 898/898（goldens 回放全过）。
   期间 renderer-runtime.test 曾失败 1 例——诊断为并行在途文件的中间态，对方补齐后复跑全绿

## 退出条件
- 真重复已收敛为单一事实源或共享 helper；可接受相似在 notes 中记录理由
- pnpm check 全绿

## 风险
- 脏文件冲突面：只在 clone 区与未提交改动不重叠时才动脏文件，否则记录跳过
- move-batch/move-single 系列相似但语义可能刻意分叉，合前需确认
