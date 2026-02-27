# CLAUDE.md

## 关键约束
- 保持分层：`src/logic` 只做规则与状态推进；CLI/Web 输入输出在 `src/cli.ts`、`src/view/*`、`src/web/*`
- 逻辑保持可组合与可测试：核心入口 `src/logic/step.ts`，避免把 IO、DOM、Three.js 逻辑混入 `src/logic`
- 状态更新遵循不可变风格：`step(state, action)` 返回新状态，不就地改写旧状态
- 项目文件编码统一为 UTF-8（新增/修改文件均保持 UTF-8，禁止使用其他编码）
- 规则系统以当前实现为准：
  - 操作符：`IS/HAS/MAKE/EAT/WRITE`
  - 连接与否定：`AND/NOT`
  - 条件：`ON/NEAR/FACING/LONELY`
  - 特殊名词：`TEXT/EMPTY/ALL/GROUP/LEVEL`
  - 属性词：以 `src/logic/types.ts` 的 `CORE_PROPERTIES` 为准
- 修改规则词表时同步：`src/logic/types.ts`、`src/logic/rules*.ts`、`src/view/syntax-words.ts`、`src/view/render-config.ts`、相关测试
- CLI 渲染约束：双宽格子、文本两字母码、语法词高亮；避免破坏 `src/view/render*.ts` 的输出兼容
- Web 渲染约束：`src/web/app.ts` + `src/web/board-3d.ts`；保持可降级与可释放（`dispose`）

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
- 构建链路改动：至少执行 `pnpm build` 验证输出可打开
- 涉及 3 步以上任务：在 `plans/task_plan_{suffix}.md` 维护计划与状态

## 代码规范
- 倾向函数表达式：`const fn = (...) => {}`
- 类型声明优先 `type` + `import type`
- 非空断言、`eslint-disable` 仅在必要点最小使用并给出理由
- `try-catch` 仅用于可恢复边界（IO、外部依赖、构建流程）

## 输出格式
- 结论优先，信息可验证，不编造
- 报错使用：`✗ {位置}:{类型}`
- 路径使用项目相对路径并保持可定位
