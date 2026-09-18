# 所有卡片呼吸节奏彼此错开（idle frame stagger）

体素卡的摆动帧（`advanceNodeGeometries`）目前全局共用 `frameIx`，所有卡同拍切换。
文字/emoji 卡的 `idleMicroStretch` 已按 item 哈希错相；本次把同一相位源量化成帧偏移，
让 sprite 卡也错开。共享材质的贴图换帧（`animatedFrames`）当前为空集，不动。

- [x] `board-3d-shared-item.ts`：抽出归一化相位 `idlePhase01ForItem`，新增 `idleFrameOffsetForItem`（量化到 `SPRITE_FRAME_COUNT`）
- [x] `board-3d-node-types.ts` / `node-create.ts` / `node-sync.ts`：`EntityNode.idleFrameOffset` 字段写入与刷新
- [x] `board-3d-renderer-materials.ts`：`advanceNodeGeometries` 用 `(frameIx + idleFrameOffset) % len`；更新注释
- [x] `board-3d-config-animation.ts`：更新 `SPRITE_FRAME_MS` 注释（不再是 board-wide sync）
- [x] 测试：`voxel.test.ts` 错相断言、`runtime.test.ts` node 工厂补字段、`board-3d.test.ts` 帧偏移范围/稳定性
- [x] `pnpm check`（lint + type-check + 331 tests 全绿）
