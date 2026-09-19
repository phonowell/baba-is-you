# 计划：本地版关卡内 golden 回放按钮

## 需求
- local 版本（`pnpm build` → `release-local/baba-is-you.html`）在游戏关卡内提供一个按钮，可播放测试用 goldens（`goldens/**/*.json`，85 条通关回放）
- 交互：关卡内按钮 → 回放选择对话框（列出全部 golden：名称 + 解析出的关卡标题）→ 选一条 → 载入该 golden 自身记录的关卡，自动逐步回放 inputs
- 纯观赏：回放期间忽略一切游戏输入（move/wait/undo/restart/next），仅 `back-menu`（Q/菜单键/Escape 之外的退出路径）可中止并回菜单；播完后恢复手动操作
- 仅本地：`--deploy` 构建不打包 golden 数据、不显示按钮

## 设计
1. **构建**：`scripts/build-single-html.mjs` 增加 esbuild 插件解析虚拟模块 `baba-goldens`：本地模式扫描 `goldens/**/*.json`，每条产出 `{name, inputs, levelData?, levelText?}`（levelText 为对应 `levels/**/*.txt` 原文，运行时 `parseAsciiLevel` 解析）；`--deploy` 返回空数组 → 按钮不出现、数据不进包
2. **类型**：`src/web/baba-goldens.d.ts` ambient module 声明（同 `n8ao.d.ts` 先例）
3. **数据解析**：`src/web/app-goldens.ts` — `goldenReplays`（name/title/inputs/level），ASCII 经 `parseAsciiLevel` 解析（logic 纯函数，无 node 依赖；禁止引 `replay.ts`，其含 `node:crypto`）
4. **输入解码单一事实源**：`src/logic/replay-input.ts` 新增 `decodeReplayInput`（u/d/l/r→move、w→wait、z→undo、其他→skip），`replay.ts` 改用它，web 侧共用
5. **模型** `app-model.ts`：
   - `replay: {name, inputs, cursor} | null`、`customLevel: LevelData | null`、`showReplayDialog: boolean`
   - 动作：`start-replay`{name,inputs,level}、`replay-step`、`open-replay-dialog`、`close-replay-dialog`、`toggle-replay-dialog`
   - `reset-level` 加可选 `level` 载荷（restart 复播 golden 关）；`return-to-menu`/`enter-game`/带 index 的 `reset-level` 清 replay+customLevel
   - snapshot 派生 `replay:{name,cursor,total}|null`、`showReplayDialog`；`hasViewStateChanged` 同步
6. **指令门** `app-commands.ts`：replay 进行中所有游戏指令（move/wait/undo/restart/next）→ null；仅 `back-menu` 放行（中止回放回菜单）；`restart` 携带 `state.customLevel`
7. **驱动** `src/web/app-replay.ts`：订阅 store，replay 非空即起 `setInterval(stepMs=150)` 派发 `replay-step`，空则停；`dispose` 清定时器（注入 schedule/cancel 便于测试）
8. **视图** `app-game-view.ts`：toolbar 加 `Replays` 按钮（仅 replays 非空时渲染）；新增 replay 选择对话框（复用 reference-backdrop 视觉体系）；状态行在回放时显示 `REPLAY name cursor/total`；`update` 签名改 view 对象
9. **事件**：`app-events.ts`（新 action + overlay 门）、`app-pointer.ts`（gameReady 加 replayDialog）、`app-gamepad.ts`（B 键关 replay 对话框）
10. **装配** `app.ts`：接 `goldenReplays`、`playGolden`、replay 驱动（dispose 挂进 onDispose）
11. **样式** `style.css`：replay 对话框沿用 reference 视觉体系，列表可滚动
12. **测试**：`src/web/app-replay.test.ts`（新文件，行为域命名：回放推进/阻断/接管/驱动生命周期）；更新 `app-draw.test.ts` 快照字面量、`app-events.test.ts` 的 viewState 辅助（新字段可选，默认 false，旧夹具不炸）
13. **验证**：`pnpm check` + `pnpm build` + `pnpm build:deploy`（确认部署版无 golden 数据、无按钮）

## 边界
- 不改 logic 规则；`replay-input.ts` 只抽取解码表供 `replay.ts` 与 web 共用（`replay.ts` 含 node:crypto，web 禁引）
- deploy 构建产物零 golden 数据、零按钮
- 回放中游戏输入全忽略（含指针滑动/手柄），仅 back-menu 可中止回菜单
