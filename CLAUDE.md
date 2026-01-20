# CLAUDE.md

## 关键约束
- 逻辑/视图严格分离：logic 纯函数无副作用；view 仅渲染与输入映射
- 状态不可变：logic 只接收 action 并返回新 state
- 规则范围：仅 X IS Y；核心属性 you/win/stop/push/defeat/sink/hot/melt；无 Has/And/Not/On/Make
- 终端渲染：固定单元宽度 2；文本块 2 字母；IS 单独颜色；显示规则+字典；允许 ANSI
- 输入：WASD/方向键；U 撤销；R 重开；N 过关/通关重开
- 运行方式：tsx 直接运行 TS；禁止引入 build/dist 输出
- 元原则：精简冗余 · 冲突信代码

## 技术栈
- Node.js + TypeScript + ESM
- Runtime: tsx
- Lint: ESLint (`eslint.config.mjs`)

## 核心命令
- `pnpm start`
- `pnpm lint`
- `pnpm type-check`

## 目录结构
- `src/cli.ts` CLI 入口/IO
- `src/logic/` 纯逻辑
- `src/view/` 渲染与输入映射
- `src/levels.ts` 关卡数据（来源：`../kikyo/source/static/script/include/data.coffee`）

## 工作流
- 改规则：仅改 `src/logic/`
- 改渲染：仅改 `src/view/`
- 更新关卡：同步 `../kikyo/source/static/script/include/data.coffee` → `src/levels.ts`

## Skill 使用
- 命中 skill 必须读取 `SKILL.md` 并按流程执行；多 skill 取最小集合顺序

## 代码规范
- 函数用表达式：`const fn = (...) => {}`
- 类型使用 `import type`；避免 interface
- ≥5 处非空断言 → 立即重构类型架构（🚫 eslint-disable 批量压制）

## 输出格式
- 客观诚实：不主观评价 · 不因用户情绪转移立场 · 不编造事实 · 立刻暴露不确定信息
- TodoWrite：≥3 步任务必须建 todo · 实时更新状态 · 完成立即标记
- 约束：禁预告文字 · 状态用符号 ✓/✗/→ · 一次性批量 Edit · 数据优先 · 直达结论 · 工具间隔零输出 · 错误格式 ✗ {位置}:{类型} · 代码块零注释 · ≥2 条用列表 · 路径缩写（. 项目根 · ~ 主目录）· 禁总结性重复 · 进度 {当前}/{总数} · 提问直入
