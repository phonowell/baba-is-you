# 渲染性能 · draw-call instancing + 阴影门控（第五轮）

第四轮（`task_plan_perf-4.md`）收尾后用户点名「画面性能」。逐帧成本盘点结论：JS 侧已足够瘦（pose 短路、按需 RAF、材质/几何缓存），剩下的大头是**每帧 draw call 数量**与**阴影贴图 pass**——335-item 关卡动画期 ≈ 670 场景 draw + ~335 阴影 caster + 全屏 postfx。

## 基线

- 实体卡：`Mesh` × N（voxel 或 5-group plate）+ 阴影贴片 `Mesh` × N + you-rim × 可见数
- 阴影贴片：每节点独立 `Mesh` + 独立 `MeshBasicMaterial`（仅 opacity 不同）→ N draw + N material
- 阴影贴图：`renderer.shadowMap.autoUpdate` 默认开 → 每次 `composer.render()` 重绘全部 caster，包括纯 sprite 换帧/mood 帧
- `updateViewport` 每 tick 读 `clientWidth/clientHeight`（强制 layout 读）
- `syncEntityNodes` 每 item `[...props].sort()+join` 重建 propSig 字符串

## 方案（行为/视觉不变）

核心手法：**node 保留真 Object3D（mesh/shadow）作 transform 载体但不入场景树**；`InstancedMesh` 按批次镜像其矩阵。pose/sync/测试桩的全部字段语义不变——区别只在「谁真的被画」。

### R1 阴影贴片 instancing（`board-3d-node-batches.ts`）

- 单 `InstancedMesh`(shared quad, patched material, capacity) + `aOpacity` instanced attribute（onBeforeCompile 注入 `diffuseColor.a *= vOpacity`；`customProgramCacheKey` 固定防碰撞）
- `node.shadow` = 真 Mesh 不入场景；`node.shadowMaterial` 保留为 opacity 载体（逐帧读入 attr）
- slot 分配/释放：free-list；释放=写零矩阵；visible=false → opacity 0
- flush：逐 node `shadow.updateMatrix()` → `setMatrixAt` + opacity attr → 单次 needsUpdate

### R2 实体卡 instancing

- batch key = `specKey | geometry.uuid | castShadow`（ground-hug 不投影 → 独立 batch，视觉等价）
- `node.mesh` = 真 Mesh 不入场景（`mesh.parent = entityGroup` 手动挂上供 card-facing 基 basis 用，不进 children）；`updateMatrix()` → `setMatrixAt`
- frame 几何切换 / spec 变更 / castShadow 变更 → flush 检测 batchKey 失配自动迁移 slot
- plate 多材质数组：已验证 three r183 `projectObject` 按 group 分别 `renderInstances` → InstancedMesh 支持 material array
- you-rim：`node.outlineAnchor`（惰性 Object3D，仅 outline.visible 时挂入 entityGroup）持有 outline 网格；flush 同步 anchor transform = node transform；`advanceYouOutline`/`advanceNodeGeometries` 不动
- capacity 不足 → 2× 重建 InstancedMesh 并整体拷贝 matrix buffer（slot index 不变）
- `frustumCulled=false`（实例分布全盘，逐对象剔除无意义）

### R3 阴影贴图门控

- `renderer.shadowMap.autoUpdate = false`（scene 创建处）
- `needsUpdate` 置位条件：本 tick 有 pose 执行 / 节点增删 / batch 结构变化（geometry 迁移）/ viewport 或尺寸变化 / sync 标脏——仅在真正 render 的帧内消费
- sprite 换帧只有材质 map 变化（plate 纹理不投影）→ 省整个 ~N caster 阴影 pass；voxel geometry 换帧触发 batch 迁移 → 自动标脏

### R4 小项

- `updateViewport` 改 ResizeObserver 驱动（无 RO 环境回落逐 tick 检查；注入 `observeResize` 测试缝）
- `propSig` 按 item 对象 WeakMap 缓存（item 不可变 → 同对象同 sig）

### R5 pose 循环削减（实施中补充）

- settled 节点（无移动/yaw/落弹/生成/消散/pulse/idle 微动）在 tick 中直接跳过
- 相机位置+四元数快照检测：readability guard/resize 引起的相机移动强制重摆全部 settled 节点（billboard 朝向依赖相机）
- 阴影标脏跨帧累积：未渲染的 tick 不丢 `shadowDirty`

### R6 batch flush 脏域化（第六轮补）

- flush 签名 `flush(nodes, dirty)`：`dirty===null` 全量重写（post-sync 覆盖 `setNodeIdlePose`/`shadow.visible` 直写路径）；`Set` 只写本 tick 真正 pose 过的节点 + 新建/迁移 slot
- runtime：`posedNodes` 集合随 tick 收集，`batchAllDirty` 由 sync 置位、flush 消费
- 每 batch 记 `writeMin/writeMax`，flush 末尾 `addUpdateRange` 只上传脏区间；无写入不置 `needsUpdate`（sprite 换帧/mood/hover 帧零矩阵写零上传）
- 新建/扩容 buffer 初始整段标脏，等价全量首传；释放的 slot 也记区间
- 各 instanced 容器 `matrixAutoUpdate=false`

### R7 粒子 instancing（第六轮补）

- `board-3d-effects.ts`：≤360 独立 `Mesh` → 单 `InstancedMesh`（共享 PlaneGeometry + 共享 MeshBasicMaterial）
- per-particle 颜色 → `instanceColor`；fade → `aOpacity`（与 shadow batch 共用 `patchInstancedOpacity`/`createOpacityAttribute`，独立 cache key）
- `particle.mesh` 降为场景外 transform 载体；每帧收集 active → 按相机前向视深排序（far→near）写紧凑 rank —— 与旧 per-mesh transparent 排序同序，混合顺序不变
- `instanced.count` = live 数；expired 不清理槽位只缩 count；`clear` 直接 count=0

## 不做/延后

- 边缘 lid 跨 spec 合并（instanceColor 染色）：plate batch 已把同 spec 合并为 ≤5 draw，再合收益有限
- AO/bloom/DPR/MSAA 降档：有损画质，只做可选项不动默认
- `cardFacingForParent` 复用、animated 节点集 bookkeeping：µs 级，不值复杂度

## 验证（已完成）

- `pnpm check` 全绿：lint + type-check + 900 tests（含全部 golden 回放）
- `pnpm build` 正常（release-local/baba-is-you.html 609 KiB）
- `board-3d-node-batches.test.ts` 7 例：同 spec 合并为单 draw、spec/geometry 变更自动迁移 slot、释放槽位回收复用、阴影 aOpacity 写入/hidden 归零、rim anchor 变换镜像、capacity 2× 扩容保持槽位、dirty 集合只写脏 slot 且只挂脏区间
- effects 9 例：单 instanced 批次承载全部粒子、`instanceColor`/`aOpacity` 属性存在、count 跟随 live 数、clear/dispose 归零
- runtime 4 例：阴影贴图按需刷新、pending dirty 跨跳过帧保留、ResizeObserver 挂载/卸载/重挂不泄漏、无 observer 回落逐 tick 读
- 修复：旧测试 `entityGroup.remove` 断言改 slot release 语义；`grow` 空闲槽降序压栈保 highWater 紧凑
