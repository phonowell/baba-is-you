# 官方关卡导入：tile→objectId 顺序公式修正

类型：bugfix
状态：完成（`pnpm check` 429/429 绿、`pnpm build` 通过、verify unknown=0）

## 背景
- 用户报告"关卡数据对不上"。定位：`import-official-levels-parse.ts` 的
  `objectIdToTileKey`/`tileKeyToObjectId` 假设 tile 网格坐标 = objectId 顺序
  （`y*12+x-1`）。对照官方 `values.lua` tileslist：objectId ≥95 起 tile 被打乱
  （新增对象重排了调色板），约 30 个对象的推导位置错误。
- 错误 tileKey 以 priority-0 进 `buildLevelTileMap`，在真实对象缺 currobj/
  `[tiles]` 来源时抢占其 tile；无归属 tile 再被顺序 fallback 错配。
- 交叉验证：dump 内 75 处 currobj `object+tile` 绑定与 values.lua 表 0 冲突；
  dump 用到的 117 种 tile 全部在 vanilla 表（156 条）内，无缺口。

## 实测损毁（修复前）
- 54 个已发布关卡实体被静默替换：fence→text_level（~250）、brick→text_facing
  （~200，pushable 规则词）、statue/foliage/bug→robot、text_pull→moon、
  text_swap→text_on、orb/husk→text_brick、text_orb→brick、text_group→
  text_statue、字母 tile→text_word/text_robot/line。
- 61 关被过滤丢弃：46 个 `many-facing_text` 实为 brick→Facing 顶过阈值 ≥5 的
  假阳性；`145/176/198/227/263` 等 `unknown-card`。
- `levels-maps.ts` depths 图混入 `tile_9_10` 占位实体；~40 个地图 icon 死链。

## 修改
1. 新增 `src/tools/import-official-levels-vanilla-tiles.ts`：
   `VANILLA_OBJECT_TILES`（objectId→"x,y"，156 条，注释注明来源与校验）。
2. `import-official-levels-parse.ts`：两个函数改查表；`objectIdToTileKey`
   返回 `string|undefined`（表外 objectId 无 tile）。
3. `import-official-levels-tile-map.ts`：适配 `exactOptionalPropertyTypes`，
   tileKey 缺失时不写字段。
4. `import-official-levels.ts`：verify 对 `unknownTileKeys>0` 升级为硬失败
   （此前只报告，是本次漏检的口子）。
5. `pnpm import-levels:official` 重生成：levels 210→268（+58），
   过滤仅剩 3 个 `missing-you`（155/252/253，本就不可玩）；地图 icon
   unresolved→3（即这 3 关）；`Facing` 幻影清零（剩 6 处真 FACING 文本 +
   depths 图 1 处）。
6. `render-config.ts`：补 `cursor:'🔲'`、`orb:'🔮'`（新实体）；删死的
   `tile_5_10`/`tile_9_10` glyph + terrain.ts 两段占位 sprite。
   `objects.ts` 补 `orb` 24x24 sprite。
7. `board-3d-renderer-materials.test.ts`：贴地板件样本 `tile_5_10`→`line`
   （placeholder 消失后落到需 DOM canvas 的卡片路径）。

## 验证
- `pnpm verify-levels:official`：unknown=0、mismatch=0。
- 全量审计（自写脚本，按 values.lua + currobj/[tiles] 重放逐 tile 比对）：
  shipped 0 差异；drop 仅 3 个 missing-you。
- `pnpm check` 429/429；`pnpm build` 483 KiB 正常。

## 备注
- `stack-policy.ts` 的 `tile_` 前缀贴地规则保留（对未知 tile id 的防御性兜底）。
- `whoa`(327) 是 `mapid=secret` 伪地图（leveltype=0、paths=73），按官方数据
  忠实导入为关卡，内含 `cursor`/`Cursor` 实体。
- `DEFAULT_OBJECT_ASSIGNMENTS` 的 120/121（text_robot/robot）在 vanilla 表中
  是 default 占位槽；dump 未用到其 tile，条目保留但不再经 tile 路径命中。
