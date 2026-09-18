# 体素化渲染（voxel sprites)

## 目标
把所有卡片实体替换为体素模型:sprite 物体 → 逐像素挤出的像素浮雕;文字/emoji → 带厚度的字板;贴地物 → 薄板。方向箭头作为前层凸起体素。

## 方案

### 几何生成(`src/web/pixel-sprites/voxel.ts`)
- 每个着色像素 → 前面 quad(顶点色);边界边(邻居为空)才发侧面 quad;背面逐像素暗面
- 明暗烘焙进顶点色:front 1.0 / top 1.2 / side 0.75 / bottom 0.5 / back 0.35
- 箭头作为第二层:在 `depth/2 + lift` 处再发一层 voxel;`arrows.ts` 返回双层 overlay —— `dilateFrame` 深色描边在下(0.55·lift),白色箭头在上。3D 凸起仍要在白 sprite 上可读,描边层替代贴图路径的 shadow pass
- 网格→世界:cell (x,y) → 局部 ((x+0.5)/24-0.5, 0.5-(y+0.5)/24)*size;front 朝 +z
- 输出 BufferGeometry(position/normal/color/index)

### 视觉仓库(`board-3d-renderer-materials.ts`)
- `getMaterial` → `getVisual(item, overridden)` 返回 `{ geometry, material, frameGeometries }`
  - sprite 物体:voxel 几何缓存 `vox:{key}:{dir}:{ix}`;共享 `vertexColors` MeshStandardMaterial;`frameGeometries` = 全帧
  - 无 sprite(文字/emoji/marker):共享 BoxGeometry 字板 + 材质数组 `[边×4, 前面纹理材质, 边]`;前面仍走原贴图材质(缓存/animatedFrames 机制保留)
- 几何缓存纳入 `dispose`;voxel/edge 材质一并释放
- `advanceNodeGeometries(nodes, ix)` 纯函数:换 `node.mesh.geometry`,返回变更数

### 节点
- `EntityNode.mesh` 放宽为 `Mesh<BufferGeometry, Material|Material[]>`;新增 `frameGeometries?: BufferGeometry[]`
- `CreateEntityNodeDeps/SyncEntityNodesDeps.getMaterial` → `getVisual`;sync 对 spec 变化同步换 geometry+material+frameGeometries(如 belt 转向)
- `cardGeometry` 依赖移除(plate 几何由仓库共享持有)

### 动画
- factory:`advanceSpriteFrames = advanceFrameMaps(maps) + advanceNodeGeometries(nodes)`,合并变更数喂给现有定时器逻辑 —— 仍不常驻 RAF

### 配置(`board-3d-config-voxel.ts`)
- VOXEL_DEPTH_OBJECT / VOXEL_DEPTH_GROUND(贴地薄板)/ VOXEL_PLATE_DEPTH(字板)/ VOXEL_ARROW_LIFT + 各面明暗系数

## 边界情况
- `isEmojiItem` 微拉伸仍作用于字板 mesh scale;castShadow 保留(体素投影更真)
- `rotatesWithDirection`(belt)/`mirroredSprite`(左向)在几何生成前应用,与贴图路径同一朝向逻辑
- 背面逐像素发面(不用单块底板)—— 保证镂空 sprite(环状)孔洞正确

## 测试
- voxel:实心帧面数上界、边界侧面剔除、明暗系数、箭头层存在性、镂空孔洞不穿帮
- 仓库:几何缓存命中、dispose 覆盖、字板材质数组结构
- 节点:frameGeometries 同步、belt dir 变化换几何
- runtime:advanceNodeGeometries 计入变更(沿用现有定时器测试模式)

## 验证
- pnpm check + pnpm build ✓(315 tests 全绿)
- release 截图:体素物体立体感 ✓、字板可读 ✓、贴地薄板 ✓、箭头凸起 ✓(白 sprite 上靠深色描边可读)、belt 方向 ✓

## 状态:完成
- 全部渲染对象体素化:sprite 浮雕 / 文字字板 / 贴地薄板 / 方向箭头浮雕
- 帧动画走 `frameGeometries` 交换,320ms 慢速定时器,不常驻 RAF
- 几何缓存按 (key,dir,frame) 索引,dispose 全量释放
- 已知取舍:箭头描边使整体略微放大(每侧 +1px);贴地物无箭头时与 2D 观感接近
