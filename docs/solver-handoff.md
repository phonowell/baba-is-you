# Level Solver — Handoff

Status: active sweep in progress (single worker by user request — device
thermals). This doc is the pickup point.

## What exists

### `src/logic/solve.ts` — search core (pure, no IO)

`solveState(initial, caps, strategy)` over the real `step()` pipeline:

- Strategies: `bfs` (proven-shortest), `greedy`, `astar`, `wastar`
  (depth + 5·h), `beam` (per-depth cap via `caps.beamWidth`, deepest dive,
  neither optimal nor complete), `macro` (Sokoban-style decision
  granularity — see below)
- `solveToLayout(from, target, caps)` — waypoint-chasing BFS used by the
  golden re-solver; matches by `layoutKey` (layout + status only)
- Result: `solved{inputs,depth,state}` | `exhausted` (frontier drained —
  provably unwinnable under our semantics) | `cutoff{reason: depth|states|
  timeout|exhausted}` — `exhausted` reason only comes from beam and proves
  nothing
- Search nodes carry `{parent, code}` pointers; inputs are reconstructed
  once on solve (no O(depth) string copies per edge). Wins surface at
  push time, not pop time
- Dedupe: `stateKey` = status + levelDir + sorted
  `name@x,y:dir[!][#origin][~prevX,prevY]` tuples. `turn` is included only
  for turn-seeded boards (`often`/`seldom`/`chill`/`tele`/`idle`-ish);
  `history`/`levelOffset` stay excluded — merging divergent boards can
  hide a win, which fails safe (`unknown`, never false `solved`)
- Pruning (no result change): boards with no you-props, no autonomous
  props, and no empty/level-subject rules skip expansion; `w` skipped when
  nothing autonomous/turn-sensitive exists
- Heuristic: wall-aware BFS distance field (stop-prop cells as walls, from
  win cells to nearest you cell); falls back to rule-assembly distance —
  cheapest shared-`is` pairing over every candidate noun incl. special
  nouns (`empty`/`all`/`level`/`group…`)

### `macro` strategy

One node = one intent: push unit u in dir d, pull it, walk to a goal /
condition-object / door / tele cell, or wait. Reachable space is flooded
per state (walls/prop-blockers/empty-rules respected); each macro's
intermediate cells are produced by real `step()` along the flood tree —
shared path prefixes are computed once per cell, and each push/pull costs
one extra step() past its stand-state. Ranked greedily by `winDistance`.
Wrong guesses cost an expansion, never an invalid replay. `depth` in the
result is move count (inputs.length), while the node cap counts
decisions — a 64-decision run can cover hundreds of moves.

### `step.ts` — `prepareStep(state)`

Sibling-expansion entry point: resolves the rule frame once (non-idle —
parser check, rule runtime, property application ≈18% of a step on large
boards), then each returned call runs only the stage pipeline. Waits keep
using `step(state, null)` — `idle` flips rule matching. Stages are
copy-on-write on input items, so sharing the frame is safe.

### `src/tools/solve-levels.ts` — CLI

```
npx tsx src/tools/solve-levels.ts \
  [--only <substr>] [--start N] [--end N] [--mod k/n] [--level <file>] \
  [--strategy auto|bfs|greedy|astar|wastar|beam|macro] \
  [--max-depth 64] [--max-states 250000] [--beam-width 5000] \
  [--timeout-ms 30000] [--emit-goldens <dir>] [--skip-goldens <dir>] \
  [--resolve-goldens <dir>] [--improve-goldens <dir>] [--out <file>]
```

- `auto` (default): bfs → macro → wastar → beam, each under `caps`
- `--mod k/n`: index % n === k shard
- `--emit-goldens`: `NNN-slug.json` per solved level (embeds `levelData`
  + `levelIndex`)
- `--skip-goldens <dir>`: skips levels an existing golden already binds
  to (explicit levelIndex, or title/layout + replay-verified wiring)
- `--resolve-goldens <dir>`: waypoint re-solve of recorded goldens —
  compress `z` detours → sparse waypoints → per-segment `solveToLayout`
  (final segment: BFS to win) → splice + full replay verification →
  emit. Falls back to the compressed recording when a segment can't be
  improved. `--seg-timeout-ms`/`--seg-max-states`/`--waypoint-stride`
  tune segment budgets
- `--improve-goldens <dir>`: bounded-BFS optimality check

### Golden wiring rules (learned the hard way)

- `findCampaignIndex` replay-verifies every candidate — signature hits
  are only candidates because `layoutSignature` ignores `dir` and an old
  fixture without facings collides with a campaign board full of
  directional movers (`3/7-0` → false-wired to level 61 produced a losing
  `061-perilous-gang.json`; deleted and fixed)
