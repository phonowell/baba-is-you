# Level Solver — Handoff

Status: working but incomplete. Sweep was interrupted mid-run; one known-bad
golden is still open. This doc is the pickup point.

## What exists

### `src/logic/solve.ts` — search core (pure, no IO)

`solveState(initial, caps, strategy)` over the real `step()` pipeline:

- Strategies: `bfs` (proven-shortest), `greedy`, `astar`, `wastar`
  (depth + 5·h), `beam` (per-depth cap via `caps.beamWidth`, deepest dive,
  neither optimal nor complete)
- Result: `solved{inputs,depth}` | `exhausted` (frontier drained — provably
  unwinnable under our semantics) | `cutoff{reason: depth|states|timeout|
  exhausted}` — `exhausted` reason only comes from beam and proves nothing
- Dedupe: `stateKey` = status + levelDir + sorted
  `name@x,y:dir[!][#origin][~prevX,prevY]` tuples. Excludes `turn`/`history`/
  `levelOffset` — merging turn-divergent boards can hide a tele/chill win,
  which fails safe (`unknown`, never false `solved`)
- Pruning (no result change): boards with no you-props, no autonomous
  props, and no empty/level-subject rules skip expansion; `w` skipped when
  nothing autonomous/turn-sensitive exists
- Heuristic: wall-aware BFS distance field (stop-prop cells as walls, from
  win cells to nearest you cell); falls back to rule-assembly distance
  (`win` text → `is` text, `you` text → `is` text) when props aren't live

### `src/tools/solve-levels.ts` — CLI

```
npx tsx src/tools/solve-levels.ts \
  [--only <substr>] [--start N] [--end N] [--mod k/n] [--level <file>] \
  [--strategy auto|bfs|greedy|astar|wastar|beam] \
  [--max-depth 64] [--max-states 250000] [--beam-width 5000] \
  [--timeout-ms 30000] [--emit-goldens <dir>] \
  [--improve-goldens <dir>] [--out <file>]
```

- `auto` (default): bfs first → beam on cutoff
- `--mod k/n`: index % n === k shard — run N in parallel
- `--emit-goldens`: writes `NNN-slug.json` golden records per solved level
  (embeds `levelData` + `levelIndex`)
- `--improve-goldens <dir>`: re-solves every recorded golden with BFS
  bounded to `inputs.length - 1` → `improved` / `optimal` / `unknown`;
  improved records go to `--emit-goldens` dir
- `--level <path>`: single .txt fixture mode (used for golden repair)

### `src/logic/goldens.test.ts` — NEW consistency gate

Embedded `levelData` must now match its real source: `levelIndex` →
`levels[index]` layout signature; `level` file + `levelData` → file parse
signature. This already caught `goldens/1/2-0.json` replaying a stale
board. `pnpm check` currently fails on exactly this one test — that is the
intended signal until the golden is fixed.

## Open tasks (in order)

1. **`goldens/1/2-0.json` — resolved by deletion.** The embedded layout
   predated a level-file edit (baba/rock/tile positions differed) and the
   recorded 153-input path no longer wins on the current board. Re-solving
   hit resource limits on every strategy (bfs OOM; beam/wastar/greedy
   ~110-170k expansions at the caps), so the stale golden was deleted
   rather than kept in violation of the new consistency gate. The fixture
   `levels/1-the-lake/2-turns.txt` remains for a future re-recording.

2. **Finish the sweep** — was running 8 shards (`--mod k/8`, auto,
   20s/attempt). Outputs in `tools-out/solve/` (gitignored): `part-*.json`
   reports, `goldens/` (~6 emitted). Relaunch and merge part files.

3. **`--improve-goldens goldens`** — was mid-run; bounded BFS tells whether
   the 85 recordings are optimal or beatable.

4. **`pnpm check` + `pnpm build`** — expect exactly the `1/2-0` failure
   until task 1 lands.

## Known limits

- Throughput ~200 expansions/s (full `step()` per edge). Open 33x18 boards
  (WHERE DO I GO, OUT OF REACH, …) do not finish under any strategy tried
  — they report `unknown`, honestly.
- Rule-assembly heuristic only covers `win`/`you` formation; levels needing
  multi-rule rewrites still plateau.
- `exhausted` = unwinnable under *our* engine semantics; a logic gap could
  mark a winnable official level unsolvable — treat as strong evidence,
  not ground truth.
- Solver emits `u/d/l/r/w` only — no `z` (undo) in generated paths.
