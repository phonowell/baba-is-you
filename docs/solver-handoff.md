# Level Solver — Handoff

Status: engine parity holds — all 9 oracle-verified replay gaps fixed,
the powered-condition recursion crash fixed (item 23), the
double-emission multiplicity bug fixed (item 24); the resume sweep
finished with zero crashes and community archives are fully absorbed
(251 campaign-bound goldens; truly uncovered = {13, 112, 213, 217,
264}). Open work is the cutoff second pass (open task 4) and fixture
leftovers — not engine parity. This doc is the pickup point.

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
- Dedupe: `stateKey` = 96-bit bigint — each item's
  name/x/y/dir/isText/originName/prevX/prevY folds into three summed
  32-bit chains (order-independent multiset, no per-item strings).
  `turn` is included only for turn-seeded boards
  (`often`/`seldom`/`chill`/`tele`/`idle`-ish); `history`/`levelOffset`
  stay excluded — merging divergent boards can hide a win, which fails
  safe (`unknown`, never false `solved`)
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

- **All 9 replay gaps closed and oracle-verified** — `golden-diff` on
  the community inputs ends `final status: win` with zero positional
  diffs for 54/70/134/197/214/215/218/220/222. `220` turned out to be
  already parity-correct (its old failure record was stale). Fixes are
  items 17–22 in the gap list below.
- **`pnpm check` green (900 tests), `pnpm build` green.**
- Two goldens re-recorded under the new float-latch timing:
  `goldens/2/5-0.json` and `goldens/181-victory-spring.json` — the
  re-record was oracle-verified (`golden-diff 181` zero-diff win).
- `226-acrobatics` re-recorded with an oracle-verified 55-move win
  (`...drdluulrrluuurrr` tail). The old community input loses under the
  real engine — it was recorded against 4-connected `near`; official
  `near` is the 3×3 neighborhood, so `text is fall (not near baba)` held
  the text one extra turn and `keke is hot` formed a frame after baba
  died on `ice is defeat`. Diagnostic value: when a replay fails in BOTH
  engines identically, suspect the recording, not the engine.
- `248-stardrop` was an oracle defect (missing letterunit metadata +
  `letterunits.lua` in the sim) — the engine's `letter-words.ts` was
  correct all along; re-hashed, 219 steps zero diffs.
- `168-platformer` was a sim artifact (live `unitmap` residue of a
  deleted keke — see `MF_remove` pitfall above); engine behavior matches
  `findobstacle`'s DEAD-skip. Re-hashed, 219 steps zero diffs.
- `094/098/106/176/207/228` re-hashed after the faller-facing and
  gravity-phase fixes — all oracle-verified zero-diff + win.
- `368-planet-baba`, `220-meteor-strike`, `527-after-hours` goldens
  deleted — recordings only won under pre-fix semantics (the official
  oracle loses the same inputs on 220/527, so they're invalid fixtures,
  not bugs). Since resolved: `527` re-solved (38 moves), `220` re-merged
  from a different Discord input that wins under the fixed engine;
  `368` still uncovered (all probes cutoff).
- Legacy re-solve done: 89 wired / ~78 shortened / 2 unwired / 1 fallback.
- External coverage (re-swept 2026-09-22 against the fixed engine +
  full-`smallclear` sim, `tools-out/oracle/sweep.mts` /
  `recheck-failures.mts`): the 246 Discord files map to **216 distinct
  campaign levels** (30 are same-level variants/duplicates). Per level:
  **201 have a Discord input that wins in our engine**; 15 did not —
  resolved since: the 9 real engine gaps are all fixed and
  oracle-verified (Maritime Adventures[54], Guardians[70], Automated
  Doors[134], Ab[197], Priority Lane[214], Security Check[215],
  Queue[218], Meteor Strike[220] — stale record, already parity,
  Canister[222]); the 6 stale/invalid recordings remain (oracle loses
  too):
    Babas Are You[13], Further Fields[110], One-Way Entrance[112],
    Hazel Den[154], The Box[217], Written Instructions[264]
