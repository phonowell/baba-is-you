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
  ) => { items: Item[]; changed: boolean }
}

type RecomputeStage = Omit<ReuseRulesStage, 'sync' | 'run'> & {
  sync: { kind: 'reapply-properties' } | { kind: 'recollect-rules' }
  run: (
    items: Item[],
    runtime: RuleRuntime,
  ) => { items: StepPhaseItems; changed: boolean }
}

export type StepStage = ReuseRulesStage | RecomputeStage

export const buildStepStages = (
  direction: Direction | null,
  turn: number,
  levelDir?: Direction,
): StepStage[] => [
  {
    name: 'player-move',
    sync: { kind: 'reapply-properties' },
    run: (items, runtime) => {
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
      const moved = applyFall(
        items,
        runtime.width,
        runtime.height,
        runtime.rules,
      )
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    name: 'shift',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => {
      const moved = applyShift(items, runtime, levelDir)
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
    run: (items, runtime) => {
      const transformed = applyTransforms(items, runtime)
      return { items: transformed.items, changed: transformed.changed }
    },
  },
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
  {
    name: 'more',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => applyMore(items, runtime.width, runtime.height),
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
    name: 'interactions',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => applyInteractions(items, runtime),
  },
  {
    name: 'teleport',
    sync: { kind: 'recollect-rules' },
    run: (items, runtime) => {
      const teleported = applyTeleport(
        items,
        runtime.width,
        runtime.height,
        turn,
        runtime.buckets.level,
        runtime.context,
      )
      return { items: teleported.items, changed: teleported.moved }
    },
  },
]
