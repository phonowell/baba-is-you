# 无损性能优化 · 第三轮（现状盘点 + 候选）

前两轮已落地：`plans/task_plan_perf_lossless.md`（logic 层）、`plans/task_plan_3d-perf.md`（渲染缓存 + 姿势去重）。本轮找的是**剩余**空间。

## 实施状态（本轮已完成）

- [x] **A1 `fxColors` 挂 `EntityVisual`**：`board-3d-renderer-materials.ts` 视觉构建时随 spec 算出并缓存；`board-3d-shared-item.ts` 导出 `fxColorsForSpec`；factory/node-sync 的每 item `cardSpecForItem` 调用已删除；`EntityNode.fxColors` 每 sync 从 visual 覆写（节点寿命长于 item，despawn 色不丢）。
- [x] **A2 `overriddenTextIds` 随 state 带出**：`RuleRuntime` 增加 marks（partition 结果 overridden.cells − active.cells），经 `collectRuleRuntime`→`createInitialState`/`step` 各 rebind 路径透传到 `GameState.overriddenTextIds`（可选字段）；`node-sync` 直接读，fixture 构造的旧式 state 回退一次重解析。
- [x] **A3 cell 索引复用**：`applyInteractions` 直接用 `runtime.context.byCell`（不再自建 Map）；`overworld.moveCursor` 走 byCell 查格（O(items)→O(cell)）。
- [x] **A4 `resolveActiveEmptyProps` 复用 context**：可选参数传入既有 `RuleMatchContext`；仅 `empty is X` 场景计费路径受益。
- [x] **A5 相机朝向每帧一次**：`cardFacingForParent(camera, parent)` 产出 `CardFacing`（parentWorld⁻¹×lookAt 基准 quaternion），`applyCardOrientation` 接受可选 facing；node-sync 按 parent 去重缓存、runtime tick/effects 粒子循环各算一次。数学等价：lookAt 方向与节点位置无关。
- [x] **微优化**：sprite `setInterval` 在 `ownerDocument.hidden` 时短路（RAF 已停，省后台扫描）；`idleMicroStretch` 支持 out-param，pose 热路径用模块 scratch（与 card-facing 向量同惯例）。

**验证**：`pnpm check` 全绿（oxlint 0 warning、tsc、433 tests）。新增回归：marks 随 step 流转更新（`rules-override.test.ts`）、共享 facing 与逐节点 `applyCardOrientation` 等价（`board-3d-card-facing.test.ts`）、visual 携带 spec 派生 fxColors（`board-3d-autotile.test.ts`）。

**复测**（同基线关卡，324 items）：`step()` 0.72ms（持平，无回归）；sync 派生 0.207ms（`buildEntityViews`）——原 `cardSpecForItem`×N + `collectOverriddenTextIds` 共 ~0.22ms/sync 已归零。

**未做**：A 层无剩余；B/C/D 维持候选（B6 扁平索引、B7 分桶扩展、B8 COW、B9 InstancedMesh、C10–C14、D16 启动惰性化——ROI 递减，需更大改动面）。

## 现状基线（实测，M4 / tsx）

- 最大关卡（325 items，BABAS ARE YOU）：`step()` ≈ 0.55–0.71ms/次
  - `collectRuleRuntime` 0.157ms（其中 `collectRuleInstances` 0.057、`createRuleMatchContext` 0.024）
  - `moveItems`（player-move）0.153ms
  - `applyProperties` 0.031ms × ~2–3 次/步
- 同步侧派生（每 sync，325 items）：`buildEntityViews` 0.15ms、`cardSpecForItem×325`（fxColors 路径）0.14ms、`collectOverriddenTextIds` 0.077ms、`buildAutotileCells`+mask 0.04ms
- 启动：`levels.map(parseLevel)` 268 关 38ms + `levelDataForMap` 18 图 9ms ≈ **47ms** 全部 eagerly（goldens levelText 仅 3ms）
- 规则密集度低时这些数字同步缩小；`empty is X` 规则存在时按旧计划口径 ~0.5ms/step 的场景仍存在部分重复扫描

## 候选改动（按 ROI 排序，全部行为不变）

### A. 小成本高收益

1. **`fxColorsForItem` 无缓存**（`board-3d-renderer-factory.ts` + `board-3d-node-sync.ts`）
   每次 sync 对每个 item 跑 `cardSpecForItem`（palette/contrast 计算）并新分配 colors 数组；325 items ≈ 0.14ms + 325 数组/sync。
   做法：colors 全部由 spec 派生（`spec.sprite.palette` 或 `[background, textColor, outlineColor]`），可直接挂在已缓存的 `EntityVisual` 上（同 spec → 同 colors；autotile 只换 sprite 变体、fxColors 本来就读 base spec.palette——逐值相同，无损）；或在 factory 里按 `isText|name|overridden|levelTarget` memoize（dir/props 不影响颜色）。

2. **`collectOverriddenTextIds` 随 step 带出**（`rules-override.ts` → `rule-runtime.ts` → `step.ts` → `node-sync.ts`）
   sync 侧每次重跑完整 `collectRuleInstances`+partition（0.05–0.08ms）；而 `collectRuleRuntime` 在 step 里已做过同一 partition 并把 `overridden` 丢弃。
   做法：`RuleRuntime` 增 `overriddenTextIds`（partition 结果算 marks：overridden.cells − active.cells），`GameState` 增可选字段随 step/createInitialState 带出；node-sync 直接读。末次 runtime 的 marks 即最终 marks（`applyProperties` 不动坐标/name/isText，cells 语义不变）。

