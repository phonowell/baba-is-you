# 卡片辨识度修复（贴图品质低/不可辨）

## 诊断（已用构建产物 patch + 截图逐项验证）

1. **BokehPass 焦距错误（主因）**：`updateBokehFocus` 用 `camera.position.z`（4-8）作焦距，但相机在 16-32 高度俯视，棋盘视深 ≈ hypot(高度, z) ≈ 4 倍于此 → 全盘脱焦，文字卡糊成光团。实验：`aperture:0` 后 BABA/ROBOT 等立刻清晰。
2. **无 MSAA**：`antialias:false` + composer RT `samples:0` → 卡片/体素边缘锯齿。
3. **贴图无 mipmap**：`createCanvasTexture` minFilter 用 `Linear`（非 `LinearMipmapLinear`）→ 文字/牌面缩小时 aliasing。
4. **精灵无轮廓**：白色精灵（baba）暗部被 emissive 抬升 + 无描边 → 糊成白团，剪影不可辨。

## 修改

- `board-3d-renderer-camera.ts`：计算相机→lookAt 点距离，传给 `updateBokehFocus(focus)` 作真实视深
- `board-3d-renderer-view.ts`：`updateBokehFocus` 接收焦距参数并缓存；`applyReadabilityGuard` 的 uniform 刷新复用上次焦距
- `board-3d-renderer-scene.ts`：EffectComposer 换用 `WebGLRenderTarget({ samples: 4, type: HalfFloatType })`（WebGL2 MSAA 走 RenderPass）
- `board-3d-textures.ts`：非 nearest 贴图 `minFilter = LinearMipmapLinearFilter`（generateMipmaps 默认 true）
- `pixel-sprites/voxel.ts` + `board-3d-config-voxel.ts`：可选体素描边——主层 cell 图外扩 1 圈深色剪影格（非 ground-hug 项启用；texel 宽度 < 内区留白，不裁切）
- `board-3d-renderer-materials.ts`：`voxelVisual` 传 outline 开关（`!isGroundHugItem`）
- `pixel-sprites/voxel.ts`：顶点色 sRGB→linear 解码（`hexToLinearRgb`）——修掉所有精灵颜色系统性变亮变淡的根因
- `pixel-sprites/voxel.test.ts`：shading 断言同步为线性期望值

## 验证

- `pnpm check`（lint + type-check + test）✅ 321 全过
- `pnpm build` → 截图对比 level 0/6：文字卡可读、baba/rock/flag/草地剪影与内部明暗可辨、边缘抗锯齿 ✅
- 补丁实验佐证：`aperture:0` 恢复文字清晰度 → 定位 bokeh 焦距为糊化主因；`hexToRgb` 线性化恢复精灵明暗层次

## 后续可选项（未做）

- 相机 spanPadding/distancePadding 收窄（大盘仅 ~10% 收益，且 CAMERA_TIERS 正被并行调整）
- 文字卡 bloom 光晕（阈值/emissive 由视觉升级 preset 管，当前可读）
- 精灵内部细节再放大需重绘 24px 源图，属美术工作量

## 状态：完成
