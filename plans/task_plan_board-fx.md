# 卡片出现/消失与胜负特效强化

状态：全部完成。`pnpm check` 绿（lint 0 / type-check 0 / 349 tests），`pnpm build` 成功；浏览器实测 win mood 金色调 + 粒子生效。并行任务（emoji-card-removal 等）已合并，共享 API 一致。

## 目标
- 卡片出现：弹性放大（overshoot）+ 旋入 + 像素粒子 puff；进关时全板斜向错峰浮现
- 卡片消失：加速收缩 + 旋出 + 像素粒子 poof（沿用原作粒子语言）
- 胜利：金色粒子喷泉（you/win 位置）+ 全卡 hop 涟漪 + bloom/饱和脉冲
- 失败：灰烬粒子漂浮 + 全卡 slump 涟漪 + 去饱和 + 暗角加深（保持到 undo/重开）
- 风格：像素方块粒子（面向镜头、带翻滚），与体素/黏土气质一致；后处理只做脉冲式 mood，不破坏可读性基线

## 方案

### 新文件
- `src/web/board-3d-config-effects.ts`：粒子数量/寿命/速度/重力、胜负 mood 数值、涟漪与脉冲参数
- `src/web/board-3d-effects.ts`：`createBoard3dEffects({parent, camera, setMood, random?})`
  - 粒子池（共享 PlaneGeometry + 每粒子 MeshBasicMaterial，上限封顶，超池复用最旧）
  - `spawnPuff / despawnPoof / playWin(spots) / playLose(spots) / neutralMood / update(nowMs) / clear / dispose`
  - 粒子轨迹解析式（原点+初速+重力），面向镜头用 `applyCardOrientation`
  - mood 时间线经 `setMood({bloomBoost, saturationAdd, vignetteAdd})` 驱动后处理

### 修改
- `board-3d-shared-types.ts`：`BoardFxMood` 类型
- `board-3d-shared-math.ts`：`easeOutBack`、`easeInCubic`
- `board-3d-config-animation.ts`：spawn/despawn 调参 + 旋入/旋出/过冲常量
- `board-3d-node-types.ts`：`EntityNode` 增 `fxColors / spawnFxDone / despawnFxDone / pulseStartMs / pulseKind`；`createNode` 增 `spawnDelayMs?`；`SyncEntityNodesDeps` 增 `fxColorsForItem?`
- `board-3d-node-create.ts`：新字段初始化；`spawnStartMs = nowMs + delay`
- `board-3d-node-sync.ts`：进关（nodes 空）按 x+y 错峰延迟；同步 `fxColors`；respawn/despawn 时重置 fx 标记；idle re-pose 条件排除 pulse
- `board-3d-node-pose.ts`：延迟期 scale 0；spawn 过冲+旋入；despawn 加速+旋出；pulse hop/slump 合成进 jump/stretch
- `board-3d-renderer-scene.ts`：透出 `hueSaturationEffect / vignetteEffect`
- `board-3d-renderer-view.ts`：`setFxMood(mood)`；`baseBloom` 与 mood 叠加应用
- `board-3d-renderer-factory.ts`：建 fxGroup、effects、fxColorsForItem 注入
- `board-3d-renderer-runtime.ts`：tick 内 `effects.update` 参与 RAF/render；节点 spawn/despawn 触粒子；status 迁移 → win/lose/neutral + 全节点涟漪脉冲；unmount→clear，dispose→dispose

## 边界
- `sync` 幂等：status 迁移只在值变化时触发；win→complete 再放一次庆祝
- undo/restart/换关 → status 回 playing → neutralMood 清场
- 粒子不写 depth、不受 AO；RAF 仅在粒子/mood 活跃时续命
- `prefers-reduced-motion` 不单独处理（与现有 RAF 动效一致）

## 测试
- 新 `board-3d-effects.test.ts`：粒子生命周期/池上限/dispose；mood 经 setMood spy 断言
- `board-3d-renderer-runtime.test.ts`：fx 续 RAF、status 迁移触发、unmount clear
- `board-3d-card-facing.test.ts` 或新断言：spawn 过冲 >1、pulse hop 抬升

## 验证
- `pnpm check`；`pnpm build` 后可浏览器抽查
