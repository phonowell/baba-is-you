import { resolveActiveEmptyProps } from '../empty.js'

import { createSingleMoveRuntime } from './move-single-runtime.js'
import { appendHasSpawns, buildGrid } from './shared.js'

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
  // Movers carry their sort key (row-major y,x,id) so ordering needs no
  // per-comparison map lookups.
  const movers: Array<{ id: number; x: number; y: number }> = []
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
      movers.push({ id: item.id, x: item.x, y: item.y })
      moverIds.add(item.id)
    }
    for (const prop of item.props) {
      if (prop === 'push') pushIds.add(item.id)
      else if (prop === 'stop') stopIds.add(item.id)
      else if (prop === 'pull') pullIds.add(item.id)
      else if (prop === 'swap') swapIds.add(item.id)
      else if (prop === 'open') openIds.add(item.id)
      else if (prop === 'shut') shutIds.add(item.id)
      else if (prop === 'weak') weakIds.add(item.id)
    }
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
  movers.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)

  for (const mover of movers) {
    const id = mover.id
    if (moved.has(id) || removed.has(id)) continue

    if (!engine.canMoveRoot(id)) {
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
