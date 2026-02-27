import { applyTransforms } from '../resolve.js'

import { applyInteractions } from './interactions.js'
import { applyMake } from './make.js'
import { moveItems } from './move-single.js'
import {
  applyDirectionalFacing,
  applyFall,
  applyMore,
  applyMoveAdjective,
  applyShift,
} from './phases.js'
import { hasProp } from './shared.js'
import { applyTeleport } from './teleport.js'
import { applyWrite } from './write.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item, LevelItem } from '../types.js'

type RefreshMode = 'none' | 'props' | 'resolve'
type PhaseItems = Item[] | LevelItem[]

export type StepPhase = {
  refresh: RefreshMode
  run: (
    items: Item[],
    runtime: RuleRuntime,
  ) => { items: PhaseItems; changed: boolean }
}

export const buildStepPhases = (
  direction: Direction | null,
  turn: number,
): StepPhase[] => [
  {
    refresh: 'props',
    run: (items, runtime) => {
      if (!direction) return { items, changed: false }
      const moved = moveItems(
        items,
        direction,
        runtime,
        (item) => hasProp(item, 'you') && !hasProp(item, 'sleep'),
        false,
      )
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    refresh: 'none',
    run: (items, runtime) => {
      const moved = applyMoveAdjective(items, runtime)
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    refresh: 'props',
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
    refresh: 'resolve',
    run: (items, runtime) => {
      const moved = applyShift(items, runtime)
      return { items: moved.items, changed: moved.moved }
    },
  },
  {
    refresh: 'none',
    run: (items) => {
      const rotated = applyDirectionalFacing(items)
      return { items: rotated.items, changed: rotated.changed }
    },
  },
  {
    refresh: 'resolve',
    run: (items, runtime) => {
      const transformed = applyTransforms(items, runtime)
      return { items: transformed.items, changed: transformed.changed }
    },
  },
  {
    refresh: 'resolve',
    run: (items, runtime) => applyMake(items, runtime),
  },
  {
    refresh: 'resolve',
    run: (items, runtime) => applyWrite(items, runtime),
  },
  {
    refresh: 'resolve',
    run: (items, runtime) => applyMore(items, runtime.width, runtime.height),
  },
  {
    refresh: 'resolve',
    run: (items, runtime) => applyInteractions(items, runtime),
  },
  {
    refresh: 'resolve',
    run: (items, runtime) => {
      const teleported = applyTeleport(items, runtime.width, turn)
      return { items: teleported.items, changed: teleported.moved }
    },
  },
]
