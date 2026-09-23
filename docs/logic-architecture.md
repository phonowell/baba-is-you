# Logic Architecture

## Scope

This document covers only `src/logic`. The layer is pure rules and state
transitions — no IO, DOM, or rendering. `step(state, direction)` returns a
new `GameState`; it never mutates its input (stages copy items before
writing).

## State Model

`GameState` (`src/logic/game-types.ts`):

- `items: Item[]` — live entities. `Item` = `LevelItem` + resolved `props`.
  `LevelItem` extras beyond name/pos/dir: `originName` (birth name, for
  `x is revert`), `prevX/prevY` (sticky anchor for `x is back`),
  `followed` (locked `follow` target id), `floatLatch` (the official
  `values[FLOAT]` — sampled once per step at `movecommand` entry, so a
  float rule formed mid-turn only layers next step; mid-turn-spawned
  units latch at their first property pass, an approximation of
  `addunit`→`statusblock`), and the within-turn guards `converted`
  (engine-created this turn — immune to transforms/`weak` sweeps),
  `spawned`, `teleported` (all cleared at step start like the official
  `smallclear`).
- `rules: Rule[]` — active (post-veto, deduped, mimic-expanded) rules from
  the last collection.
- `overriddenTextIds` — text ids that participate only in overridden rules;
  renderers strike those cards without reparsing.
- `rulesSourceItems` — the items array `rules` was parsed from. The parser
  only reads `id`/`name`/`x`/`y`/`isText` plus the `word` prop, so a later
  step whose items still match those fields reuses the stored ruleset
  verbatim (`sameRuleInputs` in `step.ts`) instead of rescanning the grid.
- `levelOffset`/`levelDir` — `level is you/move/fall*/push/pull` scrolls or
  rotates the whole room. Purely a render offset (official `MF_scrollroom`):
  logical positions and rule adjacency never move. `levelDir` is the
  official `mapdir`, starting at `down`.
- `turn` — increments on every processed command, including waits and
  no-ops that pass validation. Teleport RNG and `chill`/`often`/`seldom`
  rolls are seeded from it, so turn count is gameplay-visible.

## Step Pipeline

`src/logic/step.ts` runs `STEP_STAGES` from `src/logic/step/phase-list.ts` —
a single static table, in gameplay order:

| Stage | What it does | Sync |
|-------|--------------|------|
| `player-move` | Input move for `you`/`you2`/`3d` units; `reverse` units run a second pass in the flipped direction | reapply-properties |
| `auto-move` | `follow` re-aims (aim-only, never moves); then `move`/`auto`/`chill`/`nudge*` self-movers and `fear` flees move through the batch engine; `empty is move/auto` cells push too | reuse-rules |
| `shift` | `shift` conveyor pass | recollect-rules |
| `direction-faces` | `up`/`down`/`left`/`right` props force facing; `turn`/`deturn` rotate a quarter turn | reuse-rules |
| `transform` | `x is y` noun transforms + `x become y`; `x is x` vetoes the whole transform set for x; `empty is <noun>` spawns into empty cells | recollect-rules |
| `back` | `x is back` rewinds movers to their pre-step cell (official undo-buffer restore) — after all movement, before interactions, so the restored position still collides | reuse-rules |
| `more` | `x is more` grows into free neighbor cells — before the destruction checks (official `block()` order), so a copy landing on a soft hazard resolves in the same turn | recollect-rules |
| `interactions` | Destruction & pickup checks: `open`/`shut`, `defeat`, `sink`, `hot`/`melt`, `weak`, `boom`, co-cell `eat` | recollect-rules |
| `teleport` | `tele` pairing, RNG seeded by `turn` | recollect-rules |
| `make` | `x make y` spawns | recollect-rules |
| `write` | `x write y` spawns text | recollect-rules |
| `bonus` | `bonus` self-pickup — the official post-`make` you-sweep, so a unit made onto a `you` this turn is collected immediately | reuse-rules |
| `gravity` | `fall`/`fall*` units drop until blocked (official `fallblock` — resolves each cell through the movement check) | reapply-properties |

