# Docs Index

Architecture and reference docs for this repo. Code is the source of truth;
these documents explain *why* things are ordered/shaped the way they are.
When behavior changes, update the matching doc in the same change.

## Current architecture

- [logic-architecture.md](./logic-architecture.md) — `src/logic`: step
  pipeline (13 stages + sync protocol), rule collection/runtime, conditions,
  letter units, per-cell empty, transforms, movement engines, win/lose,
  level-as-entity, replay determinism
- [web-architecture.md](./web-architecture.md) — `src/web` app shell: store/
  reducer, command pipeline, input sources (keyboard/pointer/gamepad/hover),
  draw path, golden replay, host gate, lifecycle
- [rendering-3d.md](./rendering-3d.md) — `src/web/board-3d-*` +
  `pixel-sprites/`: factory/runtime split, entity visuals, node lifecycle,
  effects, demand-driven render loop, config grouping
- [level-data.md](./level-data.md) — level sources and formats, official
  import chain, goldens (format, verification gate, producers, in-app
  binding)

## Ops & status

- [deploy.md](./deploy.md) — deploy build (`release/` shell + gated bundle)
  and the `auvya.com/baba` Cloudflare worker (中文)
- [solver-handoff.md](./solver-handoff.md) — active solver sweep handoff:
  strategies, CLI, golden wiring rules, engine-gap findings, open tasks

## Conventions

- Technical docs are written in English; ops/hand-off docs may be 中文.
- `plans/task_plan_*.md` are per-task working records, not documentation —
  kept while a task is live and pruned once it lands (recoverable from git
  history). The live one is `plans/task_plan_solver-sweep.md` (status
  tracked in [solver-handoff.md](./solver-handoff.md)).
- `tools-out/` and `data/` are gitignored local scratch — never referenced
  as if they ship.
