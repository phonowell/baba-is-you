# AGENTS.md

## 关键约束
- 保持分层：`src/logic` 只做规则与状态推进；Web 输入输出在 `src/view/*`、`src/web/*`
- 依赖方向单向：`logic` 不依赖任何外层；`view` → `logic`；`web` → `view`/`logic`；`tools/` 为顶层入口，`levels*.ts` 由入口装配，禁止内层反向依赖
- `src/view` 承载 Web 共享渲染配置与输入映射；web 端必须复用 view 的词表与输入逻辑，禁止平行实现
- 逻辑保持可组合与可测试：编排入口 `src/logic/step.ts`，流水线实现在 `src/logic/step/`（阶段序列集中在 `step/phase-list.ts`）；避免把 IO、DOM、Three.js 逻辑混入 `src/logic`
- 状态更新遵循不可变风格：`step(state, action)` 返回新状态，不就地改写旧状态
- 项目文件编码统一为 UTF-8（新增/修改文件均保持 UTF-8，禁止使用其他编码）
- 优先暴露领域语义，避免只靠引擎内部术语命名：阶段/状态名应让人直接看懂玩法时序，文档同步解释“为什么此时生效”
- 避免把真假变化混在一起：输入处理、命令映射、状态流转、视图刷新必须区分“命令存在”和“状态真的推进”，不要把无效操作计作已处理
- 新增抽象前先确认边界是否真实：`model/store/controller/view/runtime` 这类拆分只有在职责、测试入口、依赖方向都更清晰时才成立，禁止仅为降文件行数而横切
- 规则词表与语法分类集中维护，优先单一事实源；禁止在 `logic/view/web` 各自维护平行常量
- 测试命名必须表达行为域，禁止继续增加 `step-2/3/...` 这类编号文件
- 3D 渲染必须按需驱动：常驻动效不能单独维持 RAF；需要持续渲染时必须明确说明原因与成本
- 3D 相关改动必须可注入、可验证：优先为 runtime/资源生命周期暴露测试缝，而不是只测试 shared 纯函数
- 配置拆分只按稳定职责分组：布局/相机/灯光/阴影/后处理/纹理/动效；禁止把行为逻辑继续外溢到巨型 config
- 规则系统以当前实现为准：
  - 操作符：`IS/HAS/MAKE/EAT/WRITE/FEAR/FOLLOW/MIMIC/PLAY/BECOME`
  - 连接与否定：`AND/NOT`
  - 条件：`ON/NEAR/FACING/NEXTTO/FACEDBY/SEEING/WITHOUT/ABOVE/BELOW/BESIDELEFT/BESIDERIGHT/FEELING` + 前缀位 `LONELY/IDLE/OFTEN/SELDOM/POWERED(2/3)`
  - 特殊名词：`TEXT/EMPTY/ALL/GROUP(2/3)/LEVEL`；字母单位 `a-z/0-9/sharp/flat/ab/ba`（type-5 文字）不单独成词，只在相邻 ≥2 格的字母行/列中拼出词典词参与规则（`letter-words.ts`，对齐官方 `letterunits.lua`；含 `play` 文本时切换为音符词典）
  - 属性词：以 `src/logic/types.ts` 的 `CORE_PROPERTIES` 为准
- 修改规则词表时同步：`src/logic/types.ts`、`src/logic/rules*.ts`、`src/view/render-config.ts`、相关测试；若已集中导出语法集合，禁止再手写镜像副本
- Web 渲染约束：入口在 `src/web/app.ts`；3D 渲染使用 `src/web/board-3d-renderer*.ts` 体系，是唯一场景，不实现 2D/无 WebGL 回退；必须保证可释放（`dispose`）

## 技术栈
- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Web: Three.js
- Lint: oxlint（`.oxlintrc.json`）

## 核心命令
- `pnpm check`：lint + type-check + test 一步验证（改动后默认先跑它）
- `pnpm build`：构建本地预览单文件（`release-local/baba-is-you.html`，无域名锁）
- `pnpm build:fast`：同上但用快速 gzip（watch 循环用；产物仅调试用，勿部署）
- `pnpm build:deploy`：构建部署版（`release/` 下壳 HTML + 受门控 bundle + `payloads/` 懒加载文件，仅 auvya.com 可运行）
- `pnpm deploy`：构建部署版并部署到 `auvya.com/baba`（流程与坑位见 `docs/deploy.md`）
- `pnpm watch`：监听并自动 build
- `pnpm test`：运行 `src/**/*.test.ts`
- `pnpm lint`：oxlint + BOM/CRLF 归一
- `pnpm type-check`
- `pnpm import-levels:official`
- `pnpm verify-levels:official`（依赖本地 `data/baba` dump，已 gitignore）

