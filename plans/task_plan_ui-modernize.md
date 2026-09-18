# UI 与棋盘操作现代化

目标：让游戏在触屏/鼠标下可玩，动作入口可见可点，相机有视差点缀与震动反馈。

## Phase 1 — 棋盘操作现代化
- [x] `src/view/input.ts`：`mapBoardGesture`（swipe→move，tap→wait）+ 手势阈值常量 + GAME_CONTROLS 文案
- [x] `src/view/input.test.ts`：手势映射测试（四向、主轴判定、阈值、tap）
- [x] `src/web/app-pointer.ts`：Pointer Events 接线（board 上 pointerdown/move/up，一次按下至多一次移动；tap→wait）；复用 cooldown 与"无效不算已处理"
- [x] `src/web/app-pointer.test.ts`
- [x] `src/web/app-game-view.ts`：工具栏动作按钮（Undo/Wait/Restart/Menu，inline SVG icon）+ 胜负结算浮层（Next/Undo/Restart/Menu）
- [x] `src/web/app-events.ts`：新增 data-action 分发
- [x] `src/web/app-events.test.ts` 更新
- [x] `src/web/style.css`：`touch-action:none`、icon 按钮、结算浮层样式
- [x] `app.ts` / `app-lifecycle.ts`：注册 pointer 监听与 dispose

## Phase 2 — 进度持久化
（用户取消：不做存储功能）

## Phase 3 — 点缀
- [x] `src/web/board-3d-parallax.ts`：相机位置偏移 easing（只动 position 不动 quaternion，billboard 无需重摆姿势）；captureBase 在 updateCamera 后
- [x] `board-3d-renderer-runtime.ts`：`setParallaxTarget` + tick 内驱动（活动期保 RAF，收敛即停）+ captureBase 挂接点 + unmount 归零
- [x] `board-3d-renderer-factory.ts`：装配 `createCameraParallax()`
- [x] `app-pointer.ts`/`app.ts`：pointermove → setParallaxTarget（仅 mouse + 游戏态；非 mouse/离板/离 app 归零）；reduced-motion 下不接线
- [x] 震动：`navigator.vibrate?.` 特性检测；`onHandledAction`（仅状态真推进后）小动作反馈；store 订阅状态迁移，win/complete→[30,40,30]、lose→20
- [x] 测试：`board-3d-parallax.test.ts` 收敛/重放语义 + runtime RAF 用例

## 验证
- [x] `pnpm check`（lint + type-check + test）：370 tests 全过
- [x] `node scripts/build-single-html.mjs`：`release/baba-is-you.html` ~1.1MB
- [x] 浏览器冒烟：菜单渲染、HUD 五按钮、swipe→Baba 右移一格、8×→win→"Level Clear" 浮层 + Next Level 可见（`navigator.vibrate` 桌面无 API 自然 no-op）
