# 彻底移除旧 CLI 残留

## 背景
`1c087fe` 已移除交互式终端前端，但保留了 `pnpm simulate` 无头 CLI 及其整套支撑栈。
本任务将其全部移除，不留兼容层。golden 回放体系（`goldens/`、`src/logic/replay.ts`、
非 index 的 `levels/*.txt`、`parse-ascii-level.ts` 常规解析）是引擎回归测试，保留；
`LEVEL` 特殊名词属规则词表，保留。

## 删除文件
- `scripts/simulate.ts`、`src/tools/print-board.ts`、`src/tools/level-graph.ts`
- `src/logic/overworld.ts`、`src/logic/overworld.test.ts`
- `levels/index.txt`、`levels/*/index.txt`、`levels/6-rocket-trip/`（仅服务大地图树，无 golden 引用）

## 修改
- `package.json`：删 `simulate` script
- `src/logic/step/phase-list.ts`：删 `cursor-move` 阶段与 `moveCursor` 导入
- `src/logic/step.ts`：删 `hasCursor` 判负豁免
- `src/logic/game-types.ts`/`types.ts`：删 `LevelName`、`levelTarget`
- `src/logic/parse-ascii-level.ts`：删 `LEVEL_GLYPHS`/`LINE_GLYPH`/`map N icon` 图例/`levelTarget`/
  `levelNameKey`/`overrideKeyFor`；`map` 图例头显式报 unsupported
- `src/logic/parse-ascii-level.test.ts`：删大地图/图标/line 用例
- `src/logic/goldens.test.ts`：失败提示不再指向 `pnpm simulate`
- `src/view/stack-policy.ts`：删 `cursor` 层（`line` 是真实关卡实体，保留贴地项）
- `src/view/render-config.ts`：删 `TEXT_CODES`/`textCodeForName`/`glyphForLegendName`（仅 print-board 用）
  及 `map`/`cursor`/`level` 字形（`line` 保留——02/03-official 在用）
- `src/view/render-config.test.ts`：删 textCodeForName 用例
- `src/web/pixel-sprites/data/misc.ts`：删 `map`/`level`/`cursor` sprite（`line` sprite 保留在 terrain.ts）
- `src/view/render-helpers.ts`：注释去掉 print-board 引用
- `src/view/input.ts`/`input-web.ts`：删 readline 形 `Keypress` 协议（含 `sequence` 字段）——
  键盘映射并入 `input-web.ts`，直接在 `KeyboardEvent.key` 上分发；`return` 别名随之删除
- `src/view/input.test.ts`/`input-web.test.ts`：键盘用例改走 DOM 形事件
- `docs/logic-architecture.md`：删 Overworld 一节与 `cursor-move` 阶段
- `AGENTS.md`、`README*.md`：删 simulate/print-board/level-graph/overworld/index.txt/cursor 相关条目

## 保留
- `goldens/`、`src/logic/replay.ts`（'z' 回放被 golden 覆盖）、`levels/*.txt`（非 index）、
  `parse-ascii-level.ts` 常规路径、`scripts/*rust-golden*`、`src/tools/import-official-levels*`
- 规则词表中的 `LEVEL` 特殊名词

## 验证
- `pnpm check` 全绿（lint 0/0、type-check、392 tests）
- `pnpm build` 成功产出 release-local/baba-is-you.html（441 KiB）
- 全库残留搜索 `simulate|print-board|level-graph|overworld|cursor-move|Keypress|
  BOARD_SWIPE_MIN_PX|TEXT_CODES|textCodeForName|sortRenderStack|readline`：0 命中
- 过程中顺手修了用户 WIP 的边界/类型问题（不属本任务但阻塞 check）：
  - `board-3d-node-pose.ts` `nodeYawAnimating` 边界改用 `nowMs < start + duration`
    （原 `nowMs - start < duration` 浮点相消，终点恰好返回 true）
  - `app.ts` 补上 `createAppPointerHandlers` 重命名与 `handleMenuCommand` 参数
  - `mapViewportDelta` 横屏旋转方向按其测试注释（上滑=app 右）修正为 `{dx:-dy, dy:dx}`
  - `scripts/tmp-scan-stacked-tiles.ts` `dir?: string | undefined`（exactOptionalPropertyTypes）
