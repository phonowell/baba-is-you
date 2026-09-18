# 移除 emoji 卡渲染路径

emoji 卡（sprite-less + emoji glyph 的 plate）已不可达：唯一候选名 `marker-*`/`glyph-*`
（30 个 OBJECT_GLYPHS 条目）没有生产者——大地图图标走 `level` 实体（自带体素 sprite）。
按推荐全部移除，`idleStretchEnabledForItem` 收敛为 `item.isText`（可达行为零差异）。

- [x] `view/render-config.ts`：删 30 个 marker/glyph 条目
- [x] `board-3d-shared-item.ts`：删 `isEmojiItem`、`HAS_EMOJI`、`isEmojiLabel` 计算；`idleStretchEnabledForItem` = `item.isText`
- [x] `board-3d-shared-types.ts`：删 `CardSpec.isEmojiLabel`
- [x] `board-3d-textures.ts` + `board-3d-config-textures.ts`：删 emoji 纹理/字体分支
- [x] `board-3d-config-visuals.ts`：删 `HAS_EMOJI`
- [x] `node-create.ts` / `node-sync.ts`：删 `emoji`/`receiveShadow` 分支（恒 true）
- [x] `pixel-sprites.test.ts`：删 `isAsciiMarker` 豁免
- [x] `board-3d.test.ts`：marker-u2022 夹具换成 `nonexistent-object`（sprite-less 非 emoji → false）
- [x] 验证：`pnpm lint` 0 警告；`pnpm test` 348/349（唯一失败是用户 spawn-stagger 特性的浮点断言 `easeOutBack(0)` ≠ 0，见下）；`pnpm type-check` 仅剩 `app-draw.ts` NodeListOf 迭代（用户菜单改动）

## 遗留（用户 WIP，未代修）

- `board-3d-card-facing.test.ts` delayed-spawn 断言：`easeOutBack(0)` 返回 -2.22e-16 而非精确 0，`assert.equal(scale.y, 0)` 需放宽或 pose 侧钳制
- `app-draw.ts:73`：`for...of` 遍历 `NodeListOf` 缺 `dom.iterable`
