import {
  appendMovementSpawns,
  createEatsPredicates,
  createEmptyPropLookup,
  createFrozenPassState,
  isLockedFor,
  openMovementSets,
} from './move-core.js'
import { createSingleMoveRuntime } from './move-single-runtime.js'
import { buildGrid, carryHeldRiders, hasYouLikeProp, MOVE_DELTAS } from './shared.js'
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
  const { emptyPropsByCell, emptyPropsAt } = createEmptyPropLookup(
    rules,
    items,
    width,
    height,
    runtime.context,
  )
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
    hasYouLikeProp(props)
  const emptyYou =
    !isMovePhase &&
    !fallMode &&
    Array.from(emptyPropsByCell.values()).some(emptyMovesYou)
  if (!items.some(isMover) && !emptyYou) return { items, moved: false }

  const next = items.map((item) => ({ ...item }))
  const sets = openMovementSets(
    runtime.buckets.level,
    runtime.context,
    next,
    width,
    height,
    isMover,
  )
  const {
    byId,
    hasHolder,
    moverIds,
    movers,
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

  const moved = new Set<number>()
  const removed = new Set<number>()
  const removedItems: Item[] = []
  // Empty pseudo-units destroyed by entry specials (eat/lock/weak) — each
  // drops its `empty has x` contents after the pass.
  const deadEmptyCells = new Set<number>()
  const status = { anyMoved: false }
  const grid = buildGrid(next, width)
  const { eats, eatsEmpty } = createEatsPredicates(
    runtime.buckets.eat,
    runtime.context,
    emptyPropsAt,
  )
  const engineContext = {
    byId,
    deadEmptyCells,
    eats,
    eatsEmpty,
    emptyPropsAt,
    grid,
    height,
    moverIds,
    moved,
    ...createFrozenPassState(),
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
  }
  const engine = createSingleMoveRuntime(
    engineContext,
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

  // Official mover order is unitid order — `findall` walks `unitlists`
  // in creation order, and each mover's movelist drains before the next
  // is checked, so a front same-direction mover vacates its cell for a
  // trailing mover to follow into.
  movers.sort((a, b) => a.id - b.id)

  // `hold` carrying needs each entity's pre-move seat — snapshot before
  // the mover loop mutates positions (only when a holder exists).
  const before = new Map<number, { x: number; y: number }>()
  if (hasHolder)
    for (const item of next) before.set(item.id, { x: item.x, y: item.y })

  // Official movement is a multi-pass state machine: a mover whose check
  // fails retires for the pass but retries after later movers resolve —
  // e.g. a fruit held by a shut door advances once a trailing mover's
  // push annihilates the door. Loop to a fixpoint; a `weak` mover that
  // still cannot move after the dust settles shatters on contact.
  //
  // Each pass emulates one official take iteration: the board is frozen
  // for checks (`passMoved`/`passDeparted`), deferred specials drain at
  // pass end, and a mover whose front cell needs a push only defers —
  // officially it advances to state 1 and pushes next iteration.
  let weakCrash: number[] = []
  let progress = true
  let pass = 0
  while (progress) {
    progress = false
    engineContext.movePass = pass
    pass += 1
    engineContext.passMoved.clear()
    engineContext.passDeparted.clear()
    engineContext.passOrigins.clear()
    engineContext.pushQueued.clear()
    engineContext.deferredIds.clear()
    for (const mover of movers) {
      const id = mover.id
      // A removed mover keeps its queue entry: the corpse still runs its
      // check (push/pull side-effects apply) but never lands itself.
      if (moved.has(id)) continue
      // `cantmove` (still / level-hold pin / locked dir) blocks the move
      // but not the turn: official `updatedir` still aims the unit at the
      // input.
      const moverItem = byId.get(id)
      if (
        pinnedIds.has(id) ||
        stillIds.has(id) ||
        (moverItem && isLockedFor(moverItem, direction))
      ) {
        if (!fallMode && moverItem && moverItem.dir !== direction) {
          moverItem.dir = direction
          status.anyMoved = true
        }
        continue
      }
      if (!engine.canMoveRoot(id)) {
        const item = byId.get(id)
        // A blocked `weak` mover shatters — deferred until a pass makes
        // no progress so a freed cell still admits it first. A mover
        // that only deferred its push is still live, not crashed.
        if (
          item && weakIds.has(id) && !isMovePhase && !fallMode &&
          !engineContext.deferredIds.has(id)
        ) weakCrash.push(id)
        continue
      }

      engine.doMove(id)
      progress = true
    }

    // Drain deferred lock/eat specials — official drain happens at the
    // end of each take iteration; a kill can free cells for movers that
    // failed this pass, so a firing forces another round.
    if (engine.drainSpecials()) progress = true
    // A deferred push means a mover is still live (official state 1)
    // even though nothing moved — keep iterating so it resolves.
    if (engineContext.deferredIds.size) progress = true
    // `weak` shatters only once a pass produced nothing at all — pushes
    // resolved, specials drained, no deferrals pending (officially the
    // crash fires at state ≥ 4, after every retry is exhausted).
    if (!progress && weakCrash.length) {
      let crashed = false
      for (const id of weakCrash) {
        if (moved.has(id) || removed.has(id)) continue
        const item = byId.get(id)
        if (!item) continue
        removed.add(id)
        removedItems.push(item)
        status.anyMoved = true
        crashed = true
      }
      weakCrash = []
      // The removals may have freed cells for other movers — run the
      // pass once more before declaring the fixpoint.
      progress = crashed
    }
    weakCrash = []
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

  if (
    hasHolder &&
    carryHeldRiders(before, next, removed, width, height, stillIds)
  )
    status.anyMoved = true

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

  return { items: dropped.items, moved: status.anyMoved || dropped.changed }
}
