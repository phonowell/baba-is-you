import { appendEmptyHasSpawns, resolveEmptyPropsByCell } from '../empty.js'

import { keyFor } from '../helpers.js'
import { createEatsPredicates } from './move-core.js'

import { applyBatchMovement } from './move-batch-apply.js'
import { resolveBatchArrows } from './move-batch-runtime.js'
import { appendHasSpawns, buildGrid, carryHeldRiders, hasLatchedFloat, resolveLevelProps } from './shared.js'

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
  // `x is hold` carrying needs a pre-move seat snapshot — skipped when no
  // unit carries the prop (the common case).
  let hasHolder = false

  for (const item of next) {
    byId.set(item.id, item)
    for (const prop of item.props) {
      if (prop === 'push') pushIds.add(item.id)
      else if (prop === 'stop') stopIds.add(item.id)
      else if (prop === 'pull') pullIds.add(item.id)
      else if (prop === 'open') openIds.add(item.id)
      else if (prop === 'shut') shutIds.add(item.id)
      else if (prop === 'weak') weakIds.add(item.id)
      else if (prop === 'still') stillIds.add(item.id)
      else if (prop === 'phantom') phantomIds.add(item.id)
      else if (prop === 'swap') swapIds.add(item.id)
      else if (prop === 'hold') hasHolder = true
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
      if (hasLatchedFloat(item) !== levelProps.has('float')) continue
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
  const emptyPropsByCell = resolveEmptyPropsByCell(
    rules,
    next,
    width,
    height,
    runtime.context,
  )
  const EMPTY_PROPS: ReadonlySet<string> = new Set()
  const { eats, eatsEmpty } = createEatsPredicates(
    runtime.buckets.eat,
    runtime.context,
    (x: number, y: number): ReadonlySet<string> =>
      emptyPropsByCell.get(keyFor(x, y, width)) ?? EMPTY_PROPS,
  )
  const deadEmptyCells = new Set<number>()
  const context = {
    byId,
    deadEmptyCells,
    eats,
    eatsEmpty,
    emptyPropsAt: (x: number, y: number): ReadonlySet<string> =>
      emptyPropsByCell.get(keyFor(x, y, width)) ?? EMPTY_PROPS,
    grid: buildGrid(next, width),
    height,
    movePass: 0,
    passMoved: new Set<number>(),
    passDeparted: new Map<number, Item[]>(),
    passOrigins: new Map<number, number>(),
    pushQueued: new Set<string>(),
    deferredIds: new Set<number>(),
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
  const spawned = appendHasSpawns(
    survivors,
    removedItems,
    runtime.buckets.has,
    width,
    height,
    next,
  )
  const dropped = deadEmptyCells.size
    ? appendEmptyHasSpawns(
        spawned.items,
        deadEmptyCells,
        runtime.buckets.has,
        runtime.buckets.isProperty,
        width,
        height,
      )
    : spawned

  return {
    escalated,
    items: dropped.items,
    moved: status.changed || spawned.changed || dropped.changed,
  }
}
