# notes_split_levels_and_and_import

## Decisions
- 关卡拆分按来源分组：顶层文件归 `root`，子目录按首段目录名分片。
- 保持 `src/levels.ts` 为唯一对外入口，CLI 无需改导入路径。
- 导入流程保持“顺序导入，遇未支持特性立即中断并上报”。
- 新增 `AND` 支持仅覆盖 `X AND Y IS Z` 与 `X IS Y AND Z` 及其交叉组合。

## Validation
- `pnpm type-check` 通过。
- `pnpm test` 通过（新增 `src/logic/rules.test.ts` 覆盖 AND 场景）。
- `pnpm lint` 通过。

## Latest Stop Point
- imported count: 10
- last imported source: `1-the-lake/2-turns.txt`
- stopped at: `1-the-lake/3-affection.txt`
- reason: `unsupported text word "move" via glyph "→" at (11,5)`
