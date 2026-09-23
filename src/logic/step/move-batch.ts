import {
  appendMovementSpawns,
  createEatsPredicates,
  createEmptyPropLookup,
  createFrozenPassState,
  openMovementSets,
} from './move-core.js'

import { applyBatchMovement } from './move-batch-apply.js'
import { resolveBatchArrows } from './move-batch-runtime.js'
import { buildGrid, carryHeldRiders } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item } from '../types.js'

export const moveItemsBatch = (
  items: Item[],
  runtime: RuleRuntime,
  movers: Array<{
    id: number
    dir: Direction
    isMove: boolean
    isShift?: boolean
  }>,
): { items: Item[]; moved: boolean; escalated: Set<number> } => {
  const { height, rules, width } = runtime
  const next = items.map((item) => ({ ...item }))
  const sets = openMovementSets(
    runtime.buckets.level,
    runtime.context,
    next,
    width,
    height,
  )
  const {
    byId,
    hasHolder,
    openIds,
    phantomIds,
    pinnedIds,
    pullIds,
    pushIds,
    shutIds,
    stillIds,
    stopIds,
    swapIds,
    weakIds,
  } = sets

  const removed = new Set<number>()
  const removedItems: Item[] = []
  const status = { changed: false }
  const { emptyPropsAt } = createEmptyPropLookup(
    rules,
    next,
    width,
    height,
    runtime.context,
  )
  const { eats, eatsEmpty } = createEatsPredicates(
    runtime.buckets.eat,
    runtime.context,
    emptyPropsAt,
  )
  const deadEmptyCells = new Set<number>()
  const context = {
    byId,
    deadEmptyCells,
    eats,
    eatsEmpty,
    emptyPropsAt,
    grid: buildGrid(next, width),
    height,
    ...createFrozenPassState(),
    openIds,
    phantomIds,
    pinnedIds,
    pullIds,
    pushIds,
    removed,
    removedItems,
    shutIds,
    status,
    stillIds,
    stopIds,
    swapIds,
    weakIds,
    width,
  }

  const before = new Map<number, { x: number; y: number }>()
  if (hasHolder)
    for (const item of next) before.set(item.id, { x: item.x, y: item.y })

  const { arrows, commits } = resolveBatchArrows(context, movers)
  applyBatchMovement(context, arrows, commits)

  // Movers whose arrow needed more than the first check — official
  // `data.state > 0` at solve time, so their still_moving re-entry runs
  // at state 10 (no flip-retry).
  const escalated = new Set<number>()
  for (const [id, arrow] of arrows) if (arrow.escalated) escalated.add(id)

  if (
    hasHolder &&
    carryHeldRiders(before, next, removed, width, height, stillIds)
  )
    status.changed = true

  const survivors = next.filter((item) => !removed.has(item.id))
  const dropped = appendMovementSpawns(
    survivors,
    removedItems,
    deadEmptyCells,
    runtime.buckets,
    width,
    height,
    next,
  )

  return {
    escalated,
    items: dropped.items,
    moved: status.changed || dropped.changed,
  }
}
