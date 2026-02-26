# Notes: Import 102 Jeremy Levels

## Decisions
- Source of truth: `../baba/levels` (Jeremy levels).
- Priority: original Baba behavior when conflicts arise.
- Include all `102` `.txt` levels (including `index.txt` world-map stages).

## Running Log
- Added full-file importer support for:
  - `index.txt` inclusion in import order
  - metadata `+` placements
  - `left/right/top/bottom pad`
  - multi-layer maps split by `---` / `+++`
  - overworld marker glyph decoding (and fallback glyph handling)
- Re-generated level data: `src/levels.ts` + `src/levels-data/*` now contain `102` levels.
- Extended rule/property system:
  - properties: `float/tele/pull/shift/swap/up/right/down/left/red/blue/best`
  - operators: `HAS`
  - negation parsing: `NOT` in subject/predicate term chains
  - transform subject: `EMPTY` (spawn on empty cells)
- Extended step interactions/motion:
  - `open + shut` pair annihilation
  - `has` spawn on destruction
  - `pull`, `swap`, `shift`, `tele`
  - `float` layer-separated interaction/win checks
  - directional property-driven auto movement
- Added tests for new mechanics:
  - `HAS`, `NOT` rule parsing
  - `open/shut`, `has` spawn, `pull`, `shift`, `swap`, `tele`, `empty is noun`
