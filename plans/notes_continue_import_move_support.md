# notes_continue_import_move_support

## Implemented
- `src/logic/types.ts`
  - `Property` 新增 `move`
  - `CORE_PROPERTIES` 新增 `move`
  - `LevelItem` 新增可选 `dir`
- `src/logic/step.ts`
  - `MOVE` 自动移动流程（按方向批次执行）
  - 被阻挡的 `MOVE` 物体方向翻转
  - 新增 `lose` 状态不变（已有）
- `src/logic/parse-level.ts`
  - 支持 `name@direction` 语法解析（如 `crab@down`）
  - 无方向时不写入 `dir`
- `src/tools/import-jeremy-levels.ts`
  - `SUPPORTED_PROPERTIES` 增加 `move`
  - `UNSUPPORTED_TEXT_WORDS` 移除 `move`
- `src/view/render.ts`
  - `TEXT_CODES` 增加 `move -> MV`
- `src/logic/step.test.ts`
  - 新增 `step auto-moves MOVE objects each turn`

## Verification
- `pnpm type-check`: pass
- `pnpm test`: pass
- `pnpm lint`: pass
- `pnpm import-levels:jeremy`:
  - imported: 13
  - last imported: `1-the-lake/5-brick-wall.txt`
  - stopped at: `1-the-lake/6-lock.txt`
  - reason: `unsupported text word "shut" via glyph "⨶" at (20,4)`
