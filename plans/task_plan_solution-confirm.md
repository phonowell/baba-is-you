# task_plan_solution-confirm

## 目标
底栏改为左右两簇：`[level badge][▶ Solution] ---- [操作提示][Controls]`（Solution 与关卡名同在
左侧，操作提示文字与 Controls 同在右侧）；Solution 加 ▶ 图标表明是"执行"类操作；点击 Solution
不再直接播放，先弹二次确认框（进度会丢失），确认后才 `start-replay`。

## 方案
- 新增 `showReplayConfirm` 进入 `WebAppStateData`/snapshot（与 `showReferenceDialog` 平行），
  动作 `open-replay-confirm`/`close-replay-confirm`；两弹窗互斥，`reset-level`/`return-to-menu`/
  `start-replay`/`enter-game` 一律清除。
- 确认框 DOM 挂在 game view（`replay-confirm-backdrop` + `replay-confirm-dialog`，data-role 与
  reference 同规约），按钮：`confirm-replay`（Play, primary）与 `cancel-replay`（Cancel）。
- 事件层：`play-replay` → `openReplayConfirm`；`confirm-replay` → `closeReplayConfirm + playReplay`；
  `cancel-replay`/背景点击/Escape → `closeReplayConfirm`；Enter → 确认播放。
- 弹窗打开期间屏蔽棋盘输入：pointer `boardReady`、keydown、gamepad dialog 门都纳入
  `isReplayConfirmOpen`；hover tip 同 reference 一样隐藏。
- Solution 按钮：`aria-haspopup="dialog"` + `aria-expanded`，内嵌 `.btn-icon`（▶）+ 文案；
  确认框 Play 按钮同款图标。

## 步骤
1. `app-model.ts`：`showReplayConfirm` 字段、两个动作、互斥与清除、snapshot/change-gate
2. `app-controller.ts`：`isReplayConfirmOpen`/`openReplayConfirm`/`closeReplayConfirm`
3. `app-events.ts`：viewState+context 扩展，动作路由与 keydown 分支
4. `app-pointer.ts`：viewState 接口 + `boardReady` 纳入 confirm
5. `app-gamepad.ts`：viewState 接口 + `closeReplayConfirm`（可选）+ B 关闭分支
6. `app-game-view.ts`：toolbar 改两簇（badge+Solution 左，status+Controls 右）、图标、确认框 DOM、
   update 处理；`.status` flex:1 + `text-align:right` 使提示贴右簇
7. `app-draw.ts`/`app.ts`：snapshot→viewUpdate 透传；playReplay 提为共享 const 并接线新 context
8. `style.css`：`.replay-btn`/`.btn-icon` + `.replay-confirm-*` 样式
9. 测试：改 events/pointer/gamepad/draw/game-view fixtures；新增 reducer/路由/弹窗行为用例
10. `docs/web-architecture.md` 同步状态/动作/输入源描述
11. `pnpm check` + `pnpm build` 验证

## 状态
全部完成。`pnpm check` 全绿（lint 0/0、tsc 干净、891 tests pass）；`pnpm build` 产出
`release-local/baba-is-you.html`。浏览器冒烟：底栏 `[001 badge][▶ Solution]` 左 /
`[操作提示][Controls]` 右；点 Solution 弹 "PLAY SOLUTION?"（Play 金色 primary + Cancel），
确认后回放跑至 Level Clear。另修复 fullscreen 下玻璃 chip 规则盖住 `.replay-confirm-btn.primary`
金色的特异度问题（与 outcome-btn 同模式补 `body.game-3d-fullscreen` 重述）。
