import { resolveActiveEmptyProps } from '../empty.js'

import { applyBatchMovement } from './move-batch-apply.js'
import { resolveBatchArrows } from './move-batch-runtime.js'
import { appendHasSpawns, buildGrid } from './shared.js'

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
    for (const prop of item.props) {
      if (prop === 'push') pushIds.add(item.id)
      else if (prop === 'stop') stopIds.add(item.id)
      else if (prop === 'pull') pullIds.add(item.id)
      else if (prop === 'open') openIds.add(item.id)
      else if (prop === 'shut') shutIds.add(item.id)
      else if (prop === 'weak') weakIds.add(item.id)
    }
  }

  const removed = new Set<number>()
  const removedItems: Item[] = []
  const status = { changed: false }
  const emptyProps = resolveActiveEmptyProps(
    rules,
    next,
    width,
    height,
    runtime.context,
  )
  const emptyPush = emptyProps.has('push')
  const emptyStop = emptyProps.has('stop')
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
    width,
    height,
    next,
  )

  return {
    items: spawned.items,
    moved: status.changed || spawned.changed,
  }
}
