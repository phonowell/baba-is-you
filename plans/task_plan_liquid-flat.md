# 水面/熔岩贴地（liquid ground-hug）

## 目标
water 与 lava 应作为贴地液面渲染，而非立起的卡片。

## 诊断
- `lava` 不在 `GROUND_HUG_NAMES`（`src/view/stack-policy.ts`）：`cardFacesCamera(lava)=true`，垂直 billboarding —— 真"立起来"。
- `water` 已在贴地集合（平躺不朝向相机），但贴地薄板沿用立卡的 `VOXEL_FRAME_Z=0.11`：板面顶在 -0.109，离地面（-0.24）悬空约 0.13，读作漂浮的卡片而非地面。
- water/lava sprite 原为画面中部横带（水塘截面），平躺后呈条状贴片，读作卡片而非液面。

## 方案
- `stack-policy.ts`：`GROUND_HUG_NAMES` 增加 `lava` → 平躺、贴地 z、无投影、地面层叠。
- `board-3d-config-voxel.ts`：新增 `VOXEL_GROUND_HUG_FRAME_Z=0.02`，贴地板面高出地面 ~0.04（背层沉入地下，边缘被地面遮住）。
- `board-3d-renderer-materials.ts` `voxelVisual`：贴地 sprite 的 frameFrontZ 用新常量；绘制尺寸从卡片内缩（0.74）改为整格 1.0 —— 地砖/传送带/路径线本来就是占满格子的地面，水/岩浆铺满后相邻格拼成连续液面。
- `terrain.ts`：water/lava sprite 改为 24×24 满幅液面（无缝平铺的周期波纹：正弦整数周期），各 3 帧错位闪烁；lava 新增暗色结壳键 `d`。

## 测试
- `board-3d-card-facing.test.ts`：`cardFacesCamera(lava)=false`（回归锁）。
- `board-3d-renderer-materials.test.ts`：water/lava 几何顶面 z == `VOXEL_GROUND_HUG_FRAME_Z`，upright（wall）== `VOXEL_FRAME_Z`。

## 状态
- [x] `lava` → `GROUND_HUG_NAMES`
- [x] `VOXEL_GROUND_HUG_FRAME_Z` + 整格绘制接入 `voxelVisual`
- [x] water/lava sprite 重绘
- [x] 回归测试
- [x] 构建 + 目检 + `pnpm check`（level 10 lava 呈平地熔岩河；level 4 water 呈平地水池；353 tests 全过）
