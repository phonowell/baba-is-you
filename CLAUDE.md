# CLAUDE.md

## 关键约束
- 保持分层：`src/logic` 只做规则与状态推进；CLI/Web 输入输出在 `src/cli.ts`、`src/view/*`、`src/web/*`
- 逻辑保持可组合与可测试：核心入口 `src/logic/step.ts`，避免把 IO、DOM、Three.js 逻辑混入 `src/logic`
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
  - 操作符：`IS/HAS/MAKE/EAT/WRITE`
  - 连接与否定：`AND/NOT`
  - 条件：`ON/NEAR/FACING/LONELY`
  - 特殊名词：`TEXT/EMPTY/ALL/GROUP/LEVEL`
  - 属性词：以 `src/logic/types.ts` 的 `CORE_PROPERTIES` 为准
- 修改规则词表时同步：`src/logic/types.ts`、`src/logic/rules*.ts`、`src/view/render-config.ts`、相关测试；若已集中导出语法集合，禁止再手写镜像副本
- CLI 渲染约束：双宽格子、文本两字母码、语法词高亮；避免破坏 `src/view/render*.ts` 的输出兼容
- Web 渲染约束：入口在 `src/web/app.ts`；3D 渲染使用 `src/web/board-3d-renderer*.ts` 体系，是唯一场景，不实现 2D/无 WebGL 回退；必须保证可释放（`dispose`）

## 技术栈
- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Web: Three.js
- Lint: ESLint（`eslint.config.mjs`）

## 核心命令
- `pnpm start`：运行 CLI
- `pnpm build`：构建单文件 Web（`release/baba-is-you.html`）
- `pnpm watch`：监听并自动 build
- `pnpm test`：运行 `src/**/*.test.ts`
- `pnpm lint`
- `pnpm type-check`
- `pnpm import-levels:official`
- `pnpm verify-levels:official`

## 目录结构
- `src/cli.ts`：CLI 应用入口
- `src/web/app.ts`：Web 应用入口
- `src/logic/`：规则解析、匹配、状态推进
- `src/view/`：输入映射与 CLI/HTML 渲染
- `src/levels.ts`、`src/levels-data/*.ts`：关卡入口与数据包
- `src/tools/import-official-levels.ts`：官方关卡导入/校验
- `scripts/build-single-html.mjs`：单文件构建脚本
- `docs/logic-architecture.md`：逻辑流水线说明

## 工作流
- 规则/推进改动：优先补或改 `src/logic/*.test.ts`，再跑 `pnpm test && pnpm type-check`
- 渲染/UI 改动：补 `src/view/*.test.ts` 或 `src/web/*.test.ts`，再跑 `pnpm test`
- 输入/状态管理改动：至少覆盖“有效操作”和“无效操作”两类测试，防止把未生效命令当成已处理
- 3D runtime/生命周期改动：至少覆盖 RAF 停止、资源释放、尺寸变化同步、dispose 后阻断后续工作
- 构建链路改动：至少执行 `pnpm build` 验证输出可打开
- 涉及 3 步以上任务：在 `plans/task_plan_{suffix}.md` 维护计划与状态

## 代码规范
- 倾向函数表达式：`const fn = (...) => {}`
- 类型声明优先 `type` + `import type`
- 非空断言、`eslint-disable` 仅在必要点最小使用并给出理由
- `try-catch` 仅用于可恢复边界（IO、外部依赖、构建流程）
- 类型别名要带来真实约束；若仍是裸 `string` 语义，不要误导性地制造“看起来更类型安全”的空壳命名
- 小文件不是目标，低心智负担才是目标；拆分后若理解一次行为仍需跨过多文件，优先回收抽象

## 输出格式
- 结论优先，信息可验证，不编造
- 报错使用：`✗ {位置}:{类型}`
- 路径使用项目相对路径并保持可定位