3. **`applyInteractions` 复用 `runtime.context.byCell`**（`step/interactions.ts`）
   每步自建 `Map<number, Item[]>`（O(items)）；context 的 byCell 本就是当前 frame.items 构建的、结构完全一致，且该函数只读。
   同理 **`moveCursor`**（`overworld.ts`）：walkable 检查是 O(items) 的 `items.some`，stage 签名里有 runtime，直接 `context.byCell.get(cell)`。

4. **`resolveActiveEmptyProps` 复用 context**（`empty.ts` + `move-single.ts`/`move-batch.ts`/`step.ts`）
   每次调用重建 `createEmptyMatchContext`（O(items)）且最多 4 次/step；仅 `empty is X` 规则存在时计费（旧计划实测该场景 ~0.5ms/step）。
   - moveItems/moveItemsBatch：在克隆 `next` 前 positions 与 runtime.context.byCell 完全一致 → 传 context 即可。
   - step 末尾：`frame.runtime.context` 建於 applyProperties 前的数组，坐标不变 → 直接复用；`hasAnyEmptyCell` 可进一步简化为 `byCell.size < w*h`（省 occupied set）。

5. **逐帧相机朝向运算提升**（`board-3d-card-facing.ts`）
   `applyCardOrientation` 每节点每帧做 `camera.getWorldDirection` + `mesh.getWorldPosition`（`updateWorldMatrix` 上行两级）+ `lookAt` + `setFromRotationMatrix` + parent-rotation premultiply；结果仅依赖相机朝向（facingNormal 与节点位置无关——`lookAt(worldPos + facingNormal)` 的方向向量恒为 facingNormal）。
   做法：每帧算一次 facingNormal/基准 quaternion，节点只乘 `rotateZ(roll)`。particles 的 `applyCardOrientation` 同享。动画密集时省 ~50–150μs/帧。需穿过 `applyNodePoseStep` 的注入缝。

### B. 结构性（更大改动）

6. **cell 索引统一/扁平化**：`rule-match` context、`move-core` grid、`interactions`、`autotileCells`、`buildEntityViews` 各自建 `Map<number, Item[]>`（每处 O(items)，每步/每 sync 合计 ~4–6 次）。改 `Int32Array` 计数排序的扁平索引可快 ~3–5×，但跨 logic/view 多文件，属中改。

7. **规则主语分桶扩展**：`applyTransforms`/`spawnByRules`(make/write)/`interactions`(eat)/`appendHasSpawns`(has) 仍是 O(items × bucketRules) + 每 item 两个 Set 分配；把 `propertyBySubject` 的按名索引模式推广到这些桶，与既有约定一致，规则密集关卡受益。

8. **移动路径 copy-on-write**：`moveItems`/`moveItemsBatch`/`applyFall`/`applyTeleport` 无条件 `items.map({...item})` 全量克隆（325 items ≈ 0.05ms + GC）；doMove/moveOne 改成经 byId 懒克隆可省掉「顶墙/无 movers」场景的克隆。中等复杂度，收益随板子大小线性。

9. **InstancedMesh**：~640 forward + ~280 depth draw calls（旧计划已记录为架构级）。blob 阴影四边形共享几何/纹理 → 单个 InstancedMesh + per-instance alpha（需 onBeforeCompile 或小 ShaderMaterial），可先吃掉 ~N 个 draw call 和 N 个材质对象；实体卡因 per-item 帧相位（idleFrameOffset）需要图集/UV 偏移才能合并，成本高得多。

### C. 微优化（捆绑做才有意义）

10. `tick()` 每帧全扫 `nodes`（settled 检查 ~8 字段）→ 维护 animating 集合。
11. `onSpriteTimer`/`advanceNodeGeometries` 每 250ms O(nodes) → sync 时登记 idle-motion/多帧节点列表。
12. `idleMicroStretch` 每节点每帧 `{scaleX,scaleY}` 分配 → out-param。
13. `updateViewport` 每帧读 `clientWidth/Height` → ResizeObserver 驱动（动画期省布局读）。
14. `buildEntityViews` 每 cell 两次 filter+sort+两个 index Map → 单遍 partition + 直接索引数组。
15. **Page Visibility**：tab 隐藏时 sprite `setInterval` 仍每 250ms 扫节点+换帧索引（RAF 已停，纯电池消耗）→ `visibilitychange` 停表，可见即恢复（帧相位由 `performance.now()` 推导，视觉无损）。

### D. 启动路径

16. **关卡按需解析**：`app.ts` 顶层 `levels.map(parseLevel)`（38ms）+ `maps.map(levelDataForMap)`（9ms）。首屏只需 root map；`env.levels` 可包成 thunk 惰性解析，`bindGoldensToLevels` 推迟到首次进 game 模式（Solution 按钮仅 game 模式渲染）。M4 省 ~47ms，低端机预估 ~150–250ms。改动面：app.ts / app-model env / golden-binding 调用点。

## 已证伪/不做（沿旧结论 + 本轮复核）

- `shadowMap.autoUpdate=false`：sprite 换帧经 alphaTest 改变阴影轮廓，冻结会让阴影滞后一帧——非无损（旧计划已实测否决）。
- `matrixWorldAutoUpdate=false`：~0.15ms/render，接入复杂度不值（旧结论）。
- `canMove`/`doMove` 跨移除缓存：weak 移除改变可达性，正确性风险（旧结论）。
- `history` O(n) 拷贝：不可变风格约束下换结构收益极小。
- 降低渲染画质（AO/bloom/MSAA/DPR/idle 4Hz 摆动）：有损，不在范围。
