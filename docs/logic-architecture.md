# Logic Architecture

## Scope

This document covers only `src/logic`.

## Step Pipeline

Core turn flow is in `src/logic/step.ts`.

- Each turn runs a fixed phase pipeline.
- Each phase declares a refresh mode:
  - `none`: keep rules, rebind runtime context to latest items.
  - `props`: keep rules, recompute item properties.
  - `resolve`: recollect rules, then recompute properties.
- Win/lose is evaluated from the final resolved frame.

This keeps execution order explicit while avoiding hand-written repeated resolve calls.

## Rule Runtime

Rule evaluation state is centralized in `src/logic/rule-runtime.ts`.

- `RuleBuckets`: one-pass partition by kind (`property/transform/has/make/eat/write`).
- `RuleRuntime`: `{ rules, buckets, context, width, height }`.
- Match context is created once per frame and reused by phases that need rule matching.

`resolve.ts`, `step/make.ts`, `step/write.ts`, and `step/interactions.ts` consume `RuleRuntime` directly.

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
