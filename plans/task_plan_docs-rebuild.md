# 文档深入建设：对齐现状 + 补齐未覆盖子系统

## 背景

文档明显落后于代码（以工作区现行代码为准）：

- README×3 仍写 overworld 光标选关；实际已是 `menu`/`game` 两态扁平菜单
  （5 列网格、566 关、hover 预览、golden Solution 回放按钮）
- README 词表停在 `IS/HAS/MAKE/EAT/WRITE` + 4 条件 + 31 属性；实际
  `types.ts` 已有 10 操作符、12 中置条件、6 后缀条件、7 特殊名词、
  字母单位拼词、~90 属性
- README 写 `release/baba-is-you.html`；实际本地产物在 `release-local/`，
  `release/` 是部署壳+bundle（`build:deploy`/`deploy` 命令未提）
- `src/levels-maps.ts` 已不存在；levels-data 已扩到 12 包（00–11）
- `docs/logic-architecture.md` 阶段表少 `back`、make/write/more 已移到
  管线末尾；未覆盖 rulesStale 复用、mimic 展开、empty 每格、
  `level is …` 房间滚动、prepareStep
- web 层（app-* 分层、board-3d 体系、pixel-sprites 管线、golden
  绑定/回放）、关卡导入链、goldens 格式均无文档

## 计划

- [x] 1. 修正 README.md / README.zh-CN.md / README.ja.md（操作、词表、
  渲染堆叠、构建产物、关卡来源、命令表）
- [x] 2. 重写 `docs/logic-architecture.md`（12 阶段真实顺序、sync 三态与
  rulesStale、RuleBuckets、解析管线、empty/win/transform/level 滚动）
- [x] 3. 新增 `docs/web-architecture.md`（app 分层、命令管线、输入源、
  draw/replay/golden/host-gate/生命周期）
- [x] 4. 新增 `docs/rendering-3d.md`（board-3d 体系、pixel-sprites 管线、
  按需渲染与 dispose 缝）
- [x] 5. 新增 `docs/level-data.md`（官方导入链、fixture/ASCII 格式、
  goldens 录制-绑定-回放-工具链）
- [x] 6. 新增 `docs/README.md` 索引；AGENTS.md 目录/文档清单同步
  （另补 `ab`/`ba` 双字母单位）
- [x] 7. `pnpm lint` 校验编码与 lint（0 warnings / 0 errors）

## 约定

- 架构/引擎类文档沿用英文（与 logic-architecture、solver-handoff 一致）；
  deploy/clay/plans 维持中文不改写
- `docs/solver-handoff.md` 是进行中的工作交接文档，不动；
  `docs/clay-style-research.md` 是已标注的历史快照，不动
- `plans/task_plan_*.md` 为任务记录，不回写历史
- 只改文档，不动代码语义；工作区有他人未提交改动，避开 src 文件

## 核对依据

- 阶段序列：`src/logic/step/phase-list.ts`（12 阶段，make/write/more 在末段）
- 词表：`src/logic/types.ts`（CORE_PROPERTIES / RULE_*_WORDS /
  SPECIAL_NOUN_WORDS）；字母词 `src/logic/letter-words.ts`
- 菜单：`src/web/app-model.ts`（menu/game）、`src/view/render-menu-html.ts`
  （MENU_GRID_COLUMNS=5、MENU_PAGE_ROWS=4）、`src/web/app-commands.ts`
- 输入：`src/view/input.ts`、`input-web.ts`、`input-gamepad.ts`、
  `src/web/app-pointer.ts`、`app-gamepad.ts`、`app-events.ts`
- 构建：`scripts/build-single-html.mjs`（release-local vs release/+
  DEPLOY_ALLOWED_HOSTS）、`docs/deploy.md`
- 关卡：`src/levels.ts`（12 包，566 关）、`src/tools/import-official-*`
- 回放：`src/logic/replay*.ts`、`src/logic/goldens.test.ts`、
  `src/web/app-goldens.ts`、`app-golden-binding.ts`、`app-replay.ts`
