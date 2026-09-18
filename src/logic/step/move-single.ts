import { resolveActiveEmptyProps } from '../empty.js'

import { createSingleMoveRuntime } from './move-single-runtime.js'
import { appendHasSpawns, buildGrid, hasProp } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item } from '../types.js'

export const moveItems = (
  items: Item[],
  direction: Direction,
  runtime: RuleRuntime,
  isMover: (item: Item) => boolean,
  isMovePhase: boolean,
): { items: Item[]; moved: boolean } => {
  const { height, rules, width } = runtime
  if (!items.some(isMover)) return { items, moved: false }

  const next = items.map((item) => ({ ...item }))
  const byId = new Map<number, Item>()
  const movers: number[] = []
  const moverIds = new Set<number>()
  const pushIds = new Set<number>()
  const stopIds = new Set<number>()
  const pullIds = new Set<number>()
  const swapIds = new Set<number>()
  const openIds = new Set<number>()
  const shutIds = new Set<number>()
  const weakIds = new Set<number>()

  for (const item of next) {
    byId.set(item.id, item)
    if (isMover(item)) {
      movers.push(item.id)
      moverIds.add(item.id)
    }
    if (hasProp(item, 'push')) pushIds.add(item.id)
    if (hasProp(item, 'stop')) stopIds.add(item.id)
    if (hasProp(item, 'pull')) pullIds.add(item.id)
    if (hasProp(item, 'swap')) swapIds.add(item.id)
    if (hasProp(item, 'open')) openIds.add(item.id)
    if (hasProp(item, 'shut')) shutIds.add(item.id)
    if (hasProp(item, 'weak')) weakIds.add(item.id)
  }

  const moved = new Set<number>()
  const removed = new Set<number>()
  const removedItems: Item[] = []
  const status = { anyMoved: false }
  const emptyProps = resolveActiveEmptyProps(rules, next, width, height)
  const emptyPush = emptyProps.has('push')
  const emptyStop = emptyProps.has('stop')
  const engine = createSingleMoveRuntime(
    {
      byId,
      emptyPush,
      emptyStop,
      grid: buildGrid(next, width),
      height,
      moverIds,
      moved,
      openIds,
      pullIds,
      pushIds,
      removed,
      removedItems,
      status,
      stopIds,
      swapIds,
      weakIds,
      width,
      shutIds,
    },
    direction,
    isMovePhase,
  )

  // Row-major (y,x) mover order, matching the predecessor's cell iteration.
  const sortedMovers = [...movers].sort((a, b) => {
    const itemA = byId.get(a)
    const itemB = byId.get(b)
    if (!itemA || !itemB) return a - b
    return itemA.y - itemB.y || itemA.x - itemB.x || itemA.id - itemB.id
  })

  for (const id of sortedMovers) {
    if (moved.has(id) || removed.has(id)) continue

    if (!engine.canMove(id, new Set())) {
      const item = byId.get(id)
      if (item && weakIds.has(id) && !isMovePhase) {
        removed.add(item.id)
        removedItems.push(item)
        status.anyMoved = true
      }
      continue
    }

    engine.doMove(id)
  }

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
    moved: status.anyMoved || spawned.changed,
  }
}
