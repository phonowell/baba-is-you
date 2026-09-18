# 3D 渲染性能优化

## 诊断（已实测）

- Node 基准（324-item 关卡 BABAS ARE YOU）：`getVisual` 全量 pass ≈ **284ms/次 sync**
  - 根因：`syncEntityNodes` 每帧对每个 item 调 `getVisual` → `voxelVisual` 无条件重跑 `spriteVolumes`(erode/inflate)、`orientedSpriteForSpec`、`spriteVolumeBounds`、arrow overlays；`geometryCache` 只省了最后一步 `buildVoxelVolumeGeometry`
  - `cardSpecForItem` 的 palette/contrast 计算也逐 item 重跑
- 浏览器实测（同关卡，M4/Metal）：每次按键 ~170-240ms 长任务，p99 帧间隔 167ms；其余帧稳定 16.7ms
- 小关卡（30 items）：基本 60fps，每按键偶掉 1 帧
- 结论：**CPU 侧 sync 尖峰是主矛盾**；GPU 管线（N8AO+bloom+MSAA+shadowmap）在 M4 dpr≤1.4 下可维持 60fps

## 方案

- [x] 诊断定位
- [x] `board-3d-renderer-materials.ts`：按 item 视觉签名记忆化 `EntityVisual`
  - 签名覆盖 `cardSpecForItem`/`voxelVisual` 全部输入：isText、name、dir、props、overridden（minContrastRatio 为固定配置）
  - 同签名 → 同一 spec → 同一 visual（含 facingYaw/frameGeometries 引用共享，只读使用）
- [x] `board-3d-renderer-materials.test.ts`：补缓存行为测试（同签名复用同一对象；facing/方向变化得到不同 visual）
- [x] `pnpm check` + `pnpm build`
- [x] 浏览器复测大关卡按键帧间隔（对照 p99 167ms/max 233ms）

## 结果

- Node 基准：全量 `getVisual` pass 284ms → **0.03ms**
- 浏览器实测（BABAS ARE YOU，M4/Metal）：p99 167ms → **16.8ms**，max 233ms → 16.8ms，longtask 5→0，全程稳定 60fps
- 注：作业期间工作区有并行改动（VOXEL_STAND_LIFT 等），已合并验证 `pnpm check` 331 全过

## 复测口径

- `release/baba-is-you.html` 本地服务 + agent-browser，进入 index 10（BABAS ARE YOU），10 次方向键，统计 RAF 帧间隔与 longtask

## 第二轮无损优化（已实测）

sync/tick 剩余 CPU 是「对静止节点重复做等值姿势写」。逐项分析后落地：

- [x] `node-sync`：静止分支只在输入变化时重摆姿势——`poseStale = specKey 变化 | facing 变化 | roll 变化 | 需朝向相机且相机变了`；其余节点跳过 `setNodeIdlePose`（lookAt/getWorldDirection 链）。`SyncEntityNodesDeps` 加 `cameraChanged?: boolean`，由 runtime 的 `updateViewport` 返回值驱动
- [x] `runtime` tick：settled 非 emoji 节点（!moving && land/spawn/despawn 均 null）在 viewport 未变时跳过 `applyNodePoseStep`；emoji 维持原行为（RAF 活着时照常）；离开节点照常处理到清理帧
- [x] ground-hug（tile/water 贴地板件）：`castShadow=false`（方向光阴影几何不可见）+ `shadow.visible=false`（blob 阴影被板件自身遮蔽，截图 diff 确认无椭圆状填充差异）
- [x] `app-game-view`：对话框关闭时不重建 rules/legend innerHTML；`--board-width/height` 值不变不写
- [x] `app-draw`：`--cell-size` 值不变不写（DrawState 记 `prevCellSize`）
- [x] 测试：leaving 清理桩节点改为 despawn 态（贴合真实条件）

分析后否决/搁置：
- `shadowMap.autoUpdate=false` + 按需 needsUpdate：多帧 sprite 几何更换的帧归属判定有边界风险，收益（~0.5ms/帧）不值
- InstancedMesh 合并 draw call：架构级改动，留作后续
- emojiPhaseOffset/rollStep 再记忆化：~0.3ms/次 sync，复杂度不值

## 第二轮量化

- Node harness（注入 seam 计数）：稳态 sync 的 idle 重摆姿势 324 → **0**；tick 内 `applyNodePoseStep` 324 → **3**（3 移动节点）
- 浏览器复测（同关卡同口径）：207 帧，p50 16.7ms，p99 **17.3ms**，max **17.4ms**，0 长任务
- 截图 diff：同相位渲染逐像素确定（对照 0.0%）；3-4% 差异全部沿 sprite 轮廓分布 = 摆动相位噪声，无块状阴影差异

## 第三轮深挖（逐项证伪/量化）

- `step()`（逻辑层）实测 1.2ms/次、无效按键 0.65ms——逻辑不是瓶颈；无效移动经 `result.changed` 短路，draw/sync 根本不会触发
- sync 剩余派生调用整块（isEmojiItem/emojiStretch/emojiPhaseOffset/cardFacesCamera/cardRollForItemStep/isGroundHugItem ×324）实测 **0.1ms**——不值得加 traits 缓存
- `buildEntityViews` 0.099ms、`collectOverriddenTextIds` 0.062ms——近下限
- `applyNodePose` 零分配（模块级 Vector3 temps）；`advanceFrameMaps` 只遍历动画材质集；`advanceNodeGeometries` 由 factory 并入 `advanceSpriteFrames`
- **否决 `shadowMap.autoUpdate=false`**（这次有证据）：卡片材质带 `alphaTest`，three.js 会把 map/alphaTest 透传进 shadow depth material——摆动换帧真实改变阴影轮廓，跳过空闲帧的阴影 pass 会让阴影滞后一帧，非无损
- **落地 `sync` 相同 state 引用早退**：`lastSyncedState` 字段；相同引用 → 全部工作等值（且重复 sync 会把在途 despawn 重置成 spawn 造成闪烁，跳过反而更正确）。节点跨 unmount/mount 存活，故 flag 不重置。测试：`skips re-syncing an identical state object`
- 剩余非无损项（仅记录）：InstancedMesh 合并 ~640 forward + ~280 depth draw calls——架构级改动；`matrixWorldAutoUpdate=false`+脏标记——~0.15ms/render 收益不值接入复杂度
- 复测（零件雕塑新版几何 + 本轮改动）：207 帧，p50 16.7ms，p99 19.6ms，max 27ms，0 长任务