## 目录结构
- `src/web/app.ts`：Web 应用入口
- `src/web/pixel-sprites/`：像素 sprite 数据与体素几何（帧派生、blit、voxel 挤出）
- `src/logic/`：规则解析、匹配、状态推进；`src/logic/step/` 为推进流水线（`step.ts` 编排、`step/phase-list.ts` 定义阶段序列）
- `src/view/`：输入映射、HTML 渲染与 Web 共享渲染配置
- `src/levels.ts`、`src/levels-data/*.ts`：关卡入口与数据包（由 `web/app.ts` 装配，内层不反向依赖）
- Web 端为扁平菜单选关（`menu`/`game` 两态，`src/web/app-model.ts`）；官方 `leveltype=1` overworld 地图只参与导入校验，不再生成可玩数据
- `levels/**/*.txt`：前身 Rust 项目移植的关卡夹具（实体列表语法，`src/logic/parse-level.ts` 解析，供 golden 回放装载；支持同格多实体）
- `src/logic/rules-override.ts`：规则实例源格溯源与被否决规则划分
- `goldens/**/*.json`：通关回放快照，由 `src/logic/goldens.test.ts` 全量回放断言；`scripts/port-rust-goldens.ts` 可从 `../baba/goldens` 重新生成
- `src/tools/import-official-levels.ts`：官方关卡导入/校验（独立脚本入口，只依赖 `logic`）
- `scripts/build-single-html.ts`：Web 构建脚本（默认本地单文件；`--deploy` 产壳+锁定 bundle+懒加载 payload；`--fast`/`--raw` 跳重压缩）
- `docs/README.md`：文档索引与维护约定
- `docs/logic-architecture.md`：逻辑流水线说明（阶段表、规则运行时、empty/level/transform 语义）
- `docs/web-architecture.md`：Web 应用分层（store/reducer、命令管线、输入源、回放、生命周期）
- `docs/rendering-3d.md`：3D 渲染体系（`board-3d-*` 与 `pixel-sprites/` 管线、按需渲染与释放）
- `docs/level-data.md`：关卡数据源与格式、官方导入链、goldens 录制-校验-绑定
- `docs/solver-handoff.md`：关卡求解器现状与待办（`src/logic/solve.ts` + `src/tools/solve-levels.ts`）
- `docs/deploy.md`：部署到 `auvya.com/baba` 的流程与边界（`wrangler.toml` + `src/tools/deploy-worker.ts`）

## 工作流
- 协作前提：main 分支多人并行改动；变更保持小而聚焦，避免无关重排/改名/大范围格式化，降低冲突面
- 不采用 TDD（不要求先写失败测试），不使用 git worktree；直接在当前工作区完成改动
- 禁用 `git stash` 等可能丢失文件状态的 git 操作（含 `git reset --hard`、`git checkout --`/`git restore` 丢弃改动、`git clean`、改写历史与强推）；确需执行必须先向用户说明影响并获确认
- 测试准入从严：新增用例必须锁定真实行为风险或回归场景；低 ROI 用例（凑覆盖率、重复快照、镜像已有断言）不予准入
- 规则/推进改动：优先补或改 `src/logic/*.test.ts`，再跑 `pnpm test && pnpm type-check`
- 渲染/UI 改动：补 `src/view/*.test.ts` 或 `src/web/*.test.ts`，再跑 `pnpm test`
- 输入/状态管理改动：至少覆盖“有效操作”和“无效操作”两类测试，防止把未生效命令当成已处理
- 3D runtime/生命周期改动：至少覆盖 RAF 停止、资源释放、尺寸变化同步、dispose 后阻断后续工作
- 构建链路改动：至少执行 `pnpm build` 验证输出可打开
- 验收优先探针而非浏览器：以测试、脚本、命令输出等可断言手段验证行为；浏览器预览仅用于探针覆盖不到的视觉确认
- 涉及 3 步以上任务：在 `plans/task_plan_{suffix}.md` 维护计划与状态

## 代码规范
- 倾向函数表达式：`const fn = (...) => {}`
- 类型声明优先 `type` + `import type`
- 非空断言、lint 禁用注释仅在必要点最小使用并给出理由
- `try-catch` 仅用于可恢复边界（IO、外部依赖、构建流程）
- 类型别名要带来真实约束；若仍是裸 `string` 语义，不要误导性地制造“看起来更类型安全”的空壳命名
- 小文件不是目标，低心智负担才是目标；拆分后若理解一次行为仍需跨过多文件，优先回收抽象

## 输出格式
- 结论优先，信息可验证，不编造
- 报错使用：`✗ {位置}:{类型}`
- 路径使用项目相对路径并保持可定位
