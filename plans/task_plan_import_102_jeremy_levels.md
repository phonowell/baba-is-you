# Task Plan: Import 102 Jeremy Levels

## Goal
Import all 102 Jeremy levels from `../baba/levels` into this project, implement missing engine/importer features as needed, and keep behavior aligned with original Baba priority.

## Scope
- Update level importer and data output under `src/tools/` + `src/levels-data/` + `src/levels.ts`
- Extend logic engine in `src/logic/` for unsupported mechanics required by imported levels
- Keep CLI/menu/select flow functional in `src/cli.ts` / `src/view/`
- Add or update tests for new mechanics and import invariants

## Steps
1. [completed] Baseline audit: importer blocked at level 14 (`1-the-lake/6-lock.txt`) on `shut`; source contains 102 `.txt` files and 5 multi-layer maps.
2. [completed] Implement missing importer/engine mechanics needed to pass blocker.
3. [completed] Re-run importer until all 102 levels import.
4. [completed] Add regression tests for new mechanics and import assumptions.
5. [completed] Run `pnpm lint`, `pnpm type-check`, tests, and verify level count/select flow.
6. [completed] Finalize with changed-file summary and residual risks.

## Verification
- `pnpm import-levels:jeremy` -> imported `102` levels
- `pnpm test` -> pass (24 tests)
- `pnpm type-check` -> pass
- `pnpm lint` -> pass
- `pnpm -s tsx -e "import { levels } from './src/levels.ts'; console.log(levels.length)"` -> `102`

## Risks
- Rule/interaction order for advanced combinations (`tele/shift/swap/float/not/has`) is substantially closer but may still differ from original in edge cases.
