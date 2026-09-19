# 卡模型平滑转身（facing yaw 补间）

## 目标
体素立像（`rotates` 模型）朝向变化时走最短弧补间，不再硬切到新 yaw。

## 现状基线
- `EntityVisual.facingYaw`（`board-3d-renderer-materials.ts`）：`rotates` 模型的目标朝向 {down:0, right:π/2, up:π, left:-π/2}
- `syncEntityNodes`：`node.facingYaw = facingYaw` 直接赋值 → 硬切；idle 重摆 `setNodeIdlePose` 也会立即写到新朝向
- `applyNodePose`：`applyVolumeOrientation(mesh, roll, node.facingYaw)` 每帧写绝对 yaw
- RAF 按需驱动：`tick` 里 `settled` 节点被跳过；`PoseStepResult.animating` 决定 RAF 是否续命 → 转身补间必须接入这两处

## 方案
节点新增补间字段 `fromYaw / yawStartMs / yawDurationMs`；`facingYaw` 仍是目标语义（undefined = 非转身模型）。
- `nodeYawAtMs(node, nowMs)`：easeOutCubic 插值，弧取 `angleDelta`（(-π,π] 最短弧）；新补间的起点取"当前显示 yaw"，连续转向/中途改向不跳变
- 卡片↔体素模式互换（facingYaw defined↔undefined 切换）无共享角度，直接对齐目标

## 阶段
1. 配置与数学：`BOARD3D_ANIMATION_CONFIG.TURN_ANIM_MS`；`angleDelta`（shared-math）
2. 节点模型：`EntityNode` 加字段；`createEntityNode` 初始化
3. 姿态：`nodeYawAtMs`/`nodeYawAnimating`；`applyNodePose` 用显示 yaw（含 `lateralOnX` 与 `animating` 汇总）
4. 同步：facing 变化开补间（旧新皆 defined）否则对齐；`setNodeIdlePose`/`initializeNodeAtTarget` 传 nowMs 用显示 yaw
5. 运行时：`tick` 的 `settled` 判定加 `!nodeYawAnimating`
6. 测试（`board-3d-card-facing.test.ts`）：sync 后朝向平滑过中间角、补间期 `animating`、结束落目标；`nodeYawAtMs` 跨 ±π 取短弧

## 验证
`pnpm test` + `pnpm type-check`；`applyNodePose`/`nodeYawAtMs` 纯函数可测，sync 路径经 stub getVisual 注入 facingYaw

## 状态（已完成）
- 全部 6 阶段落地：`TURN_ANIM_MS=140`；`angleDelta`；`EntityNode.{fromYaw,yawStartMs,yawDurationMs}`；`nodeYawAtMs`/`nodeYawAnimating`；sync 朝向变化开补间；tick `settled` 纳入补间
- 新增 3 用例：sync 平滑转身（含 idle 重摆不 snap、`animating` 标志）、`nodeYawAtMs` ±π 短弧、runtime 补间期 RAF 续命
- `pnpm test` 405 绿、`pnpm type-check`/`pnpm lint` 通过
