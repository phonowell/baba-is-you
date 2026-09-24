# 渲染性能第二轮：低端机帧率 + 本机发热

需求：卡顿发生在低端机；本机（M4）满帧但发热高；画面损失要最小。

## 实测基线（headless Edge / M4 / 33×18 关卡）

- 游玩中 RAF 间隔 p50/p90/p99 = 16.7ms，0 帧超 20ms —— 本机无帧时间问题
- 每次 render ≈ 276 draw call（主场景 + shadow map + postfx 链）
- 空闲时 sprite/idle 定时器 ~4-9 次/秒触发整帧 render，且每次都重绘 shadow map
- 进关卡：~4 个 99-158ms longtask + 首帧 141ms（shader 编译 + 全量 spec 构建）

## 方案

### A. 自适应画质梯（低端机，有损但只在需要时降）

- 新文件 `board-3d-quality.ts` + `board-3d-config-quality.ts`：连续动画帧的 RAF 间隔 EMA > ~19ms → 单向降档（不回弹防抖）
- 档位：pixelRatioCap 1.4 → 1.2 → 1.0 → 0.85；AO samples 8 → 6 → 4
- `viewController.setPixelRatioCap(cap)`：立即重设 renderer/composer 尺寸（绕过 resize 脏标记）
- runtime 注入 `quality.observeFrame(gapMs)` seam，仅统计「连续动画帧」间隔（空闲 tick 不污染）

### B. 空闲省电：shadow map 按需收窄（零视觉损失）

- `shadowDirty` 条件改为：非 settled 的 pose（move/spawn/despawn/land/pulse/yaw）+ 相机移动 + caster 结构变化 + 节点删除；不再由 idle-stretch/idle-float 重摆、纯帧迁移、纯 viewport 变化触发
- `syncBatches` 返回语义改为「caster 相关结构变化」：slot 记 `casterKey = specKey|castShadow`，同 spec 纯帧几何迁移不计
- wobble 剪影变化是亚像素级，blob shadow 仍照常更新 —— 视觉上无差异

### C. 进关卡顿：菜单空闲预编译 shader（零视觉损失）

- `runtime.prewarm()`：一次 `composer.render()`（含 shadowMap.needsUpdate）编译 postfx 链 + 常驻材质；工厂附 `prewarmScene` 挂临时 InstancedMesh（真实 baba 对象/文本 visual）覆盖 voxel toon、plate basic、outline 程序，渲染后移除
- `board-3d-mount.ts` `preload()` → `ensureRenderer()` → `prewarm()`（保留失败重试语义）

### D. 零损失减 draw call：plate 材质组 5 → 2

- `createPlateGeometry` 把 back/top/side/bottom 的 VOXEL_SHADE 烘焙进顶点色，几何分组 [front, edges]
- edge 材质改为 `vertexColors:true` + `color=spec.background`（乘积与现状一致，像素级等价）
- 每 plate batch 省 3 draw ×（主 pass + shadow pass）；335-item 关卡收益更大

### E. 文字牌图集合批：每关 ~15 个 spec × 每 spec 2 draw → 全部 2 draw（零视觉损失）

- `board-3d-plate-atlas.ts`：共享 2048² canvas 图集（256² 格），用尽就地长 4096²（resize 后重绘旧格，旧 cell 像素位不动）；实例存像素原点经 `uAtlasSize` uniform 归一，生长只改 uniform
- 两个共享材质 + `onBeforeCompile` 补丁：front 用 `aCell`（vec2 像素原点）重映射 vMapUv（内折 flipY:false 的 V 翻转）；wall 用 `aTint` 乘进顶点色（等价旧 per-spec `material.color`）
- `EntityVisual.plate` / `EntityNode.plate` 贯通；batch key `plate|<castShadow>` 合批全部图集 spec（≤2 个 InstancedMesh：caster/非 caster），克隆几何挂 `aCell`/`aTint` InstancedBufferAttribute，随 matrix 容量同步生长、共用脏区间上传
- plate↔plate spec 变更就地重写属性（`slot.specKey` 比对），casterKey 同为 `plate|…` 不脏 shadow map；plate↔voxel 互迁仍走 slot 迁移
- 图集溢出（>192 spec）回退旧 per-spec 材质对；文字牌面单帧（sprite=null → createCardTextures 单帧，wobble 走 idleStretch pose），无需帧机制
- 图集懒初始化：首个文字牌才建 DOM canvas，node 测试与纯 sprite 路径零 DOM 依赖

### F. 降档表补 MSAA（tier 3 → 2）

- `composer.multisampling` 运行时 setter（postprocessing 6.39.5）；最深档才带 msaa，buffer realloc 每档一次
- 工厂接 `setMsaa: (n) => composer.multisampling = n`；quality 测试断言只在 tier 3 触发一次

### G. 体素帧合一：spec×帧 碎裂 → 每 spec 恒定 1 batch（零视觉损失）

