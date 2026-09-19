# 贴地元素 tile 化加强（autotile 拼边 + 位置对齐）

## 目标
- `line`：按邻接连接关系生成路径形状（直/弯/T/端点/孤立），臂伸到格边、凸角倒角——overworld 路径连成连续线路而不是每格一根横条。连接对象：`line`/`level`/`door`。
- `water`/`lava`/`tile`/`tile_*`：朝非同类格的边画岸线/倒角边（8 邻接 mask，含对角→凹内角），边缘过渡自然（水波纹 scallop、熔岩结壳、砖倒角）。
- 位置对齐：贴地件帧偏移统一为 0——相邻格同步播帧，满幅周期图案在格缝处保持连续。

## 方案
- 新增 `src/web/pixel-sprites/autotile.ts`：8-bit 邻接 mask 常量、`autotileJoins(name, neighbor)` 连接策略、`autotileSprite(sprite, name, mask)` 返回变体 sprite（区域件加边饰；`line` 按 mask 生成 3 帧相同的 path shape，消除 wobble 错位）。
- 新增 `src/web/board-3d-autotile.ts`：`buildAutotileCells(state)` 建格→名字集合查找表（跳过 hide/text），`autotileMaskForItem` 算 8-bit mask。
- `board-3d-renderer-materials.ts`：`getVisual(item, overridden, tileMask)`；visual/geometry cache key 带 mask；`voxelVisual` 对贴地 sprite 过 `autotileSprite`。
- `board-3d-node-sync.ts`：每次 sync 建一次查找表，逐贴地件算 mask 传入 `getVisual`/`createNode`。
- `board-3d-shared-item.ts`：`idleFrameOffsetForItem` 贴地件返回 0。
- `board-3d-node-types.ts`/`node-create.ts`/`renderer-factory.ts`/`renderer-runtime.ts`：签名贯通。

## 测试
- 新 `src/web/board-3d-autotile.test.ts`：mask 计算（line 连 level/door、water 只连同名、孤立格）；`autotileSprite` line 形状（直条贯通、拐角、端点）与水岸线只出现在朝空边；`idleFrameOffsetForItem` 贴地=0。
- `board-3d-renderer-materials.test.ts`：mask 进 visual key、贴地 maxZ 不变。

## 状态
- [x] autotile.ts（sprite 变体生成）
- [x] board-3d-autotile.ts（mask 计算）
- [x] 渲染链路贯通（materials/sync/create/factory/runtime）
- [x] 帧对齐（idleFrameOffset 贴地=0）
- [x] 回归测试 + `pnpm check` + `pnpm build` + 目检

## 完成记录
- `pnpm check` 全绿（430/430 tests，oxlint 0 警告）；`node scripts/build-single-html.mjs` 构建通过
- 目检（headless Edge + CDP 截图，/tmp/cdp-*.png）：
  - overworld：`line` 连成带圆角、有岔口的路径网络并接入图标
  - 3level（OUT OF REACH）：水塘外圈连续岸线、水渠两侧岸沿、`tile` 大板边缘倒角
  - 12level（SEPARATED BY LIQUIDS）：1 格宽岩浆柱两侧暗红壳边连续贯通
- 注意：autotile 的全网格锚定只对 autotile 件生效，belt 仍走内容 bounds 拉伸

## 追加：区域角圆角化（autofill rounded corners）
- `TileEdgeStyle` 新增 `cornerRadius`：water/lava=8、tile=4
- 凸外角（两邻边开放）按 `cornerRadius` 弧线真实裁切填充为 '.'——轮廓本身变圆而非仅换色；rim/accent 沿弧包裹
- 凹内角（两邻边接合+对角空）按 `rimDepth` 刻小缺口并绕 rim/accent 环——缺口深度等于邻格 rim 带宽，保证 rim 始终贴边
- 单开放边角不处理（岸线带自然贯通）；`line` 路径不受影响
- `pnpm check` 全绿（433/433），`pnpm build` 通过；像素级 pool 渲染目检确认外角圆弧、内凹缺口、半岛端头圆帽
