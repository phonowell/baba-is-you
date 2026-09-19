# 移动端优化

计划类型：implementation

## 目标
- 手机可完整游玩：菜单滑动选关/翻页 + 点按进关；游戏内 swipe 移动 / tap 等待 / HUD 按钮（已有，补齐周边）
- 布局适配移动浏览器：dvh 视口高度、safe-area-inset 刘海/手势条、触控目标 ≥44px
- 消除触屏副作用：双击缩放、sticky hover、长按菜单/选中、下拉刷新、tap 高亮
- 复用现有命令管线（`handleMenuCommand`/`handleGameCommand`），不产生平行输入路径

## 现状与缺口
- `src/web/app-pointer.ts` 仅在 game 模式且 `.board` 上追踪手势；menu 模式早退 → 菜单窗口外关卡触屏不可达
- `src/web/style.css`：`100vh`、无 safe-area、`.icon-btn` 34px、hover 未按 pointer 类型门控、无 `touch-action: manipulation`/`overscroll-behavior`
- `scripts/build-single-html.mjs`：viewport meta 无 `viewport-fit=cover`，无 `theme-color`
- `src/view/render-menu-html.ts` + `src/web/app-game-view.ts`：提示文案只有键盘/手柄

## 分层
- `src/view/input.ts`：新增 `mapMenuGesture`（swipe→菜单命令，滚动自然语义：内容上滑→选下一个/翻下一页）；`MENU_TOUCH_CONTROLS`/`GAME_TOUCH_CONTROLS` 触控提示词表；`BOARD_SWIPE_MIN_PX`→`SWIPE_MIN_PX`、`BoardGesture`→`SwipeGesture`（阈值与类型被菜单复用，去掉 board 前缀）
- `src/web/app-pointer.ts`：扩展为应用级手势层（导出名 `Board*`→`App*`）：menu 模式在 `.menu-list` 上追踪 swipe→`handleMenuCommand`；menu 不 preventDefault（tap 由 click 管线进关）；消费过的菜单 swipe 置 `suppressClick`，由 `consumeSuppressedClick()` 供 click 管线吞掉尾随 click
- `src/web/app-events.ts`：`createRootClickHandler` 增加可选 `consumeSuppressedClick` 依赖，命中即忽略该次 click
- `src/web/app-lifecycle.ts`：类型改名跟进 + root 上 `contextmenu` preventDefault（安卓长按菜单）
- `src/web/app.ts`：装配 `handleMenuCommand` 与 `consumeSuppressedClick` 接线（pointerHandlers 先于 click handler 创建）
- `src/view/render-menu-html.ts`：页脚加 `menu-hint--touch` 行（MENU_TOUCH_CONTROLS），keys/gamepad 行加修饰类供 CSS 门控
- `src/web/app-game-view.ts`：Controls 段包 `.key-controls`，新增 `.touch-controls` 段（GAME_TOUCH_CONTROLS）
- `src/web/style.css`：dvh、safe-area、coarse pointer 目标尺寸、hover 门控、touch-action/overscroll/tap-highlight/user-select/text-size-adjust、窄屏 toolbar 折行、触控提示行可见性
- `scripts/build-single-html.mjs`：viewport 加 `viewport-fit=cover`，加 `theme-color`

## 步骤
1. `src/view/input.ts` + `input.test.ts`：`mapMenuGesture`、触控词表、常量改名（进入：现状；退出：新映射有测试；验证：`pnpm test`）
2. `src/web/app-pointer.ts` + `app-pointer.test.ts`：菜单手势路径 + suppressClick + 改名（退出：菜单 swipe→命令、tap 不产生命令、swipe 后 click 被吞；验证：`pnpm test`）
3. `src/web/app-events.ts` + `app-events.test.ts`：consumeSuppressedClick（退出：被吞 click 不进关；验证：`pnpm test`）
4. `src/web/app-lifecycle.ts` + `app.ts`：contextmenu、装配接线（退出：tsc 通过；验证：`pnpm type-check`）
5. `render-menu-html.ts` + `app-game-view.ts`：触控提示渲染（退出：markup 含 touch 段；验证：`pnpm test`）
6. `style.css` + `build-single-html.mjs`：移动端 CSS 与 meta（退出：`pnpm build` 产物含 viewport-fit/theme-color/dvh/safe-area）
7. README×3 Controls 加触控行；`pnpm check` 全绿 + 构建产物目检

## 风险
- 菜单 swipe 与原生 click 的交互：选择“不 preventDefault + 吞尾随 click”方案（preventDefault pointerdown 对 click 的抑制有浏览器差异，flag 方案确定性高）
- `.menu-list` 设 `touch-action:none` 后短屏无法原生滚动，但滑动窗口本身可遍历全部关卡，可接受
- 触屏判定用 `(pointer: coarse)` 主指针语义，触屏笔记本（fine 主指针）仍显示键鼠提示 — 符合预期

## 状态
- [x] 已完成

## 追加需求与验证记录
- 用户追加：手机强制横屏 → `@media (orientation: portrait) and (pointer: coarse)` 将 `#app` 旋转 90°（侧显即旋转提示），`app.ts` 用同一 matchMedia 镜像 `mapViewportDelta` 把 client 增量逆变换回 app 坐标
- 浏览器实测（Chrome for Testing，390×844）：菜单适配竖屏视口；上滑选中 0→1、左滑翻页 1→11、尾随 click 被吞不进关、tap+click 正常进关；9 条媒体规则全部加载
- 实测中发现并修复：`mapViewportDelta` 误用正向旋转 `(dx,dy)→(-dy,dx)`，已改为逆变换 `(dx,dy)→(dy,-dx)`（rotate(90deg) CW 下屏幕增量→app 增量的正确逆映射），单测同步更新
- 验证：401 tests 全过、lint 0 错、`pnpm build` 产物含 viewport-fit/theme-color/dvh/safe-area/coarse+portrait 媒体块
- 遗留：`tsc --noEmit` 报 `scripts/tmp-scan-stacked-tiles.ts(72,19)`（用户进行中的临时脚本，exactOptionalPropertyTypes 预存问题，与本次改动无关）