- **Absorbed 2026-09-23**: 11 verified community goldens merged into
  `goldens/` (8 gap-fix levels + 220 + 178/194; campaign-bound goldens
  240 → 251, `pnpm check` 869 green). Post-merge audit: skipped=228
  verified=0 improved=0 failed=11 unmatched=3 — every winnable Discord
  input is now absorbed; the only truly uncovered levels are
  {13, 112, 213, 217, 264} (all inputs lose in both engines; solver
  probes all cutoff). Harbor (55 oracle inputs): all covered
  (skipped=55), 2 losing variants informational only.
- The earlier flat-file count (~24 suspects) was inflated by variant
  files for already-covered levels and a stale sweep predating the
  `runStages` teleported-guard fix — 95/232 flipped to win on recheck.
- `pnpm check` green (**900 tests** — later dedup/render-perf rounds added
  coverage over the 875 noted above), `pnpm build` green.
  Step() perf ~14% faster on the 89k-step bench (0.24→0.207 ms/step;
  `resolve-transforms` self-cost 23%→7%) — semantics-preserving passes
  documented in `plans/task_plan_solver-sweep.md` 进度更新（七）.

## Official-engine oracle (the ground truth)

Every movement/rule fix above was validated by replaying the same input
string through the *real* game Lua headlessly and diffing per-step object
positions. Tooling lives in `tools-out/oracle/` (gitignored):

- `babasim-steps.lua` — shim: `lua babasim-steps.lua <level.json> <moves>`
  prints `STEP n` + `OBJ name x y` (1-based) per step. `BABA_ENGINE`
  selects the engine dir: `data/Baba Is You/Data` (clean, default) or
  `tools-out/oracle/engine/` (scratch copy for trace prints — keep it
  byte-identical to `data/` except for debugging sessions, and re-copy
  pristine files afterward; `~/Downloads/Baba Is You/Data` is the
  untouched source dump).
- `gen.mts` — `genLevelJson(campaignIndex)` → oracle level JSON (adds
  border `edge` ring, 1-based coords, tiledefs from the `.ld` file, and
  per-unit numeric `type` — **required for letter units**: `.ld` marks
  letter tiles `type=5`, which is what `letterunits.lua`'s
  `formlettermap()` collects; without it letter words never form in the
  oracle and letter-word levels (e.g. 248 STARDROP) diverge).

Sim-fidelity pitfalls already burned once — do NOT reintroduce:

- The loadfile list must include `letterunits.lua`; a silent
  `formlettermap` stub made letter words invisible to the oracle.
- `MF_remove`/`MF_cleanremove` stubs must set `flags[DEAD] = true` —
  `findobstacle` skips dead units, but without the flag a deleted unit
  left a live `unitmap` residue that still blocked movement (the
  168-platformer "phantom keke").
- The per-input loop must run the full `smallclear()` set each turn
  (objectdata + deleted + movelist + pushedunits + movemap +
  poweredstatus + HACK_MOVES) — the native frame loop does it in the
  real game; without it tele pads fire once-ever instead of
  once-per-turn (this hid the 144-broken pad swap from the oracle for a
  while).
- Frame driver: per input, `movecommand()` (which internally runs
  `code()` twice when `updatecode==1`) then `block()` then
  `fallblock()`, then `code()` if `updatecode` got set — falling text
  forms rules only for the *next* turn.
- `golden-diff.mts <idx> <golden.json> [upto]` — runs both engines over
  the golden inputs, prints every step's positional diff + final status.
- `replay-check.mts <idx> <golden.json>` — oracle-only final status.

Host deps: `lua` 5.1 binary at `/tmp/lua-5.1.5/src/lua` (rebuild:
`tar xzf /tmp/lua-5.1.5.tar.gz && make -C lua-5.1.5 macosx`; if /tmp was
wiped, fetch lua-5.1.5.tar.gz from lua.org). Game data at
`data/Baba Is You/Data/` (gitignored local dump — the source of truth
for `movement.lua`/`blocks.lua`/`tools.lua` semantics; prefer reading it
over guessing from replays).

Community archives: Discord Collective at
`/private/tmp/baba-opt/BABA IS YOU/solutions` (246 files; re-clone
`SzieberthAdam/baba-is-optimized` if /tmp was wiped — its `rules/` dir is
also the per-level rule oracle) and harbor movestrings at
`tools-out/harbor-solutions.json` (55 engine-verified oracles,
durable). Audit command:

