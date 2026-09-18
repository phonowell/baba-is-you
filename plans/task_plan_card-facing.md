# 任务计划：非贴地元素始终面向镜头

## 背景
- 现状：非贴地卡片的朝向写死为 `rotation.set(rotX=75°, 0, roll)`（`CARD_UPRIGHT_ROT_X - CARD_BACK_TILT_RAD`），即接近竖直站立。
- 相机俯仰约 75°（接近俯视），竖立卡片几乎是侧缘对镜头 → 贴图看不清。
- 目标：所有非贴地卡片（`!isGroundHugItem`）改为朝向相机的球面广告牌（billboard），贴地元素保持平躺。

## 方案
- 所有卡共享同一朝向法线（视平面平行广告牌）：`facingNormal = lerp(水平方向, -相机视线方向, CARD_FACE_CAMERA_BLEND)`，由 `camera.getWorldDirection` 求得，再 `mesh.lookAt(pos + normal)` + `mesh.rotateZ(roll)`；blend=1 完全平躺朝镜头，0 完全竖立。当前 0.55。
- 曾按"逐卡位置朝相机瞄"实现，导致左右卡各自偏航、整排墙散开、移动中朝向摆动；改为统一法线后恢复整齐。
- 依赖注入 `camera`（取视线方向），透传 pose/sync。
- roll 仍然叠加在卡片自身法线轴上（局部 Z 旋转）。
- `node.rotX` → `node.facesCamera: boolean`；`cardRotXForItem` → `cardFacesCamera`（= `!isGroundHugItem`）。
- `sync` 中 `fromRoll` 不能再读 `mesh.rotation.z`（四元数反解的 Euler.z ≠ roll），改为按动画进度解析计算 `nodeRollAtMs`。

## 步骤
- [x] 新增 `src/web/board-3d-card-facing.ts`：`applyCardOrientation(mesh, roll, cameraPos, facesCamera)`，面向路径 lookAt+rotateZ，贴地路径 rotation.set(0,0,roll)
- [x] `board-3d-node-types.ts`：`rotX`→`facesCamera`；`SyncEntityNodesDeps` 增加 `cameraPos`
- [x] `board-3d-shared-item.ts`：`cardRotXForItem`→`cardFacesCamera`
- [x] `board-3d-node-create.ts` / `board-3d-node-sync.ts` / `board-3d-node-pose.ts`：接入新朝向逻辑；pose 导出 `nodeRollAtMs`
- [x] `board-3d-renderer-runtime.ts`：args 增加 `cameraPos`，透传给 pose step 与 syncNodes
- [x] `board-3d-renderer-factory.ts`：注入 `cameraPos: camera.position`
- [x] 配置清理：移除 `CARD_UPRIGHT_ROT_X`/`CARD_BACK_TILT_RAD`/`CARD_FLAT_ROT_X` 与死配置 `CAMERA_CARD_FACE_ANGLE_RAD`
- [x] 测试：新增 `board-3d-card-facing.test.ts`（真实 three 对象验证法线朝相机、偏心卡片偏航、roll 绕视轴、贴地不变）；更新 runtime 测试桩；`nodeRollAtMs` 插值测试
- [x] `pnpm check` 全绿（300 tests）；`pnpm build` 验证 web 产物；浏览器实测关卡 1 渲染确认所有非贴地元素正面朝镜头

## 验证点
- 中心与边缘卡片的法线均指向相机（非固定倾角）
- roll 摆动仍生效（移动时卡片在自身平面内抖动）
- 贴地元素（tile/water/belt/line）维持平躺
- RAF 按需驱动不变：朝向更新发生在既有 pose/sync 路径内，无新增常驻循环
