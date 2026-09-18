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
- ~~`inflateVolume`~~ **已移除**（用户反馈可见性差）：非手雕 sprite 回退改为 `slabVolume` 平板（`VOXEL_CARD_BACK_LAYERS=6` ≈ 原 0.22 卡深），`erodeFrame` 与三个 inflate 用例一并删除——卡片路径恢复"剪影+厚度"观感

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
- 完成：全部 6 阶段 + 第 7 阶段（四向旋转）
- pnpm check 全绿（330 测试）；pnpm build 通过
- 截图验证：预览页四朝向（down=脸 / right·left=侧面+侧向地箭 / up=背面圆顶+指北箭）；游戏内 down 露脸、up 露背 ✓
- 后续增量：其余 sprite 走自动膨胀，可按需逐选手雕 volumes 覆盖（baba/keke/me 已示范格式）

## 第 7 阶段：真·四向旋转（用户反馈后追加）
用户反馈："浮雕加厚"不是目标——要的是能四向旋转的圆雕。实现：
- **朝向模型**：`applyVolumeOrientation(mesh, roll, yaw)`（`board-3d-card-facing.ts`）——`Rx(90°-VOXEL_STAND_LEAN)` 站立后倾 + `rotateOnWorldAxis(组Z=世界up, yaw)` 绕真竖直轴旋转 + `rotateZ(roll)` 摆动；绕组 Z 转保证 lean 永远朝"背向"，四向的脸/背/侧都抬向 75° 俯角相机
- **管线**：`EntityVisual.facingYaw`（undefined=billboard 卡片 / number=直立旋转模型）→ `EntityNode.facingYaw` → `setNodeIdlePose`/`applyNodePose` 分支；移动拉伸按 yaw 映射到模型局部 X 或 Z 轴
- **分类**：`voxelVisual` 中 `rotates = facing!=null && !groundHug && sprite.volumes?.[0]`——仅手雕体积+有朝向 prop 的实体走旋转；其余走原镜像/dome/billboard 路径
- **yaw 映射**（组空间 Rz）：down=0(正面) right=+90(右侧) up=180(背面) left=-90(左侧)；未设 dir 的 you 实体默认 right
- **几何**：直立模型脚落地面（`drawY` 底对齐 GROUND_SURFACE_Z + `VOXEL_STAND_LIFT`）、深度以身体为中心（`frameFrontZ` 居中）；缓存键 `voxrot:{name}:{ix}` 四向共享
- **箭头**：旋转实体改用 `arrowMarkerSlices`——体素网格画在脚前一层的扁平地面箭头板，始终指向模型前方，随 yaw 转到真实方向；朝北时被模型挡住（背面自解释）；非旋转 sprite 保持原脸部浮雕箭头
- **雕塑**：baba/keke/me 重写为 360° 圆雕——身体厚度贯穿前 2/3 深度、背面宽圆闭合非尖顶、耳朵/角/头发在顶前、脚在前下、尾巴/披风在后下
- 测试：`applyVolumeOrientation` 四向世界法线+直立保持+roll 摆动不翻倒；`getVisual` 无头验证 yaw/undefined 分支（被动实体、无体积 sprite 保持卡片）

## 第 8 阶段：零件化雕塑（用户两次反馈后重做）
用户反馈"捏的很差"+"完全不使用帧图剪影"——手写切片是剪影的复读机，产出的是"脸盘+光蛋"。改为纯零件雕塑：
- **`pixel-sprites/parts.ts`**：`volumeFromParts` 把 box/ellipsoid 零件栅格化成完整 PixelVolume（含 z=0 `frame` 切片——`PixelVolume.frame` 新字段，存在时替代 sprite 帧面且不发描边环）；不再有剪影/浮雕来源，2D 帧只剩非旋转回退路径在用
- **雕塑构成**：baba=近球椭身体+耳桨+脚块+尾块+'f'脸垫+'e'眼；keke=椭球+角块+喙+尾；me=兜帽椭球+袍椭球+手+鞋+脸垫。无盒芯、深宽≈1:1——俯视下是球不是砖
- 验证：`pnpm check` 331 绿；预览四向截图（耳/角/兜帽/喙各面可读）；游戏内 down=脸+耳、left/right=侧身 figurine