```
npx tsx src/tools/import-solutions.ts \
  --solutions "/private/tmp/baba-opt/BABA IS YOU/solutions" \
  --prefer-better --skip-goldens goldens \
  --emit-goldens tools-out/solve/emit-audit
# same for harbor: --solutions-json tools-out/harbor-solutions.json
```

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
- **Meta/Chasm cluster** — resolved: all 9 suspect replays now win
  under ours with zero oracle diffs; the `select`-semantics suspicion
  did not materialize.
- **FLOAT latch** (item 20 below) — `floatLatch` is sampled at turn
  start and cleared on transform/spawn (`resolve-transforms.ts` deletes
  it); every float consumer reads `hasLatchedFloat` except level/empty
  pseudo-units, which keep live rule reads.
- Failing levels use only basic conditions (on/near/facing/lonely) —
  divergences are movement/interaction-order subtleties, not vocabulary.

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

1. ~~**Work the 9 real engine gaps**~~ — **done**: every community input
   the official oracle wins now also wins under ours, zero per-step
   diffs (54/70/134/197/214/215/218/220/222; 220 was a stale record).
   Fixes documented as items 17–22 below.
2. **Stale-recording disposals** — resolved 2026-09-23: a fresh
   `--solutions` audit (emit-audit3) merged **11 verified community
   goldens** into `goldens/` (the 8 fixed-gap levels 54/70/134/197/
   214/215/218/222 + 220 METEOR STRIKE whose Discord input wins under
   the fixed engine + new coverage 178/194); `pnpm check` 869 green.
   Of the original 6 double-losers: `110` is now covered by a solver
   golden (188 inputs), `154`'s only Discord file (`54(q).txt`,
   letter-unit filename) decodes to nothing usable — silent skip.
   **Remaining truly uncovered: {13, 112, 213, 217, 264}** — every
   community input loses in both engines AND solver probes all
   cutoff; `213` PARADE is the one not in the original list. Either
   find another archive or accept as uncovered.
3. **Rerun solver sweep** — `tools-out/solve/run-resume.sh` completed
   2026-09-22 20:12→22:11 (~2h), zero stack overflows after the powered
   fix (item 23): reshard-1 solved=0/exh=3/cut=39, reshard-3 0/1/37,
   reshard-0c (mod-0 tail `--start 352`) 0/1/25; probes for 154 / turns /
   220 / 368 all cutoff (turns hit the `maxStates` cap, not time).
   Targeted re-solves of the deleted goldens: **`527` AFTER HOURS
   re-solved** (38 moves, `goldens/527-after-hours.json` re-emitted);
   `220` METEOR STRIKE and `368` PLANET BABA still `cutoff` at 120
   s/level through all `auto` strategies — macro-only probes at 300 s are
   queued in the resume script. Stale-recording probes (`--start/--end`
   per level): `13`/`110`/`264` cutoff under the fixed engine, `112`
   cutoff via reshard-0, `217` covered by reshard-1, `154` probed by the
   resume script (results land in `tools-out/solve/resolve-*.json`).
   `--skip-goldens` keeps everything incremental.
4. **Second pass on cutoffs** — default `--max-depth 64` bounds *moves*;
   macro's decision-depth already reaches further. Re-run remaining
   `cutoff` levels with higher depth / longer budgets and the new cascade.
5. **Fixture leftovers** — `levels/1-the-lake/2-turns.txt` still lacks a
   winning recording; `1/7-0`, `5/extra-2`, `3/7-0` are fixture-bound by
   stale layouts — `3/7-0` already re-solved shorter (128→110) on its
   embedded board.
6. **`pnpm check` + `pnpm build`** — all green as of this writing
   (875 tests: restored `goldens/4/{1-0,3-0,8-0,extra-1-0}.json` +
   2 rule-multiplicity regressions on top of 869).
7. **Signature hardening** — consider adding `dir` to `layoutSignature`
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

6. **Official `movelist`/`updatelist` ordering** (`movement.lua`) —
   several replay divergences traced to one model: pushed/pull targets
   get their own `movelist` entries appended in check order, and the
   drain applies them in insertion order so a later absolute destination
   overwrites an earlier one (`031` LEAF CHAMBER: two pullers on one
   fungus — last write wins). Commits now carry a real queue order
   instead of buffering extras at the tail.
