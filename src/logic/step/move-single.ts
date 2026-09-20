import { resolveEmptyPropsByCell } from '../empty.js'

import { createEatsPredicates, isLockedFor } from './move-core.js'
import { createSingleMoveRuntime } from './move-single-runtime.js'
import { appendHasSpawns, buildGrid, carryHeldRiders, hasProp, MOVE_DELTAS, resolveLevelProps } from './shared.js'
import { keyFor } from '../helpers.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item } from '../types.js'

export const moveItems = (
  items: Item[],
  direction: Direction,
  runtime: RuleRuntime,
  isMover: (item: Item) => boolean,
  isMovePhase: boolean,
  reversePass = false,
  // `fallblock` drive mode: fallers never push/pull/swap — every nonzero
  // obstacle verdict lands them — and `empty is you` pseudo-movers don't
  // exist for it.
  fallMode = false,
): { items: Item[]; moved: boolean } => {
  const { height, rules, width } = runtime
  const emptyPropsByCell = resolveEmptyPropsByCell(
    rules,
    items,
    width,
    height,
    runtime.context,
  )
  const EMPTY_PROPS: ReadonlySet<string> = new Set()
  const emptyPropsAt = (x: number, y: number): ReadonlySet<string> =>
    emptyPropsByCell.get(keyFor(x, y, width)) ?? EMPTY_PROPS
  // `empty is you`: each qualifying empty cell becomes a pseudo-unit
  // (official unitid 2) that moves with the player input, pushing the
  // unit in its target cell — or swapping places under `empty is swap`.
  // Like other movers it obeys only its own `empty is reverse`, so it
  // runs in the pass whose flipped flag matches; `still`/`sleep` are
  // per-cell too (conditional rules only apply where they hold).
  const emptyMovesYou = (props: ReadonlySet<string>): boolean =>
    reversePass === props.has('reverse') &&
    !props.has('still') &&
    !props.has('sleep') &&
    (props.has('you') || props.has('you2') || props.has('3d'))
  const emptyYou =
    !isMovePhase &&
    !fallMode &&
    Array.from(emptyPropsByCell.values()).some(emptyMovesYou)
  if (!items.some(isMover) && !emptyYou) return { items, moved: false }

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
  const stillIds = new Set<number>()
  const phantomIds = new Set<number>()
  // `level is hold` pins — unlike `still` (which allows self-movement),
  // a pinned unit can't move under its own power either.
  const pinnedIds = new Set<number>()

  for (const item of next) {
    byId.set(item.id, item)
    if (isMover(item)) {
      movers.push({ id: item.id, x: item.x, y: item.y })
      moverIds.add(item.id)
    }
    for (const prop of item.props) {
      // `word` units stay soft objects — the prop lets them stand in
      // for their noun in rules only; it does not grant push.
      if (prop === 'push') pushIds.add(item.id)
      else if (prop === 'stop') stopIds.add(item.id)
      else if (prop === 'pull') pullIds.add(item.id)
      else if (prop === 'swap') swapIds.add(item.id)
      else if (prop === 'open') openIds.add(item.id)
      else if (prop === 'shut') shutIds.add(item.id)
      else if (prop === 'weak') weakIds.add(item.id)
      else if (prop === 'still') stillIds.add(item.id)
      else if (prop === 'phantom') phantomIds.add(item.id)
    }
  }

  // `still` units cannot be moved by external forces; `phantom` units
  // neither block nor get carried — both strip the affected ids from the
  // movement-prop sets so every downstream check sees it uniformly.
  for (const id of stillIds) {
    pushIds.delete(id)
    pullIds.delete(id)
    swapIds.delete(id)
  }
  for (const id of phantomIds) {
    pushIds.delete(id)
    pullIds.delete(id)
    swapIds.delete(id)
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
      swapIds.delete(item.id)
    }
  }

  const moved = new Set<number>()
  const removed = new Set<number>()
  const removedItems: Item[] = []
  const status = { anyMoved: false }
  const grid = buildGrid(next, width)
  const { eats, eatsEmpty } = createEatsPredicates(
    runtime.buckets.eat,
    runtime.context,
    emptyPropsAt,
  )
  const engine = createSingleMoveRuntime(
    {
      byId,
      eats,
      eatsEmpty,
      emptyPropsAt,
      grid,
      height,
      moverIds,
      moved,
      moveWave: 0,
      movedWave: new Map(),
      openIds,
      phantomIds,
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
      stillIds,
    },
    direction,
    isMovePhase,
    fallMode,
  )

  // `empty is you`: each qualifying empty cell moves with the input. It
  // pushes the pushable units in its target cell (enqueue them as
  // movers); under `empty is swap` the occupant trades places with the
  // empty cell. Both checks are per-cell like the official unitid 2.
  const emptySwaps: Array<{ id: number; x: number; y: number }> = []
  if (emptyYou) {
    const [dx, dy] = MOVE_DELTAS[direction]
    for (const [key, props] of emptyPropsByCell) {
      if (!emptyMovesYou(props)) continue
      const x = key % width
      const y = (key - x) / width
      const tx = x + dx
      const ty = y + dy
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue
      const targets = grid.get(keyFor(tx, ty, width))
      if (!targets?.length) continue
      for (const target of targets) {
        if (props.has('swap')) {
          if (!stillIds.has(target.id))
            emptySwaps.push({ id: target.id, x, y })
        } else if (pushIds.has(target.id) && !moverIds.has(target.id)) {
          movers.push({ id: target.id, x: target.x, y: target.y })
          moverIds.add(target.id)
        }
      }
    }
  }

  // Row-major (y,x) mover order, matching the predecessor's cell iteration.
  movers.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)

  // `hold` carrying needs each entity's pre-move seat — snapshot before
  // the mover loop mutates positions.
  const before = new Map<number, { x: number; y: number }>()
  for (const item of next) before.set(item.id, { x: item.x, y: item.y })

  for (const mover of movers) {
    const id = mover.id
    if (moved.has(id) || removed.has(id)) continue
    // `cantmove` (still / level-hold pin / locked dir) blocks the move but
    // not the turn: official `updatedir` still aims the unit at the input.
    const moverItem = byId.get(id)
    if (
      pinnedIds.has(id) ||
      stillIds.has(id) ||
      (moverItem && isLockedFor(moverItem, direction))
    ) {
      if (moverItem && moverItem.dir !== direction) {
        moverItem.dir = direction
        status.anyMoved = true
      }
      continue
    }
    if (!engine.canMoveRoot(id)) {
      const item = byId.get(id)
      // A blocked `weak` mover shatters on contact — but a blocked faller
      // simply lands (official `fallblock` has no weak-mover crash).
      if (item && weakIds.has(id) && !isMovePhase && !fallMode) {
        removed.add(item.id)
        removedItems.push(item)
        status.anyMoved = true
      }
      continue
    }

    engine.doMove(id)
  }

  for (const swap of emptySwaps) {
    const item = byId.get(swap.id)
    if (!item || removed.has(swap.id)) continue
    if (item.x === swap.x && item.y === swap.y) continue
    item.x = swap.x
    item.y = swap.y
    moved.add(swap.id)
    status.anyMoved = true
  }

  if (carryHeldRiders(before, next, removed, width, height, stillIds))
    status.anyMoved = true

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