- Wired emits only stamp `levelIndex` when the final inputs actually win
  on the bound board
- Unwired emits preserve embedded `levelData` — dropping it would bind a
  drifted fixture file to inputs recorded on the old layout

### `src/tools/import-solutions.ts` — community-solution importer

Imports externally-verified move sequences instead of searching. Two
sources wired so far:

- `--solutions <dir>`: the Discord Collective archive from
  `SzieberthAdam/baba-is-optimized` (`solutions/` = compact strings,
  `solutions-multiline/` = one letter per line; ~246 files). Filename
  `Level <world>-<n>, <Title>[, <variant>], <moves>.txt`; decoder handles
  `R10`/`U4R3` run-lengths, `-` separators, `W` waits, `Z` undo.
- `--solutions-json <file>`: flat `{title: movestring}` map — used for
  `stared/baba-is-harbor`'s 55 real-engine-verified oracles.

Every candidate is matched to campaign indices by normalized title and
**replayed through our own `step()`** — only `win` finals emit a golden
(`NNN-slug.json` with `levelIndex` + embedded `levelData`). The failure
report annotates `status@step/inputs tried=<indices>` so same-title
remixes (≈60 campaign titles exist twice — primary + encore variant) are
distinguishable from real engine gaps.

### `src/logic/goldens.test.ts` — consistency gate

Embedded `levelData` must match its real source: `levelIndex` →
`levels[index]` layout signature; `level` file + `levelData` → file parse
signature. Known blind spot: the signature ignores `dir`, so dir-only
drift passes silently (36 such diffs in `3/7-0` embedded-vs-file — the
record stays valid only because replay uses the embedded board).

## Current state

- **245 golden files; ~195 campaign levels covered** after letter-unit
  fixes + community-import batch + sweep chain (`328` MATRIX,
  `265` DO IT YOURSELF, `42` NEARLY re-solved under corrected swap, …).
- `368-planet-baba` golden deleted — it only won under the old
  still+you-moves semantics; reshard-0b will retry.
- Legacy re-solve done: 89 wired / ~78 shortened / 2 unwired / 1 fallback.
- External import: 246 Discord + 55 harbor parsed → ~215 replay-verified
  total. ~66 remaining failures are almost all `playing@N-1/N` or
  `lose@N-1/N` (path runs to completion, win never forms — divergence
  somewhere mid-replay).
- Sweep status (single worker, `tools-out/solve/run-reruns.sh`):
  - sweep 0–7 done; reshard-0 **crashed** at ~[352] with
    `Maximum call stack size exceeded` (not reproduced standalone;
    reshard-0b re-queued at chain tail to cover the missed tail range)
  - reshard-1 done: solved 265 DO IT YOURSELF
  - reshard-3 running under `NODE_OPTIONS=--max-old-space-size=8192`
- `pnpm check` green (740 tests), `pnpm build` green

## Community-replay audit findings (this session)

- **Rule-dump diff vs `baba-is-optimized` `rules/`**: no real parse bugs.
  All diffs were (a) `lonely` print order — cosmetic; (b) title
  collisions between worlds (two different `Tunnel`/`Shuffle`/`Backstage`
  levels); (c) stale dumps from an older game version — official typos
  `HADGE`/`SOOR`/`SOTP` are fixed in current data, `top` doesn't exist in
  this build; (d) `box is me` in AUTOMATON is correctly vetoed by
  `box is box` — the dump lists overridden rules too.
- **`level is <noun>` transform** (official `convertlevel`): exits to map
  and transforms the map icon — NOT a win. Discord "LEVEL IS BABA"-style
  variants (Avalanche-11 etc.) are non-win completions; correctly stay
  unverified. `level is <prop>` we already handle
  (`level is win/defeat/hot` apply globally via `resolveLevelPropsGlobal`).
- **Meta/Chasm cluster** (~15 failures): level-icon entities with
  `level is fall` etc. work; the missing piece may be in-level
  level-icon entry (`select`) semantics — unconfirmed.
- Failing levels use only basic conditions (on/near/facing/lonely) —
  divergences are movement/interaction-order subtleties, not vocabulary.
- `Fragile Existence` (190): `key is key` + `key is you` mid-game both
  verified working — divergence is positional, late-game.

## Per-cell empty props (this session — fixed)

