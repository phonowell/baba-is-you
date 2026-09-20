import { resolveActiveEmptyProps } from '../empty.js'

import { applyBatchMovement } from './move-batch-apply.js'
import { resolveBatchArrows } from './move-batch-runtime.js'
import { appendHasSpawns, buildGrid, carryHeldRiders, hasProp, resolveLevelProps } from './shared.js'

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
  const stillIds = new Set<number>()
  const phantomIds = new Set<number>()
  const swapIds = new Set<number>()
  // `level is hold` pins — unlike `still`, a pinned unit can't move under
  // its own power either.
  const pinnedIds = new Set<number>()

  for (const item of next) {
    byId.set(item.id, item)
    for (const prop of item.props) {
      if (prop === 'push' || prop === 'word') pushIds.add(item.id)
      else if (prop === 'stop') stopIds.add(item.id)
      else if (prop === 'pull') pullIds.add(item.id)
      else if (prop === 'open') openIds.add(item.id)
      else if (prop === 'shut') shutIds.add(item.id)
      else if (prop === 'weak') weakIds.add(item.id)
      else if (prop === 'still') stillIds.add(item.id)
      else if (prop === 'phantom') phantomIds.add(item.id)
      else if (prop === 'swap') swapIds.add(item.id)
    }
  }

  for (const id of stillIds) {
    pushIds.delete(id)
    pullIds.delete(id)
  }
  for (const id of phantomIds) {
    pushIds.delete(id)
    pullIds.delete(id)
    stopIds.delete(id)
    openIds.delete(id)
    shutIds.delete(id)
    weakIds.delete(id)
  }

  // `level is hold` pins every unit touching the map frame (the official
  // `cantmove` levelhold check) — held units can't move or be carried.
  // Conditions evaluate at each unit's contact cell.
  const levelRules = runtime.buckets.level
  const hasLevelHoldRule = levelRules.some(
    (rule) => !rule.objectNegated && rule.object === 'hold',
  )
  if (hasLevelHoldRule) {
    for (const item of next) {
      const atBorder =
        item.x === 0 ||
        item.y === 0 ||
        item.x === width - 1 ||
        item.y === height - 1
      if (!atBorder) continue
      const levelProps = resolveLevelProps(
        levelRules,
        runtime.context,
        item.x,
        item.y,
      )
      if (hasProp(item, 'float') !== levelProps.has('float')) continue
      if (!levelProps.has('hold')) continue
      pinnedIds.add(item.id)
      stillIds.add(item.id)
      pushIds.delete(item.id)
      pullIds.delete(item.id)
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
  for (const item of next) before.set(item.id, { x: item.x, y: item.y })

  const arrows = resolveBatchArrows(context, movers)
  applyBatchMovement(context, arrows)

  if (carryHeldRiders(before, next, removed, width, height, stillIds))
    status.changed = true

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
