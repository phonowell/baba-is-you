# 真实体素化（voxel volume / B2 手雕模型）

## 目标
sprite 物体从"等厚挤出板"升级为真正 3D 体素体积：逐层 z 切片手雕（可含悬挑、前后凸出），未手雕的 sprite 走回退路径；贴地物（tile/water/belt/line）保持薄板；文字/emoji 保持字板。

## 现状基线
- `pixel-sprites/voxel.ts`：`emitLayer` 单层等高挤出（front+back+边界侧墙），vertex soup 可单测
- 数据：70 个 sprite，24×24 网格；11 个手画多帧（ghost/bat/water/lava/cloud/fire/dust/cog/bubble/belt/cursor），其余 wobble 派生 3 帧
- 渲染：`board-3d-renderer-materials.ts` `voxelVisual`（spec.sprite → voxel / 否则 plate）；`frameGeometries` 换帧；几何缓存 `vox:{key}:{ix}`
- 朝向：实体半 billboard（CARD_FACE_CAMERA_BLEND=0.55）；贴地物平躺不朝向相机

## 数据模型
```ts
type PixelVolume = {
  frontSlices?: readonly PixelFrame[]  // 帧平面前方，i = 第 i+1 层（朝相机凸出，如鼻子）
  backSlices?: readonly PixelFrame[]   // 帧平面后方，i = 第 i+1 层（背部/耳朵体积）
}
PixelSprite.volumes?: readonly (PixelVolume | undefined)[]  // 与 authored frames 平行
```
- 帧平面 = `frames[i]` 本身，保证正面剪影与现有美术一致、无重复抄写
- 每层厚度 = 1 texel → 真立方体素；体积总深 = front+1+back 层，由作者控制比例
- 变换全套复用 2D：`wobble/mirrorX/rotate90` 对 volume = 逐 slice map（z 序不变），belt 旋转/左向镜像自动成立
- 锚定：帧平面固定局部 z（≈现 depth/2），正面观感零回归；深度只向后长，frontSlices 向前凸

## 阶段

### 1. 体素网格引擎
- 新 `pixel-sprites/voxel-volume.ts`：`(x,y,z)` 占据集合 → 六向表面 quad（邻居为空才发面），复用 `pushQuad`/`hexToLinearRgb`/shade 表；输出同一 `VoxelVertexSoup`
- 测试：单格 6 面；2×2×2 块 24 面；空心壳内壁面；L 形悬挑面数；六向剔除
- 退出：`voxelVolumeSoup` 单测绿，不动旧 emitLayer

### 2. 体积数据模型 + 切片工具
- `types.ts` 加 `PixelVolume`/`volumes`；`derive.ts` 加 `wobbleVolume/mirrorXVolume/rotate90Volume`、`volumeContentBounds`（全 slice 并集定界）
- `slices → occupancy` 构建器（'.' 跳过、未知 palette key 跳过——配合阶段 5 校验测试兜底）
- 测试：变换后 z 序保持、bounds 含所有 slice、占据图坐标正确

### 3. 自动膨胀回退（F2）
- `inflateVolume(frame)`：逐层 4 邻域腐蚀生成 backSlices，直到空或深度上限 `VOXEL_INFLATE_MAX_LAYERS`；帧平面保持最前 → 正面剪影零损失，轮廓边缘呈阶梯体积感
- 细瘦 sprite 保底：腐蚀过早消失时保留最后非空层作核心
- 测试：层数上限、单调收缩、2px 细条不消失

### 4. 渲染集成
- `voxelVisual`：每帧 → 体积（`volumes[i]`，缺失帧 → 源帧体积 wobble，无源体积 → inflate 该帧）；z 锚定帧平面 `VOXEL_FRAME_Z≈0.11`；箭头 overlay 锚到最前表面 + lift；描边环只加在帧平面层
- `board-3d-config-voxel.ts`：VOXEL_FRAME_Z、VOXEL_INFLATE_MAX_LAYERS；ground-hug 沿用薄板常量
- 测试：体积视觉的 key/缓存/dispose、箭头 z 位置、贴地物仍走薄板

### 5. 手雕首批模型（baba/keke/me）
- baba：身体背部圆顶、耳朵足深、脸部 frontSlice 前凸 1 层；keke：角与身体分层；me：头发圆顶+脸前凸
- `pixel-sprites` 注册表校验测试：slice ≤24 宽、行内字符全在 palette、volumes 与 frames 对齐
- 退出：三主角在游戏中呈真实体积

### 6. 验证调优
- `pnpm check` + `pnpm build`；agent-browser 打开 release html 截图核对立体感/箭头/堆叠遮挡
- 可选：`CARD_FACE_CAMERA_BLEND` 微调让厚度更显；顶点量体检（全缓存规模）

## 决策/风险
- 决策：帧平面隐式为第 0 层（volume 不重复抄 front 剪影）
- 决策：贴地物/文字板不动，体积路径只覆盖 upright sprite 物体
- 决策（用户确认）：未手雕 sprite → F2 自动腐蚀膨胀成闭合体积，观感统一
- 决策（用户确认）：首批手雕 = baba/keke/me 主角组
- 风险：腐蚀膨胀对细瘦 sprite（2px 腿）会断 → 需保底核心层；顶点量约当前 2-3 倍仍在 trivial 范围
- 风险：多帧 sprite 的 volume 需逐帧配平，缺失帧走回退

## 状态
- 完成：全部 6 阶段
- pnpm check 全绿（328 测试）；pnpm build 通过；release 截图验证：baba 圆体+前凸脸+箭头凸起 ✓、rock 阶梯圆顶 ✓、flag 细杆体积 ✓、wall 砖面+厚度 ✓、tile/字板不变 ✓
- 后续增量：其余 sprite 走自动膨胀，可按需逐选手雕 volumes 覆盖（baba/keke/me 已示范格式）