- 用户要求「3d 卡只保留一帧几何，剩下两帧形变」。逐顶点 morph 不可行（不同帧顶点集不同）；落地为**合并几何 + per-instance 选帧**：`mergeFrameGeometries` 把 3 帧 soup 并成一个 buffer，顶点打 `aFrameIx` 帧号
- `patchVoxelFrameSelect`：共享顶点着色器补丁（toon 材质 + 批内 `customDepthMaterial`），`transformed *= 1 - step(0.5, |aFrameIx - aFrame|)`——非当前帧三角形坍缩到原点，光栅零面积剔除；手绘 3 帧动画（56 个 spec）与 wobble 补帧（65 个）同机制保留，零损失
- 批处理层：几何带 `aFrameIx` → 克隆挂 per-instance `aFrame`（同 plate 克隆理由——属性存活在几何上，caster 双批不共享 attr 空间）；`slot.frameIx` 比对，`frameIndex` 变了就重写属性 + 脏区间上传，**不迁移、不脏 shadow map**
- `advanceNodeGeometries` 不再换 `mesh.geometry`：只推进 `node.frameIndex` + 换 outline 壳的真实帧几何（rim 非 instanced，照常换帧匹配剪影）；spec 变更时 `frameIndex` 按新帧数取模
- AO 无副作用：n8ao 无 overrideMaterial，depth/normal 由 composer depthTexture 屏幕空间重建——主 pass 深度天然是选中帧
- 实测（关 0）：**72 draws/渲染**（图集后 123 → 72）；顶点数 ×3 但体素几何仅数百顶点

## 不做/延后

- 静态 DPR 降档：默认有损，已由 A 的按需降档覆盖
- 进关时 spec 构建分片：先看 C 后剩余耗时再定
- plate castShadow 摘除：有可见损失风险，暂不动
- 图集 mipmap 相邻格渗色：256² 格在极小尺寸（<64px 屏高）理论上会渗，那时文字已不可读，接受；如需消可在格间加 padding

## 验证

- `pnpm check` 全绿（932 tests）✅
- 新增测试：idle-only pose 不刷 shadow map / 移动帧刷；帧迁移 vs spec 迁移的 casterChanged 区分；quality EMA 降档与冷却 + msaa 仅 tier3；prewarm 幂等 + dispose 安全；图集分配/幂等/生长重绘/溢出回退；plate 合批 + aCell/aTint 写入 + spec 变更就地重写 + plate↔voxel 迁移；mergeFrameGeometries 帧标记/索引偏移；合并帧批合一 + aFrame 重写 + customDepthMaterial ✅
- 浏览器验证链已落地：移植 `../se` 的 CDP 驱动（`scripts/lib/browser.ts` + `scripts/cdp.ts`，`pnpm cdp`；隔离 headless 实例 + DevToolsActivePort 自分配端口 + 页级 WS 直连，替代被 Edge 劫持的 agent-browser）；`app.ts` 暴露 `__babaProbe()`（mode/levelIndex/turn/status/ready/prewarmed/qualityTier/dpr/glCanvas）；cdp op 含 `throttle:`（CPU 节流）与 `metrics:WxH[@dsf]`（视口/dsf 覆写）✅
- ✅ 冒烟：menu → `key:enter` → game + glCanvas；evalf 插桩（draw 计数/longtask/RAF 间隔）可用
- ✅ 浏览器复测（headless，1280×800@dsf1 除非注明）：
  - 进关：**0 个 longtask**（基线 4×99–158ms + 首帧 141ms）；剩一帧 ~167ms mount+sync 帧间隔（spec 构建，见「不做/延后」）
  - 移动动画：RAF gap max 16.8ms，tier 0 不降
  - 空闲 3s ≈ 7.7 次渲染（~2.6/s，timer 驱动；不再连带 shadow map 重绘）
  - GPU 瓶颈模拟（2560×1440@dsf2，buffer ≈7.2MP）：4s 内 tier 0→3，dpr 1.4→0.85，buffer→2176×1224，**gapP90 回落 16.8ms**；恢复视口后 tier 停留 3（单向不回弹）——降档链端到端成立
  - 图集合批后（关 0，~10 个文字 spec）：每渲染 p50 123 / max 151 draws，其中全部文字牌只占 4（2 组 × 主+影）；旧路径下这些 spec 要 ~40 draws，且随 spec 数线性涨（最差关 56 spec 原需 ~224 → 现在仍 4）。基线 276 是早期更大关卡的值，不与 123 直接对减
  - 体素帧合一后（关 0）：**72 draws/渲染**（截图驱动的 BeginFrame 计数，两次一致）；截图验证 baba/flag/rock/wall/文字牌渲染正确，帧间像素差确认 wobble 仍在走
- docs/rendering-3d.md 已同步（plate 图集/合批、合并帧选帧、shadow 门控收窄、自适应画质含 MSAA、prewarm、文件图）✅

## 遗留观察项（不阻塞）

- 进关仍有一帧 ~167ms 的 mount+sync（全量 spec/节点/地面构建）——低端机约 ×3-5。若要做，方向是 spec 构建分片或 mount 与首帧解耦；属一次性卡顿非持续掉帧，暂不动
