# notes_import_official_levels

## Observations
- `../kikyo/source/static/script/include/data.coffee` 仅包含 8 关（到 GRASS YARD）。
- `src/levels.ts` 当前与上述数据同步。

## Decisions
- 采用 `../baba`（`jeremyschlatter/baba`）作为可复现的公开关卡文本源，体积约 3.8M，`levels/*.txt` 共 102 个。
- 转换策略：复用其文本图例语义（legend + glyph）映射到本项目 DSL，方向信息忽略，仅保留对象/文本与坐标。

## Execution Result
- 新增脚本：`src/tools/import-jeremy-levels.ts`（顺序导入 + 不支持特性检测 + 首次命中即中断）。
- 新增命令：`pnpm import-levels:jeremy`。
- 实际执行：成功导入 8 关到 `src/levels.ts`，并在 `1-the-lake/1-icy-waters.txt` 中断。
- 中断原因：检测到未支持规则词 `and`（glyph `&`，坐标 `11,11`）。
