import { applyTransforms } from '../resolve.js'

import { applyInteractions } from './interactions.js'
import { applyMake } from './make.js'
import { moveItems } from './move-single.js'
import {
  applyBack,
  applyDirectionalFacing,
  applyFall,
  applyMore,
  applyMoveAdjective,
  applyShift,
} from './phases.js'
import { hasProp, isYouLike, reverseDirection } from './shared.js'
import { applyTeleport } from './teleport.js'
import { applyWrite } from './write.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item, LevelItem } from '../types.js'

export type StepPhaseItems = Item[] | LevelItem[]

export type StepStageSync =
  | { kind: 'reuse-rules' }
  | { kind: 'reapply-properties' }
  | { kind: 'recollect-rules' }

// Per-step values the stage bodies need — passed in rather than closed
// over, so the stage table below is a single static allocation instead of
// a dozen fresh objects plus closures on every step() call.
export type StepStageContext = {
  direction: Direction | null
  turn: number
  levelDir: Direction
  // Live `emptydata` conv cells for this step — the transform stage adds
  // newly converted cells; step() writes it back to the next state.
  emptyConverted: Set<number>
}

type ReuseRulesStage = {
  name:
    | 'player-move'
    | 'auto-move'
    | 'gravity'
    | 'shift'
    | 'direction-faces'
    | 'transform'
    | 'make'
    | 'write'
    | 'more'
    | 'back'
    | 'interactions'
    | 'teleport'
  sync: { kind: 'reuse-rules' }
  run: (
    items: Item[],
    runtime: RuleRuntime,
    ctx: StepStageContext,
  ) => { items: Item[]; changed: boolean }
}

type RecomputeStage = Omit<ReuseRulesStage, 'sync' | 'run'> & {
  sync: { kind: 'reapply-properties' } | { kind: 'recollect-rules' }
  run: (
    items: Item[],
    runtime: RuleRuntime,
    ctx: StepStageContext,
  ) => { items: StepPhaseItems; changed: boolean }
}

export type StepStage = ReuseRulesStage | RecomputeStage

// The stage sequence — a single static table. Per-step variation travels
// in `ctx`, so step() allocates zero stage objects per call.
export const STEP_STAGES: StepStage[] = [
  {
    name: 'player-move',
    sync: { kind: 'reapply-properties' },
    run: (items, runtime, ctx) => {
      const direction = ctx.direction
      if (!direction) return { items, changed: false }
      const isMover = (item: Item): boolean =>
        isYouLike(item) &&
        !hasProp(item, 'sleep') &&
        !hasProp(item, 'broken')
      // `reverse` flips the move direction for its own units only — run
      // the two mover classes in separate passes.
      const normal = moveItems(
        items,
        direction,
        runtime,
        (item) => isMover(item) && !hasProp(item, 'reverse'),
        false,
      )
      const flipped = moveItems(
        normal.items,
        reverseDirection(direction),
        runtime,
        (item) => isMover(item) && hasProp(item, 'reverse'),
        false,
        true,
      )
      return {
        items: flipped.items,
        changed: normal.moved || flipped.moved,
      }
    },
  },
  {
    name: 'auto-move',
    sync: { kind: 'reuse-rules' },
    run: (items, runtime) => {
      const moved = applyMoveAdjective(items, runtime)
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    name: 'gravity',
    sync: { kind: 'reapply-properties' },
    run: (items, runtime) => {
      const moved = applyFall(items, runtime)
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    name: 'shift',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime, ctx) => {
      const moved = applyShift(items, runtime, ctx.levelDir)
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    name: 'direction-faces',
    sync: { kind: 'reuse-rules' },
    run: (items) => {
      const rotated = applyDirectionalFacing(items)
      return { items: rotated.items, changed: rotated.changed }
    },
  },
  {
    name: 'transform',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime, ctx) => {
      const transformed = applyTransforms(items, runtime, ctx.emptyConverted)
      return { items: transformed.items, changed: transformed.changed }
    },
  },
  {
    // `x is back` rewinds movers to their pre-step cell (official
    // undo-buffer restore in blocks.lua) — runs after all movement but
    // before interactions, so the restored position still collides.
    name: 'back',
    sync: { kind: 'reuse-rules' },
    run: (items, runtime) => {
      const restored = applyBack(items, runtime.width, runtime.height)
      return { items: restored.items, changed: restored.moved }
    },
  },
  {
    // Official block() order: `more` copies before sink/melt/defeat/eat so
    // a copy landing on a soft hazard resolves in the same turn.
    name: 'more',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => applyMore(items, runtime),
  },
  {
    name: 'interactions',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => applyInteractions(items, runtime),
  },
  {
    name: 'teleport',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime, ctx) => {
      const teleported = applyTeleport(
        items,
        runtime.width,
        runtime.height,
        ctx.turn,
        runtime.buckets.level,
        runtime.context,
      )
      return { items: teleported.items, changed: teleported.moved }
    },
  },
  // Creation verbs run at the end of the turn, after every destruction
  // check — official ordering ("make comes after most of the checks like
  // defeat"), which is what lets a `you` stand on the hazard it just
  // made until the next turn (e.g. JAYWALKERS UNITED's grass trail).
  {
    name: 'make',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => applyMake(items, runtime),
  },
  {
    name: 'write',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => applyWrite(items, runtime),
  },
]

