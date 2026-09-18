# 贴地件一致性修正（belt 箭头 / tile 满幅 / tile_* 归类）

## 目标
- belt：sprite 已按 `rotatesWithDirection` 旋转指示方向，去掉冗余的方向箭头 overlay。
- tile（含 tile_5_10/tile_9_10）：sprite 重绘为与 water/lava 一致的满幅无缝地面。
- tile_* 导入命名归入贴地集合，避免未来导入未识别 tile 立起来。

## 方案
- `board-3d-renderer-materials.ts` `voxelVisual`：overlay 条件加 `!spec.rotatesWithDirection`（rotates 的直立模型与旋转 sprite 都自带方向）。
- `stack-policy.ts`：`isGroundHugItem` 增加 `name.startsWith('tile_')` 前缀覆盖（import-official-levels-convert 生成 tile_<x>_<y>）。
- `terrain.ts`：tile/tile_5_10/tile_9_10 改 24×24 满幅无缝纹理（周期场 mottle 静态 + 每帧 ~9 个 glint 闪点），各 3 帧、保留各自 palette。

## 测试
- `board-3d-card-facing.test.ts`：`cardFacesCamera(tile)=false`、`cardFacesCamera(tile_5_10)=false`。
- `board-3d-renderer-materials.test.ts`：flat maxZ 断言覆盖 water/lava/tile/tile_5_10/belt —— belt 的 maxZ==VOXEL_GROUND_HUG_FRAME_Z 锁住「无箭头凸出」。

## 状态
- [x] belt 箭头 overlay 移除
- [x] tile_* 前缀归入贴地
- [x] tile 系 sprite 重绘（216 行全 24 字符）
- [x] 回归测试
- [x] 构建 + 目检 + `pnpm check`（level 8 belt 无箭头只剩旋转斜纹；level 4 tile 呈连续深色地面；375 tests 全过）