The ordering mirrors the official frame: `more` copies land *before*
sink/melt/defeat/eat; creation verbs (`make`/`write`) spawn *after* the
destruction checks, so a `you` survives one turn on the hazard it just made
(JAYWALKERS UNITED's grass trail); `bonus` pickup runs in the post-`make`
you-sweep; and `gravity` is `fallblock()` at frame end — a unit shifted
onto a ledge column falls the same turn, while a faller landing on a
`defeat` tile survives until the next turn's `block()`.

## Per-Stage Synchronization

Each stage declares how the rule runtime is refreshed after it runs:

- `reuse-rules` — keep current rules; rebuild only the match context so
  updated poses are visible.
- `reapply-properties` — keep current rules; rebuild context, then
  recompute item props from those same rules.
- `recollect-rules` — re-collect rules from text first, then recompute
  props. `sameRuleInputs` short-circuits this: when a stage only moved
  plain units the ruleset is provably identical, so the runtime is rebound
  rather than reparsed.

Synchronization is skipped for stages that report no change — but once any
stage mutates items the rule snapshot is `rulesStale`, and the next
no-change `recollect-rules` stage still re-collects once before the step
ends (`runStage`/`keepFrame` in `step.ts`). Stages must report `changed`
honestly for any semantic item mutation (position, name, direction,
removal, spawn) — including direction/lock writes like `follow` aiming.

`step()`'s `changed` flag follows *net* state: a step whose stages mutated
then restored the board (e.g. stepping onto a shift belt that pushes back)
reports `changed: false`. Undo depth, tele RNG seeding and render refresh
all key off it — invalid commands must never count as processed.

## Rule Collection & Runtime

`collectRuleInstances` (`src/logic/rules.ts`) scans horizontal and vertical
text lines. A "word" at a position is a text card, a `word`-prop unit acting
as its noun, or a letter-spelled multi-cell word (see Letter Units).
`rules-parse-terms.ts` tokenizes term chains (`and`/`not`, multi-cell
spans); `rules-subjects.ts` builds subject+condition patterns and bridges
phrases across operators.

Then `partitionRuleInstances` (`src/logic/rules-override.ts`) splits
instances into active vs overridden:

- A positive rule is vetoed by a matching `NOT` rule with the same
  predicate/object/condition and a compatible subject (`X IS NOT P` vetoes
  `X IS P`; `NOT A IS NOT P` vetoes `B IS P` for `B ≠ A`).
- `x is x` suppresses every other transform on subject `x`.

`collectRuleRuntime` dedupes active rules, runs `expandMimicRules` (`x
mimic y` copies every active non-mimic rule whose subject is `y` onto `x`;
`x mimic not y` is protection against copying), and builds:

- `RuleBuckets` (`src/logic/rule-runtime.ts`): one-pass partition by kind —
  `is-property`, `is-transform` (incl. `become`), `has`, `make`, `eat`,
  `write`, `fear`, `follow`, `mimic`, `play` — plus indexes:
  `propertyBySubject` (concrete subjects by name), `propertyText`
  (non-negated `text` subject), `propertyWildcard` (`all`/`group*`/
  negated subjects), and `level` (positive `level is <prop>` rules for
  border-contact checks).
- `context` (`createRuleMatchContext` in `src/logic/rule-match.ts`):
  per-frame cell index, `group*` membership (derived from unconditional
  `x is group` property rules), and turn extras `idle` (no directional
  input — the official `last_key == 4`) / `turn` (seeds `often`/`seldom`).

`is-property`/`is-transform` are internal kinds only — surface grammar is
`IS`, and `ruleOperatorForKind` round-trips them back for rendering.

## Conditions & Negation

`RuleCondition` (`src/logic/types.ts`):

- Infix (`X <cond> Y IS …`): `on`, `near`, `facing`, `nextto`, `facedby`,
  `seeing`, `without`, `above`, `below`, `besideleft`, `besideright`,
  `feeling`. `facing` also takes a direction target.
- Postfix (`X <cond> IS …`): `lonely`, `idle`, `often`, `seldom`,
  `powered`, `powered2`, `powered3`.

Condition evaluation carries the official `checkedconds` guard
(`rule-match.ts`): every rule whose condition is under test sits in a
chain-scoped `visited` set — `powered*`/`feeling` rescan candidate rules'
conditions but skip ones already in the chain, so `x powered is power`
self-references and mutual-recursion rings terminate instead of
overflowing. `powered*` verdicts are board-global and memoized on
`context.poweredStatus` (written only from a top-level evaluation, like
the official `checkedconds_ == nil` gate); `not x` subjects never source
power. Separately, real `level`-named units are nameless officially —
`isLevelIcon` makes them match no subject or object word, while the
`id: -1` pseudo-item in `resolveLevelProps` evaluates `level is …`
conditions as the level entity itself.

Three independent negations exist: `subjectNegated` (`not x is push`),
`objectNegated` (`x is not push`), and `objectNegated` on the condition
(`x on not y` — distinct from `x not on y`, which negates the whole
condition via `negated`).

## Letter Units

`src/logic/letter-words.ts` mirrors the official `letterunits.lua`:
`a-z`/`0-9`/`sharp`/`flat`/`ab`/`ba` tiles are letter units, never
standalone words. A contiguous run of ≥2 letter cells enumerates every
`SPELLABLE_WORDS` substring (the official `unitreference` dictionary); each
spelled word is a multi-cell text unit usable in any phrase position —
`ScannedTerm.span` keeps the parser resuming after the word's far end. In
levels containing `play` text the dictionary switches to note names and
single cells count (`cullnotes`).

## Empty Cells

`src/logic/empty.ts` treats each empty cell as its own pseudo-unit
(official `unitid 2`): `resolveEmptyPropsByCell` returns a per-cell prop
map, so `empty near water is push` only pushes cells that satisfy the
condition. `resolveActiveEmptyProps` keeps the board-wide union for
existential checks (`level is melt` + any hot empty). Movement engines take
`emptyPropsAt(x,y)`; `empty is you/move/auto` cells move and push like real
units, `empty is swap` trades places, `empty is pull` blocks plain entry.
`checkWin`'s empty half is per-cell — `empty is you` + `empty is win` wins
only when one cell carries both.

## Transforms

`applyTransforms` (`src/logic/resolve-transforms.ts`) handles
`is-transform` and `become` through one pipeline:

- Targets: a noun, `all` (one variant per candidate noun), `text` (become
  the text entity of its own name), `revert` (back to `originName`),
  `empty` (delete the unit).
- `x is x` vetoes the whole transform set for `x`; same-name `become` is a
  silent no-op that suppresses nothing.
- `x is not x` is the official error conversion — the unit deletes itself
  outright (a paradox, not a veto); `not s is not o` expands per object
  name so every `o`-typed unit paradoxes while `o` itself survives.
- `x is all` is additive: it stacks one of every other candidate noun at
  the cell, skipping the source's own name, names vetoed by matching
  `x is not b` rules, and names already present as co-occupants.
- Engine-spawned (`converted`) units can never be transform sources —
  the official `flags[CONVERTED]` skip in `conversion()`.
- Multi-target transforms keep the original id on the first variant and
  mint fresh ids for the rest; candidates evaluate in rule order because
  that first variant becomes the source's new identity.
- `empty is <noun>` spawns into every matching empty cell; a cell marked
  by `x is empty` (`emptydata.conv`) never fires an empty spawn again.

## Movement Engines

Two runtimes share `src/logic/step/move-core.ts` (`inBounds`,
`isOpenShutPair`, `removeOne`, `moveOne`, `getLiveCellItems`, plus the
`eat`/lock predicate builders):

- `move-single*.ts` — the player-move pass. Handles `empty is you`
  pseudo-movers, bidirectional `swap` (mover-side too), and the move-time
  specials from the official `check()`: `eat` consumes at the destination
  (a target that moved away dodges), `open`/`shut` requires same float
  layer and an unsafe side, `weak` same-layer targets are pushable but
  never blocking.
- `move-batch*.ts` — simultaneous movers for `auto-move`, `shift` and
  `gravity`. `move`/`chill` units bounce off obstacles (`isMove`);
  `auto`/`nudge*`/`fear` just stop (and die if `weak`). Planning produces
  one ordered commit list (the official `movelist`): push/pull-created
  entries queue as absolute destinations ahead of the mover's own entry,
  and `applyBatchMovement` drains them in insertion order with swap
  movers last. Visibility models the official `findupdate`: a check on
  visit `v` only sees commits stamped by earlier visits — root movers
  tick their own visit per re-check, while push/pull-created arrows
  inherit the creator's visit so their first check already sees the
  drained backlog. This is an iteration-boundary approximation, not a
  bit-exact `updatelist` simulation; `lastDeferTick`/`exhaustedTick`
  bound the deferral fixpoint. Arrows that needed more than one check
  carry `escalated` (official `data.state > 0`), so their still-moving
  re-entry skips the move/chill flip-retry.

`reverse` flips a unit's own move direction; `still` blocks push/pull/
shift/swap (but a `still` unit under `fear` still turns to face the flee
direction); `sleep`/`broken` skip self-movement; `phantom` skips collision;
`float` partitions cells into two interaction layers (`keyForLayer`).

## Spawning & Drops

`MAKE`/`WRITE` share `src/logic/step/spawn-by-rule.ts` — behavior-specific
details inject via `make.ts`/`write.ts`. `x has y` cargo drops at
`delete()` time (`appendHasSpawns` in `step/shared.ts`, called by both
movement engines and `interactions`), so a unit eaten mid-move drops its
cargo before interaction checks run.

## Win & Lose

`checkWin` (`src/logic/step/win.ts`): win iff some (cell, float layer)
holds both a `you`-like prop and a win-like prop (`win`/`end`/`done`), the
same per-cell for empty pseudo-units, or `level is win/end/done` holds —
that last one completes the level outright, even the turn the last `you`
dies. Losing requires having had a `you` to lose: rooms that never granted
control stay `playing`; a reached `lose` is sticky (recovery is the undo
stack's job).

## Level As An Entity

`level` is a subject like any other, resolved through the `level` bucket by
`resolveLevelProps`/`resolveLevelPropsGlobal` (`step/shared.ts`):

- `level is <prop>` applies at border cells — `level is stop` walls the
  edges, `level is defeat` kills border contact, `level is win/end/done`
  wins outright.
- `level is you/move/auto/fall*` scrolls the room via `levelOffset`
  (wraps at edges); `level is push`/`pull` moves the room when units work
  against the frame (`levelPushPullDelta` compares pre/post-step
  positions). Both are render offsets only.
- `level is <noun>` (a transform) is *not* a win — officially it exits to
  the map and transforms the icon; unimplemented here by design.

## Determinism & Replay

`replay-input.ts` owns the `u/d/l/r/w/z` input codec — node-dep-free so the
web bundle shares it with `replay.ts`, which replays input strings through
`step()` and hashes each state (`sha256`, 16 hex chars) for golden
assertions. `compressInputs` folds `z`-detours into the effective path.
Everything random is seeded by `turn`/`id` (`chill` FNV hash, tele pairing,
`often`/`seldom`), so replays are stable across runs.

## Solver Entry

`prepareStep(state)` resolves the rule frame once (non-idle) and returns a
per-direction function — sibling expansion for the solver, skipping the
~18% resolve cost per edge. Waits are not covered (`idle` flips rule
matching): `step(state, null)` remains the only correct wait. Solver core
lives in `src/logic/solve.ts`; status and CLI are in
[docs/solver-handoff.md](./solver-handoff.md).

## File Map

```text
src/logic/
  types.ts              vocabulary (CORE_PROPERTIES, word classes, Rule/RuleCondition)
  game-types.ts         GameState/Item/LevelData/LevelMeta
  state.ts              createInitialState (collect → transform → re-collect → props)
  step.ts               step() / prepareStep() — frame resolve + stage loop + win/lose
  step/phase-list.ts    STEP_STAGES: the 13-stage table + sync kinds
  step/phases.ts        direction-faces + more
  step/phases-movement.ts  auto-move (follow/fear/move/auto/chill/nudge/empty), shift, fall, back
  step/move-single*.ts  player-move engine
  step/move-batch*.ts   simultaneous-move engine (auto-move/shift/gravity)
  step/move-core.ts     shared grid/verdict primitives
  step/interactions.ts  destruction/pickup checks + bonus self-pickup
  step/spawn-by-rule.ts + make.ts/write.ts   rule-driven spawns
  step/teleport.ts      tele pairing (turn-seeded)
  step/win.ts           checkWin / hasAnyYou
  step/shared.ts        prop helpers, level props, room scroll, float layers
  rules.ts              collectRuleInstances + expandMimicRules
  rules-parse*.ts       term-chain tokenizer (span-aware)
  rules-subjects.ts     subject/condition patterns, stringifyCondition
  rules-override.ts     active/overridden partition + text marks
  rule-match.ts         match context, group membership, word matching
  rule-runtime.ts       RuleRuntime/RuleBuckets + collectRuleRuntime
  resolve.ts            applyProperties (name-only memoized)
  resolve-transforms.ts applyTransforms (is/become/revert/all/text/empty)
  empty.ts              per-cell empty pseudo-unit props
  letter-words.ts       letter units → spelled dictionary words
  replay.ts/replay-input.ts  input codec + golden replay/hashing
  solve.ts              level solver (see solver-handoff.md)
  parse-level.ts        `levels/**/*.txt` + levels-data text format
  parse-ascii-level.ts  ASCII fixture format with palette meta
  helpers.ts            keyFor/keyForLayer/inBounds/resolveRuleTargets
```
