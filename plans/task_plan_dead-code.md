# 死代码清理计划

类型：implementation
状态：已完成

## 背景
- tsc `noUnusedLocals/noUnusedParameters` 已覆盖文件内死代码；本任务聚焦跨文件死代码
- 扫描期间工作区有并行 WIP 活跃改动（helpers/app-golden-binding/solve-levels/render-config），两枚符号扫描后被重新引用，已回退

## 扫描方法
- `tmp/find-dead.mjs`：import 图可达性 + 全仓词边界引用计数（入口 = app.ts/tools/scripts/tests，含动态 import 与 .d.ts）
- `tmp/classify-dead.mjs`：区分「仅声明未用」与「仅本文件内部使用」
- `tmp/dead-fields.mjs`：导出 config 对象字段级引用（结果：全部有引用，无死字段）
- `tsc --allowUnreachableCode false`：不可达语句（结果：无）

## 已执行
1. [x] 删除不可达 barrel `src/web/board-3d-config.ts`
2. [x] 删除零引用死符号：
   - `empty.ts` `resolveEmptyProperties`（+ 随之 unused 的 `isPropertyRule` import）
   - `replay.ts` `encodeInput`（+ `Direction` import 清理）
   - `rules-parse.ts` `getWordsAt`
   - `types.ts` `RuleConnectorWord`/`RuleConditionWord`/`RuleWord`/`TEXT_WORDS`
   - `import-official-levels-object-table.ts` `canonicalTileKey`/`canonicalObjectIdAt`/`reverseMaps`
   - `board-3d-renderer-factory.ts` `Board3dRendererFactoryDeps`
3. [x] 去除仅内部使用的多余 `export`（14 个值符号）：
   `hasAnyEmptyCell`、`hashState`、`createRuleBuckets`、`LETTER_WORDS`/`SPELLABLE_WORDS`/`NOTE_WORDS`、
   `isOpenShutPair`、`parseCanonicalObjects`、`parseTileKey`、`shiftFrame`、`volumeSlices`、
   `REPLAY_STEP_MS`、`createCardTexture`、`textSources`、`parseRon`
4. [x] 保留判定：出现在导出签名中的类型（Rule/RuleRuntime 契约、create* 工厂签名）与 AGENTS 登记的词表常量（CORE_PROPERTIES/RULE_*_WORDS）维持导出
5. [x] 回退：`levelItemSignature`/`normalizeLevelTitle` 被并行 WIP 经 `app-golden-binding.ts` 重新引用，保留导出

## 验证
- `pnpm lint`：0 errors
- `pnpm test`：888 pass
- `npx tsc --noEmit`：仅剩 WIP 自带 `solve-levels.ts:416 walkJson`（非本次范围）
- 复扫：0 不可达文件；剩余零引用导出全部为刻意的签名类型/词表常量
