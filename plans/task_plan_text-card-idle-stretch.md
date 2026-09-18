# 文字卡补待机微拉伸（idle stretch）

## 目标
文字卡目前是唯一没有待机动作的卡片。让它复用 emoji 卡的微拉伸（scale 呼吸）路径，使所有直立卡片都有待机动作（对齐原作全场抖动观感），不新增常驻 RAF——继续搭 sprite 定时器便车。

## 改动
- [x] `board-3d-shared-item.ts`：`idleStretchEnabledForItem` = `item.isText || (isEmojiItem && !isGroundHugItem)`，取代 `emojiStretchEnabledForItem`；`emojiPhaseOffsetMsForItem` → `idlePhaseOffsetMsForItem`
- [x] `board-3d-config-animation.ts`：`EMOJI_MICRO_STRETCH_*` → `IDLE_STRETCH_*`
- [x] `board-3d-shared-math.ts`：`emojiMicroStretch` → `idleMicroStretch`，`emojiBottomAnchorOffset` → `idleStretchBottomAnchorOffset`
- [x] `board-3d-node-types.ts`：`isEmoji` → `idleStretch`，`emojiPhaseOffsetMs` → `idlePhaseOffsetMs`
- [x] `board-3d-node-create.ts` / `board-3d-node-sync.ts` / `board-3d-node-pose.ts` / `board-3d-renderer-runtime.ts`：同步改名与注释
- [x] `board-3d-renderer-runtime.ts`：`onSpriteTimer` 在无动画 sprite 但存在 idleStretch 节点时也 `ensureFrame`（否则纯文字/emoji 棋盘的呼吸会冻结）
- [x] 测试更新：`board-3d.test.ts`（覆盖文字卡用例）、`board-3d-renderer-runtime.test.ts`（改名 + 新增无 sprite 时钟驱动用例）

## 验证
- [x] `pnpm test`：328 通过
- [x] `pnpm type-check` + `pnpm lint`：0 errors
