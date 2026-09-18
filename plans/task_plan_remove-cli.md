# 移除 CLI 模式

## 背景
项目已从终端游戏演进为单文件 Web 应用（`src/web/app.ts` → `release/baba-is-you.html`）。
交互式终端玩法（`pnpm start` / `pnpm map`）不再需要，连同其 ANSI 渲染栈一并移除。
`pnpm simulate` 是无头验证工具（非"模式"），保留——其输出本就做 `stripAnsi`，
改用新建的纯文本打印器，不保留 ANSI 渲染代码。

## 范围

### 删除
- `src/cli.ts`、`src/cli-map.ts`：交互式终端入口（readline/raw mode）
- `src/index.ts`：包入口，仅导出 CLI 库表面，无内部引用
- `src/view/render.ts` + `render.test.ts`：ANSI 棋盘渲染
- `src/view/render-width.ts`：终端显示宽度工具（所需逻辑并入 print-board）
- `src/view/render-menu.ts`：ANSI 菜单；`MENU_WINDOW_SIZE` 迁入 `render-menu-html.ts`
- `src/view/palette.ts` + `palette.test.ts`：原版调色板，唯一消费方是 ANSI 渲染
  （web 端用 clay 调色 + 像素贴图，不读 `state.meta.palette`）

### 新建
- `src/tools/print-board.ts`：纯文本棋盘打印（格子/规则/图例/状态行），
  汇集自 render.ts/render-helpers.ts/render-width.ts 移除 ANSI 与调色后的逻辑，
  供 `scripts/simulate.ts` 使用；`src/tools` 属顶层工具层，依赖 view/logic 合法

### 修改
- `scripts/simulate.ts`：`printState` 改用 `printBoard`，去掉 render/stripAnsi 依赖
- `src/view/render-helpers.ts`：仅保留 `renderRules`（web `render-html.ts` 与
  print-board 共用）；cellForItem/pickItem/renderLegend/CellRenderContext/图标逻辑
  迁入 print-board 或删除
- `src/view/render-config.ts`：删 `CELL_WIDTH`/`ANSI_*`/`GRAPHEME_SEGMENTER`；
  留 `OBJECT_GLYPHS`（web 在用）、`TEXT_CODES`/`textCodeForName`（print-board 用）
- `src/view/render-menu-html.ts`：新增 `MENU_WINDOW_SIZE`
- `src/web/app-commands.ts`：`MENU_WINDOW_SIZE` 改从 render-menu-html 导入
- `src/logic/game-types.ts`：注释不再指向已删的 palette.ts
- `package.json`：删 `bin`/`main`/`start`/`map`；name/description 去掉 CLI 字样
- `AGENTS.md`、`README*.md`、`docs/llm-seo-report.md`：同步描述与命令表

### 保留不动
- `src/view/input.ts`/`input-web.ts`/`render-html.ts`/`render-menu-html.ts`/
  `status-line.ts`/`stack-policy.ts`/`syntax-words.ts`：web 在用
- `src/logic/rules-override.ts`：`collectOverriddenTextIds` 被 web 使用
  （`collectTextRuleMarks` 保留为 logic 查询 API）
- `src/logic` 的 `LevelMeta`/`meta` 解析：属关卡数据层，不随 view 移除
- `pnpm simulate` 命令本身

## 验证
- `pnpm check`（lint + type-check + test）
- `pnpm simulate 0 rrdl` 输出与旧行为一致（原本就去 ANSI）
- `pnpm simulate --ascii levels/index.txt ...` 大地图 e/b 仍可用
- `pnpm build` 成功产出 release/baba-is-you.html

## 状态
- [x] 计划
- [x] 实施
- [x] 验证：`pnpm check` 全绿（293 tests）；`pnpm simulate 0 rrdl`、
  `pnpm simulate --ascii levels/index.txt eb` 输出正常；`pnpm build` 成功
- 附带修复：`scripts/simulate.ts` 位置参数过滤在无 `--ascii` 时误删 index 0
  的既有 bug（`pnpm simulate 0 rrdl` 此前一直报错）
