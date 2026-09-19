# Logic Architecture

## Scope

This document covers only `src/logic`.

## Step Pipeline

Core turn flow is in `src/logic/step.ts`.

- Each turn runs a fixed stage pipeline in gameplay order:
  - `player-move`
  - `auto-move`
  - `gravity`
  - `shift`
  - `direction-faces`
  - `transform`
  - `make`
  - `write`
  - `more`
  - `interactions`
  - `teleport`
- Each stage then declares how runtime state is synchronized:
  - `reuse-rules`: keep current rules, rebuild only the runtime match context for updated item poses.
  - `reapply-properties`: keep current rules, rebuild context, then recompute item properties from those same rules.
  - `recollect-rules`: recollect rules from text first, then recompute properties from the newly collected rules.
- Synchronization is skipped for stages that report no change while collected rules still match the current items; a no-change `recollect-rules` stage still re-collects once when earlier stages made the rule snapshot stale. Stages must report `changed` honestly for any semantic item mutation (position, name, direction, removal, spawn).
- Win/lose is evaluated from the final resolved frame.
- `step()` still increments `turn` every processed command, including wait/no-op turns that pass command validation. Teleport RNG uses that turn as seed, so turn-count semantics are gameplay-visible, not bookkeeping-only.

This keeps gameplay timing readable without hiding it behind engine-only refresh jargon.

## Rule Runtime

Rule evaluation state is centralized in `src/logic/rule-runtime.ts`.

- `RuleBuckets`: one-pass partition by internal behavior kind (`is-property` / `is-transform` / `has` / `make` / `eat` / `write`).
- Surface grammar still uses `IS/HAS/MAKE/EAT/WRITE`; the split between `is-property` and `is-transform` is internal only and must round-trip back to `IS` in render/docs.
- `RuleRuntime`: `{ rules, buckets, context, width, height }`.
- Match context is created once per frame and reused by phases that need rule matching.

`RuleRuntime` is threaded through every stage (`buildStepStages`) and consumed by the resolvers (`resolve.ts`, `resolve-transforms.ts`), the movement code (`move-single*.ts`, `move-batch*.ts`, `phases-movement.ts`), the rule spawner (`spawn-by-rule.ts` via `make.ts`/`write.ts`), and `interactions.ts`.

## Overridden Rules

`src/logic/rules-override.ts` partitions collected rule instances into active and overridden sets (a port of the predecessor's `partition_overridden_rules`):

- A positive rule is vetoed by a matching `NOT`-object rule with the same predicate/object/condition and a compatible subject (`X IS NOT P` vetoes `X IS P`; `NOT A IS NOT P` vetoes `B IS P` for `B ≠ A`).
- `x is x` suppresses every other transform on subject `x`.

`collectRuleRuntime` feeds only active rules into the runtime, so overridden rules have no gameplay effect; `collectTextRuleMarks` / `collectOverriddenTextIds` expose the same partition for struck-through text rendering in the web layer.

## Rule Vocabulary

Rule vocabulary is centralized in `src/logic/types.ts`.

- `CORE_PROPERTIES` is the property source of truth; `Property` is derived from that tuple rather than maintained separately.
- Subject/object/condition classifiers (`isSubjectWord`, `isObjectWord`, `isConditionObjectWord`) should be reused instead of recreating parser-local reserved-word sets.
- `FACING` conditions normalize to one shape:
  - object target: `{ kind: 'facing', object, negated? }`
  - direction target: `{ kind: 'facing', direction, negated? }`

This keeps parser, matcher, renderer, and tests on one condition model instead of parallel encodings.

## Movement Core

Shared movement primitives live in `src/logic/step/move-core.ts`.

- `inBounds`
- `isOpenShutPair`
- `removeOne`
- `moveOne`
- `getLiveCellItems`

Both movement runtimes use this core:

- `src/logic/step/move-single-runtime.ts`
- `src/logic/step/move-batch-runtime.ts`

This removes duplicated grid mutation and open/shut handling logic.

## Spawn By Rule

`MAKE` and `WRITE` share a generic rule-based spawner in:

- `src/logic/step/spawn-by-rule.ts`

Behavior-specific details are provided via callbacks in:

- `src/logic/step/make.ts`
- `src/logic/step/write.ts`

## Cell Key Convention

Logic now uses numeric keys (`keyFor(x, y, width)`) as the default cell index.

- Applied in movement helpers, fall phase, and rule-spawn bookkeeping.
- Layer-sensitive occupancy uses numeric derived keys rather than string tuples.
