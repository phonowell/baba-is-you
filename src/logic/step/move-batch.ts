import { emptyHasProp } from '../empty.js'

import { applyBatchMovement } from './move-batch-apply.js'
import { resolveBatchArrows } from './move-batch-runtime.js'
import { appendHasSpawns, buildGrid, hasProp } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item } from '../types.js'

export const moveItemsBatch = (
  items: Item[],
  runtime: RuleRuntime,
  movers: Array<{ id: number; dir: Direction; isMove: boolean }>,
): { items: Item[]; moved: boolean } => {
  const { height, rules, width } = runtime
  const next = items.map((item) => ({ ...item }))
  const byId = new Map<number, Item>()

  const pushIds = new Set<number>()
  const stopIds = new Set<number>()
  const pullIds = new Set<number>()
  const openIds = new Set<number>()
  const shutIds = new Set<number>()
  const weakIds = new Set<number>()

  for (const item of next) {
    byId.set(item.id, item)
    if (hasProp(item, 'push')) pushIds.add(item.id)
    if (hasProp(item, 'stop')) stopIds.add(item.id)
    if (hasProp(item, 'pull')) pullIds.add(item.id)
    if (hasProp(item, 'open')) openIds.add(item.id)
    if (hasProp(item, 'shut')) shutIds.add(item.id)
    if (hasProp(item, 'weak')) weakIds.add(item.id)
  }

  const removed = new Set<number>()
  const removedItems: Item[] = []
  const status = { changed: false }
  const emptyPush = emptyHasProp(rules, 'push', next, width, height)
  const emptyStop = emptyHasProp(rules, 'stop', next, width, height)
  const context = {
    byId,
    emptyPush,
    emptyStop,
    grid: buildGrid(next, width),
    height,
    openIds,
    pullIds,
    pushIds,
    removed,
    removedItems,
    shutIds,
    status,
    stopIds,
    weakIds,
    width,
  }

  const arrows = resolveBatchArrows(context, movers)
  applyBatchMovement(context, arrows)

  const survivors = next.filter((item) => !removed.has(item.id))
  const spawned = appendHasSpawns(
    survivors,
    removedItems,
    runtime.buckets.has,
    true,
    width,
    height,
    next,
  )

  return {
    items: spawned.items,
    moved: status.changed || spawned.changed,
  }
}