`resolveActiveEmptyProps` returned a board-wide UNION of `empty is …`
props, so a conditional rule like `empty near water is push` made EVERY
empty pushable — push chains then ran off the board edge and locked all
movement ([393] BABA THE CONDUCTOR couldn't move at all). Officially each
empty cell is its own pseudo-unit (`unitid 2`) and `hasfeature` is
per-cell. Now:

- `resolveEmptyPropsByCell` (new) returns `Map<cellKey, Set<prop>>`;
  `resolveActiveEmptyProps` stays as the union for existential gates
  (`level is melt` + any hot empty, `hasAnyYou`, macro marks now use the
  per-cell map in `solve.ts`).
- Single + batch move engines take `emptyPropsAt(x,y)`; the empty branch
  mirrors official `canmove`: `still`/`locked<dir>` cancels `swap` first,
  no-push/no-swap cells enter unless `stop`/`pull`, still push/swap
  cells block, `push` forwards the chain per-cell until a non-push empty
  absorbs it, real units become push targets, or the edge blocks.
- `empty is you`/`move`/`auto`/`reverse`/`still`/`sleep`/`swap` all
  per-cell now (move-single you-pass + phases-movement auto-pass).
- `checkWin` empty half is per-cell — `empty is you`+`empty is win` wins
  only when ONE cell carries both (conditional variants on disjoint
  cells no longer fuse into a false win).
- Residual gaps (rare): `empty is pull` being pulled,
  `empty is weak`/`open`/`shut` specials (verdict equal, destruction VFX
  unmodelled), empty-you pushing THROUGH a pushable empty (needs a
  virtual empty mover).

## Move-time specials: EAT / lock / weak (this session — fixed)

Official `check()` in `movement.lua` evaluates per-obstacle specials
BEFORE the solidity verdict; they only execute when the mover actually
lands (`movelist` insertion is gated on `result == 0`). Aligned:

- **`x eat y`**: eater enters the target cell and consumes it — eaten
  units never block, even with `stop`/`pull`/`still`/`push`. Gates:
  target `!safe`, matching float layer (`floating()`), rule conditions
  evaluated at the DESTINATION cell (`hasfeature(name,"eat",obj,unit,
  x+ox,y+oy)`). `x eat empty` frees empty cells per-cell (`empty is
  safe`/`empty is float` of that cell apply). Eaten targets are excluded
  from push/swap collection. Both engines + `move-batch-apply` sweep the
  destination after landing — a target that moved away dodges the eat
  (official `dodge` check).
- **`open`/`shut` lock**: requires same float layer AND at least one
  side `!safe`; each side dies only if itself unsafe. No longer
  speculative — a mover blocked by a co-cell obstacle no longer unlocks
  (the old `return true`/`removeOne`-during-resolution path did).
- **`weak` same-layer targets**: never a stop/pull blocker but still
  `push`-able (official skips only the result-1 branch). Cross-layer
  weak without stop/pull is enterable. Weak entity death stays in the
  interaction phase (official entity `{id,"weak"}` specials are no-ops;
  the empty-pseudo-unit weak special just frees the cell).
- **`empty is pull`** blocks plain entry (estop), and `empty is weak`
  frees it — both now in `emptyBlocked`'s three-branch verdict.
- `x has y` drops spawn at `delete()` time (official `inside()`), so a
  unit eaten mid-move drops its cargo BEFORE interactions run —
  verified against `tools.lua`.

Regression cost: 7 goldens recorded under the old speculative ordering
were deleted (`031`+`4/9-0` leaf-chamber, `062`+`3/8-0` double-moat,
`309`/`310` courses, `495` secure-cottage) — replays diverged because
the recorded paths relied on non-official unlock/eat timing (e.g. MAIN
COURSE `rr` survived only because eat resolved after `has`-drops).
Re-verified community solutions immediately re-covered `031`,
`101`, `257`; the rest are queued for the sweep to re-solve.

## Open tasks (in order)

1. **Rerun shard 3** (OOM'd) **and shards 0–1** (pre-swap-fix semantics)
   after the 2→7 chain finishes — same command, `--skip-goldens` makes it
   incremental. Consider `NODE_OPTIONS=--max-old-space-size=8192` or a
   lower `--max-states` if OOM recurs.
2. **Second pass on cutoffs** — default `--max-depth 64` bounds *moves*;
   macro's decision-depth already reaches further. Re-run remaining
   `cutoff` levels with higher depth / longer budgets and the new cascade.
3. **Work the import-failure list** — ~40 primary-level community
   solutions still fail replay under our engine. Each is a confirmed-real
   path, so every failure is a concrete fidelity bug (and a free golden
   once fixed). Current suspects after the fixes below: per-level
   investigation needed — most end `playing@N-1/N` (path completes, win
   never forms) which usually means the replay diverged mid-way.
4. **Fixture leftovers** — `levels/1-the-lake/2-turns.txt` still lacks a
   winning recording; `1/7-0`, `5/extra-2`, `3/7-0` are fixture-bound by
   stale layouts — `3/7-0` already re-solved shorter (128→110) on its
   embedded board.
5. **`pnpm check` + `pnpm build`** — all green as of this writing.
6. **Signature hardening** — consider adding `dir` to `layoutSignature`
   in the consistency gate + web binding (surfaces real drift; would flag
   several stale-but-valid fixture records — do it deliberately, with a
   plan for the fallout).

## Engine gaps found via solution replay (fixed)

Replaying community solutions is a conformance suite. The `rules/` oracle
directory in baba-is-optimized (expected active rules per level) gives a
zero-cost parse check — `tools-out/rule-oracle.mts` diffs our initial
rules against it. Official-semantics bugs found and fixed so far:

0. **`x not on y` negated the subject, `x on not y` was unsupported** —
   `rules-subjects.ts` bound the infix-position `not` to the subject
   instead of the condition, and `not` after a condition word had no
   representation. `RuleCondition.objectNegated` added; `FIRE NOT ON
   SKULL IS DEFEAT` (official TUNNEL) now parses as fire + `!on skull`.
   Also: `x on not empty` = occupied cell, `x seeing not skull` = first
   non-skull in the ray, `feeling not P` = own `X IS NOT P` rule.

0. **`fall` stopped on ANY unit** — `applyFall` broke on any occupied
   cell. Official `fallblock` resolves each cell through the movement
   `check`: fallers pass through walk-over units, push pushables, and
   iterate until settled. Rewritten as a `moveItemsBatch` loop
   (`isMove:false` so blocked fallers rest instead of bouncing).

1. **Mover-side SWAP missing in the single-move engine** —
   `move-single-runtime.ts` only swapped when the *target* had swap.
   Official is bidirectional: a mover carrying swap trades places with
   whatever it enters, swap outranks push/pull/stop, `still` blocks. Fixed;
   `[328] MATRIX` and `[42] NEARLY` re-solved (the old `rr` golden was a
   false positive under the bug).
2. **`make`/`write`/`more` ran before destruction checks** — official
   ordering spawns *after* defeat-type checks, so a `you` survives one
   turn on the hazard it just made (`[76] JAYWALKERS UNITED` grass trail).
   Moved to end-of-pipeline in `phase-list.ts`.
3. **Batch movement engine had no swap at all** — `moveItemsBatch`
   (auto-move + shift) never collected `swapIds`; swap-carrying movers
   overlapped instead of trading places. `[65] FIREPLACE`'s digging
   `skull is swap and move and down` now replays correctly (plus PASSING
   THROUGH and INSULATION verified).
4. **`level is win/end/done` required a living you** — officially the
   rule completes the level outright, even the turn the last `you` dies
   (`[239] JUST NO`'s `level is not not win` forms on the fatal push).
   `checkWin` now returns true on the prop alone.
5. **Letter units (???, ABC, LEVEL 9 worlds)** — `letter-words.ts`
   mirrors `letterunits.lua`: `a-z`/`0-9`/`sharp`/`flat` text tiles are
   letter units, never standalone words; contiguous runs of ≥2 cells
   enumerate every dictionary-word substring (`SPELLABLE_WORDS` = the
   official `unitreference` names — in the base world the palette check
   is bypassed so any official word is spellable, including `is`/`not`/
   conditions). Spelled words act as multi-cell text units that can fill
   any phrase position; the term parser is span-aware
   (`ScannedTerm{word,span}` in `rules-parse-terms.ts`). Play levels
   switch to the note dictionary and allow single-cell note words
   (`text_play`'s `customobjects` list). Verified `[155] ERROR`,
   `[192] TURN THE CORNER`, `[266] WRITE THE RULES`, `[198] LUNAR
   GALLERY`, `[219] WALL` against community solutions; the official game
   dump at `data/Baba Is You/Data/` (gitignored) is the ground truth for
   further semantics questions (`rules.lua`, `letterunits.lua`,
   `blocks.lua`).

## Known limits

- Throughput is bound by `step()` (~79% of profile): ~0.5–5k expansions/s
  per strategy on mid boards, ~600/s on 200+-item boards. GC +
  `sameItems`/`itemTuples`/`createRuleMatchContext` dominate
- `bfs`/`wastar`/`beam` cap at `--max-depth` *moves* — official solutions
  run to ~385, so long-solution levels are only reachable via `macro`
  decisions or waypoint re-solve
- Rule-assembly heuristic covers single-rule `win`/`you` formation; levels
  needing multi-rule rewrites still plateau
- `exhausted` = unwinnable under *our* engine semantics; a logic gap could
  mark a winnable official level unsolvable — treat as strong evidence,
  not ground truth
- Solver emits `u/d/l/r/w` only — no `z` (undo) in generated paths