7. **Duplicate active rules stack** — `code()` counts rule instances;
   `x is move`×2 moves two cells per turn (`been_seen`/`moves`), `x is
   boom`×2 widens the blast (`dim = count-1`), `reverse` parity comes
   from the count too. `ruleCounts` on the runtime feeds all of it.
8. **Blocked movers escalate and re-check** — official `result == 2`
   bumps the mover's state (0→2→3→4) and re-runs `check()` after each
   `doupdate()` drain, so a queued obstacle that has since committed a
   destination is re-evaluated against the *updated* list. Modelled as
   deferral + a frontier-progress guard in `move-batch-runtime.ts`
   (`236` HIDDEN PATH's shift column). A `you`/`prop-free` occupant
   contributes zero to the verdict and stays transparent even while its
   own move is unresolved.
9. **Shift specifics** — movers collect in belt `unitid` order
   (`findallfeature`), each belt queues same-cell same-float units, and
   `level is shift` adds every unit; shift movers write their facing at
   state 0. The alreadymoving dodge (`findupdate`) is *shift-only*: a
   queued obstacle whose destination differs from the mover's cell is
   transparent (`104` TUNNEL's skull/baba belt step).
10. **`bonus` self-pickup** — `blocks.lua` calls `findtype(b,x,y,0)`
    with `unitid=0`, so nothing is excluded: a `you`+`bonus` unit finds
    itself, `floating(self,self)` passes, `issafe` fails, and the unit
    deletes itself the same turn the rule forms (`231` A PRIZE WELL
    EARNED's `baba is bonus` mid-move activation).
11. **Take-1 facing writes + s10 re-entry** — `updatedir` runs
    unconditionally at collection (a blocked `you` still turns toward
    the input), `dir==4` rolls `fixedrandom` per move, and movers
    re-entered via `still_moving` act at state 10: they move again but
    never flip direction. Weak+`move` units blocked both ways escalate
    to s4 and crash instead of surviving flipped.
12. **TELE is same-name pairing, once per turn** — pads send only
    same-`getname` partners (all text units share "text"), matched on
    the float layer, `still` excluded, destination from pad iteration
    order. `objectdata[].tele` marks teleported/back-restored units for
    the rest of the turn; `smallclear()` wipes it, so a unit parked on a
    pad re-teleports EVERY turn (not once-ever — our first guess).
13. **`x is not x` self-negation deletes the unit** — convert.lua maps
    it to `"error"`; `x is x` does NOT protect it (the protect pass only
    rewrites objects passing `getmat`, which `not x` fails). Applies per
    unitlist: `text is not text` wipes all text.
14. **Fallers keep facing** — official `update()` never touches DIR; a
    `text is fall` tile lands facing the same way it fell.
15. **`fallblock()` runs at frame END** — after `movecommand` (move/
    shift/tele inside) and `block()` (interactions/make). Ours had
    `gravity` before `shift`; a shifted unit onto a ledge column must
    fall the same turn (145-trapped).
16. **`x is level` products are rule-inert** — `getmetadata` skips
    `level`/`path`/`specialobject`, so the spawned level icon's
    `getname()` is "" — no subject/object match, not even `all`/`not x`
    (228-avalanche's ghost `level` units ate `level is fall`).
17. **Shift semantics travel down push chains** (197 AB) — official
    `dopush` passes the pusher's `reason` into each pushed unit's
    `check()`, so a belt-pushed unit keeps shift privileges (dodge)
    down the line; ours dropped `isShift` at the first push link.
    Also: deferral now distinguishes "waiting on a still-pending
    arrow" from a true deadlock (starvation guard), and pending
    targets defer only on re-checks — first-pass resolution pushes
    them synchronously, matching the official drain-at-end ordering
    (104 TUNNEL's opposite-direction batch: last write wins).
18. **`empty is pull` pulls cargo through empty cells** (70 GUARDIANS)
    — the pull scan behind a mover can enter an `empty is pull` cell
    as pseudo-unit 2 and keeps scanning through consecutive empties
    until a real pullable unit is found; that cargo then moves one
    cell along the pull direction (`movement.lua` `dopush(2,…)`).
    Shared chain helper in `move-core.ts`, wired into single + batch
    runtimes.
19. **`x is word` needs a real `text_x` source** (222 CANISTER) —
    official `findwordunits`/`codecheck` nukes a self-sustaining
    `x is word` whose only spelling source is the word-prop object it
    created (`belt is word` keeping `belt is shift` alive forever).
    Terms/patterns now carry `sourceIds`; unstable word rules are
    pruned unless rescued by sibling `is word` formations, `all`,
    `group`, negated subjects, or mimic. Regression coverage in
    `rules-word.test.ts`.
20. **FLOAT is latched at turn start** (218 QUEUE) — official
    `statusblock()` samples each unit's float once per turn; a rule
    formed mid-turn (`ice is float`) must not affect same-turn
    teleport/push-layer checks. `Item.floatLatch` now drives every
    float consumer (teleport, split-by-layer, riders, batch verdicts);
    level/empty pseudo-units keep live checks. Two goldens
    re-recorded + oracle-verified (`181`/`2-5-0` victory-spring).
21. **Failed stacked-word variants promote the next word** (218 QUEUE)
    — official `codecheck` retries each word stacked on a cell as a
    sentence start; a dead word in the condition position
    (`baba {near|keke} keke is push`) fails its variant and the
    condition's objects re-parse as a bare subject — `keke is push`.
    `rules-subjects.ts` emits the promoted subjects when a
    non-continuation word shares the condition cell.
22. **Same-name stacked text shares one push verdict** (54 MARITIME
    ADVENTURES) — official `movemap` keys pushed units by
    `(tileid, getname, dir)`, so two stacked `is` texts are one push
    entry; ours let a queued push commit leak a duplicate `is` into a
    blocked cell. Also `134` AUTOMATED DOORS: `x is word` resolution
    iterates to a fixed point (`rock is word` + `rock is flag` cascade
    in the same `code()` pass). And `214`/`215`: `a and a is p`
    keeps duplicate conjuncts as separate rule instances (belt riders
    move once per matching `x is shift`, rider gate is
    still-or-locked not sleep), and `not s is not o` expands per
    objectlist type so `not baba is not keke` error-deletes keke.
23. **`powered`/`feeling` condition re-entry had no visited-set**
    (352 ELECTRICITY sweep crash) — our powered scan re-tested every
    `X IS POWER*` rule's conditions with no `checkedconds` equivalent, so
    a self-referencing `powered bolt is power` (or a mutual power-rule
    cycle) recursed `matchesCondition`↔`matchesRuleSubject` until stack
    overflow. Ported the official guards from `conditions.lua`:
    `testcond` marks the evaluated rule's conds at entry and powered/
    feeling scans skip candidates already under test — now a
    chain-scoped `Set<Rule>` threaded through
    `matchesRuleSubject`/`matchesCondition`/`matchesFeeling` (replacing
    feeling's `depth > 3` cutoff, which official doesn't have — deep
    legit chains resolve fully). Plus `poweredstatus`-style per-context
    memo (`context.poweredStatus`, written only at top-level evals) and
    `!subjectNegated` on power candidates (official never sources power
    from `not x` rules). Regression test:
    `step-official-vocabulary.test.ts` "POWERED skips a
    self-referencing power rule". Residual official gap NOT ported:
    `empty is power`/`level is power` sources (`findempty`/level
    pseudo-unit branches) still unsupported.
24. **Condition-cell dead-word + missing subject double-emitted rules** —
    `{near|keke} keke is push` at sentence start (no resolvable subject
    before the condition cell) emitted `keke is push` twice: once from
    dead-word promotion, once from the empty-subject fallback — so
    `ruleCounts` doubled and stack-sensitive props (`shift`/`move`/`boom`)
    applied twice. Officially both paths land on the same failure point
    and `finals` dedupes identical sentences (same unit ids), so exactly
    one instance exists. Fixed by running the empty-subject fallback
    first and skipping promotion when it fires. Regression tests in
    `rules-conditions.test.ts` assert single-instance multiplicity via
    `collectRuleInstances` (the deduped `collectRules` can't see it).

Two goldens were deleted after oracle verification showed the recorded
inputs lose under the official engine too (`220` METEOR STRIKE,
`527` AFTER HOURS) — `527` has since been re-solved (38 moves); `220`
still needs a solve. `resnapshot` now also re-hashes embedded-layout
goldens whose inputs still win.

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
