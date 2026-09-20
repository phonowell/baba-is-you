# task_plan_cell-hover

鼠标悬停格子：3D 场景内轻微高亮该格 + 跟随光标的克制 tooltip（坐标 + 该格所有卡片名）。

## 状态
已完成（验证通过）

## 方案
- 拾取：`pickBoardCell`（`board-3d-hover.ts`）——指针射线 unproject 后与棋盘平面（world y = 棋盘局部 z，`GROUND_ACTIVE_FILL_Z`）求交，映射回 cell；world 组有 `WORLD_ROTATION_X=-90°`，已按 world 坐标推导。
- 高亮：`createBoardHoverVisual` 在 `world` 里挂一个圆角 ShapeGeometry 半透明薄片（z 略高于 ground-hug 卡片），runtime 新增 `setHoverAtPoint`/`clearHover`，按需 `needsRender + ensureFrame`，不常驻 RAF。
- Tooltip：`.board-hover-tip` DOM 挂在 `boardWrap`（`board` 会被 mount 清空），跟随光标、边缘翻转。
- 输入：`app-pointer` 仅在无按压拖拽时上报 hover（`onBoardHover`/`onBoardHoverEnd`），滑动消耗、cancel、leave 时结束；lifecycle 补 `pointerleave`。
- 竖屏旋转：沿用 `portraitTouchQuery`，点与 rect 统一逆旋转回 app 空间。
- `levelOffset` 滚动关卡：高亮落在光标下视觉格；tooltip 换算回逻辑格显示坐标与卡片名。
- 状态推进后刷新已停驻的 hover（store subscribe）。

## 文件
- [x] `board-3d-config-layout.ts`：HOVER_CELL_* 常量
- [x] `board-3d-hover.ts`（新）：pick + visual
- [x] `board-3d-renderer-runtime.ts` / `-factory.ts`：接入 hover
- [x] `app-hover.ts`（新）：逻辑格换算、卡片名、tip 定位、控制器
- [x] `app-pointer.ts` / `app-lifecycle.ts` / `app-game-view.ts` / `app.ts`：接线
- [x] `style.css`：tip 样式
- [x] 测试：`board-3d-hover.test.ts`、`app-hover.test.ts` 新增；`app-pointer.test.ts` 与 `board-3d-renderer-runtime.test.ts` 增补
- [x] `pnpm check`：571/572 通过；唯一失败 `golden replay 061-perilous-gang` 来自工作区并行 solver 改动的未跟踪 golden，与本改动无关
- [x] `pnpm build`：`release-local/baba-is-you.html` 626 KiB
- [x] 浏览器实测：`(20, 10) flag`、空格 `(26, 14)`、文本卡 `(12, 6)IS`、边缘翻转、移出隐藏均已验证

## 性能优化（二轮）
pointermove 热路径从"每事件 2×gBCR + 2×offset 强制布局读 + O(items) 扫描 + 全量 DOM 写"降到"1×gBCR（布局干净）+ raycast + ≤1 transform 写"：
- tip 定位 `left/top` → `transform: translate3d`（不弄脏布局；CSS 加 `will-change`）
- `createHoverTipWriter`：textContent/toggleAttribute 只在内容变化时写，offsetWidth/Height 只在内容变化后测一次，transform 只在位置变化时写，hide 去重
- `namesFor`：names 按 (state 引用, x, y) 缓存，O(items) 扫描只在格/回合变化时跑
- board rect 单次读取：game 模式 board 填满 wrap，一份 rect 兼作 pick 区与 tip 边界
- `move` 按 (board, x, y) 去重
- 修复 refresh 在对话框打开那一拍把 tip 重新显示到模态框上的问题（新增 `isBlocked` 守卫）
- 测试：app-hover.test.ts 12 个用例（新增 dedupe/names 缓存/dialog 守卫锁）；632/632 全过；lint 仅剩并行 solve 文件的既有问题
