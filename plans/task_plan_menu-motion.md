# 菜单/全局 UI 对齐 + Baba 风动效

## 目标
- 整体 UI 对齐菜单视觉语言（kbd 芯片、奶油金配色、字距）
- 保持菜单首页高级质感，只加动效不改设计
- 动效贴合 Baba 像素风：squash-stretch、steps 翻页感、短促克制

## 已完成

### 结构
- `src/view/render-menu-html.ts`：`MenuHtmlState.animateEntrance`；行/`⋮` 带 `--row-i` 错峰变量；`.menu-inner` 带 `--rows`；`menu-enter` 类仅入场帧渲染；导出 `menuWindowRange`/`menuPositionHtml` 供就地更新复用（单一事实源）
- `src/view/input.ts`：`MENU_CONTROLS` 与 `GAME_CONTROLS` 并列，菜单/弹层共用
- `src/view/render-html.ts`：controls 列表渲染为 `hint-item` + `kbd` 芯片
- `src/web/app-game-view.ts`：`statusEl.dataset.status = state.status` 供状态着色
- `src/web/app-draw.ts`：`updateMenuInPlace` —— 同窗口选中变化只切 `selected`/`aria-selected`/◆/位置读数，不重建 DOM；窗口滑动才整渲；`animateEntrance: modeChanged` 仅进菜单播入场

### 动效（style.css）
- `menu-item-in` 入场级联（`.menu-enter` 作用域，行按 `--row-i` 错峰）
- `marker-wiggle` 选中 ◆ squash-stretch 两帧抖动
- `menu-more-pulse` `⋮` 呼吸脉冲（入场期间与级联并列不掉）
- `toolbar-in` 游戏 toolbar 上滑入场
- `status-win-glow` win/complete 金光脉冲、lose 红粉色
- `backdrop-in`/`dialog-in` 弹层入场
- 全部受既有 `prefers-reduced-motion` 全局禁用覆盖

## 验证
- `pnpm check` 全绿（lint + tsc + 349 tests）
- `pnpm build` 通过
- 浏览器实测：
  - 入场级联截图截到中间帧（逐行淡入）
  - 同窗口 ↓：screen/row 元素不变（就地更新），选中/读数跟随
  - 越窗口 ↓×9：整渲、窗口滑至 [5,15)、`menu-enter` 不重现、上下 `⋮` 齐
  - 进游戏：toolbar + `data-status="playing"`；弹层 6 个 kbd 芯片
  - Q 返回：`menu-enter` 重挂、选中保持
- 修复：`.controls-list .hint-item kbd` 提升优先级（`hint-item` 的 cream 字色曾覆盖 dialog 深金配色导致芯片文字不可读）

## 未覆盖
- win/lose 状态 glow 仅代码级确认（未实机通关验证）
- marker-wiggle/⋮ 脉冲为常驻 CSS，截图无法分辨，靠规则正确性保证
