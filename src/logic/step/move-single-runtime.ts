import {
  getLiveCellItems,
  inBounds,
  isLockedFor,
  isLockCollision,
  LOCKED_PROPS,
  moveOne,
  removeOne,
} from './move-core.js'
import { hasProp, MOVE_DELTAS } from './shared.js'

import type { MoveCoreContext } from './move-core.js'
import type { Direction, Item } from '../types.js'

export type SingleMoveContext = MoveCoreContext & {
  // Per-cell `empty is <prop>` resolution: every empty cell is its own
  // pseudo-unit (official unitid 2), so conditional rules like
  // `empty near water is push` only apply where the condition holds.
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>
  moved: Set<number>
  moverIds: Set<number>
  status: { anyMoved: boolean }
  swapIds: Set<number>
}

export const createSingleMoveRuntime = (
  context: SingleMoveContext,
  direction: Direction,
  isMovePhase: boolean,
): {
  canMove: (id: number, visiting: Set<number>) => boolean
  canMoveRoot: (id: number) => boolean
  doMove: (id: number) => void
} => {
  const [dx, dy] = MOVE_DELTAS[direction]

  // Official `canmove` empty branch: `still`/`locked<dir>` cancels
  // `swap` first; a cell with no remaining push/swap is enterable unless
  // `stop`/`pull` walls it off, while a still `push`/`swap` empty can't
  // be displaced and blocks outright.
  const emptyBlocked = (x: number, y: number): boolean => {
    const props = context.emptyPropsAt(x, y)
    const estill = props.has('still') || props.has(LOCKED_PROPS[direction])
    const eswap = props.has('swap') && !estill
    if (!props.has('push') && !eswap)
      return props.has('pull') || props.has('stop')
    return estill
  }

  // A pushable empty forwards the push: the chain ends on the first
  // non-push empty (the pushed emptiness lands there), on real units
  // (which become the push targets), or on the board edge (blocked).
  const emptyForwardsPush = (x: number, y: number): boolean => {
    const props = context.emptyPropsAt(x, y)
    return (
      props.has('push') &&
      !props.has('swap') &&
      !props.has('still') &&
      !props.has(LOCKED_PROPS[direction])
    )
  }

  const isMoveEntity = (id: number): boolean =>
    isMovePhase && context.moverIds.has(id)

  // Root-level `canMove` checks each want a fresh visiting set; one scratch
  // set cleared per call replaces the per-call allocation (the recursion
  // is synchronous, so sharing is safe).
  const visitingScratch = new Set<number>()
  const canMoveRoot = (id: number): boolean => {
    visitingScratch.clear()
    return canMove(id, visitingScratch)
  }

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)

    const item = context.byId.get(id)
    if (!item) return false
    if (isLockedFor(item, direction)) return false

    const nx = item.x + dx
    const ny = item.y + dy
    if (!inBounds(context, nx, ny)) return false

    let throughEmptyPush = false
    let targets = getLiveCellItems(context, nx, ny)
    if (!targets.length) {
      // `x eat empty` frees the cell outright (official `valid=false`
      // skips the whole empty-block verdict).
      if (context.eatsEmpty(item, nx, ny)) return true
      // Swapping with an empty is a plain step in; a pushable empty
      // forwards the push until the chain lands somewhere.
      if (context.emptyPropsAt(nx, ny).has('swap') && !emptyBlocked(nx, ny))
        return true
      if (emptyBlocked(nx, ny)) return false

      let lookX = nx
      let lookY = ny
      while (emptyForwardsPush(lookX, lookY)) {
        lookX += dx
        lookY += dy
        if (!inBounds(context, lookX, lookY)) return false
        targets = getLiveCellItems(context, lookX, lookY)
        if (targets.length) {
          throughEmptyPush = true
          break
        }
        if (emptyBlocked(lookX, lookY)) return false
      }
    }

    const pushTargets: Item[] = []
    // `x is swap` works both ways: the mover itself carrying swap trades
    // places with whatever it walks into. Officially every obstacle
    // contributes result 0 for a swap mover — nothing blocks it; `still`
    // targets simply stay behind (no swap, no block).
    const moverSwap = !throughEmptyPush && context.swapIds.has(item.id)
    for (const target of targets) {
      // Phantom units are ghosts for collision purposes — movers pass
      // through them with no push/pull/stop interaction at all.
      if (context.phantomIds.has(target.id)) continue
      const sameLayer =
        hasProp(item, 'float') === hasProp(target, 'float')
      // Official special order: `lock` (open/shut) then `eat` — both set
      // `valid=false`, so a consumed target never blocks, not even with
      // `stop`/`pull`/`still`. Removal happens in `doMove` on success.
      if (
        !throughEmptyPush &&
        isLockCollision(context, item, target)
      )
        continue
      if (context.eats(item, target)) continue

      if (moverSwap) continue

      // `weak` on the same float layer never counts as a solid blocker
      // (it dies on contact instead), but `weak`+`push` still pushes —
      // the official guard only skips the result-1 branch.
      const weakShatters = context.weakIds.has(target.id) && sameLayer

      // Official `cantmove` on the target (still / level-hold pin /
      // locked<dir>) nils `push` and `pull` into `stop` and cancels
      // `swap` — a bare `still` unit does not block entry at all.
      const cantMove =
        context.stillIds.has(target.id) ||
        isLockedFor(target, direction)
      const pushable =
        context.pushIds.has(target.id) && !cantMove
      const pullable =
        context.pullIds.has(target.id) && !cantMove
      const swappable =
        context.swapIds.has(target.id) && !cantMove
      const stopLike =
        context.stopIds.has(target.id) ||
        (cantMove &&
          (hasProp(target, 'push') || hasProp(target, 'pull')))
      if (
        !swappable &&
        !pushable &&
        (stopLike || pullable) &&
        !weakShatters
      ) {
        // A blocker that is itself a mover this phase (e.g. WALL IS YOU
        // plus WALL IS STOP) only blocks if it cannot vacate its cell —
        // the predecessor defers to the blocker's own pending arrow.
        if (context.moverIds.has(target.id)) {
          if (!canMove(target.id, visiting)) return false
          continue
        }
        return false
      }
      if (pushable) pushTargets.push(target)
    }

    for (const target of pushTargets) {
      if (canMove(target.id, visiting)) continue
      if (context.weakIds.has(target.id) && !isMoveEntity(target.id)) continue
      return false
    }

    return true
  }

  const doMove = (id: number): void => {
    if (context.moved.has(id) || context.removed.has(id)) return

    const item = context.byId.get(id)
    if (!item) return

    const oldX = item.x
    const oldY = item.y
    const nx = item.x + dx
    const ny = item.y + dy

    let throughEmptyPush = false
    let frontTargets = getLiveCellItems(context, nx, ny)
    if (!frontTargets.length) {
      let lookX = nx
      let lookY = ny
      while (emptyForwardsPush(lookX, lookY)) {
        lookX += dx
        lookY += dy
        if (!inBounds(context, lookX, lookY)) break
        frontTargets = getLiveCellItems(context, lookX, lookY)
        if (frontTargets.length) {
          throughEmptyPush = true
          break
        }
      }
    }

    const moverSwap = !throughEmptyPush && context.swapIds.has(item.id)
    // Eaten and unlocked targets contribute result 0 — they are consumed
    // where they stand, never pushed onward.
    const pushTargets = moverSwap
      ? []
      : frontTargets.filter(
          (target) =>
            context.pushIds.has(target.id) &&
            !context.swapIds.has(target.id) &&
            !context.eats(item, target) &&
            !isLockCollision(context, item, target),
        )
    const swapTargets = throughEmptyPush
      ? []
      : frontTargets.filter(
          (target) =>
            !context.phantomIds.has(target.id) &&
            !context.weakIds.has(target.id) &&
            !context.eats(item, target) &&
            !isLockCollision(context, item, target) &&
            (moverSwap
              ? !context.stillIds.has(target.id)
              : context.swapIds.has(target.id)),
        )

    const behindX = oldX - dx
    const behindY = oldY - dy
    const pullTargets = getLiveCellItems(context, behindX, behindY).filter(
      (target) => context.pullIds.has(target.id),
    )

    for (const target of pushTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      if (!canMoveRoot(target.id)) {
        if (context.weakIds.has(target.id) && !isMoveEntity(target.id))
          if (removeOne(context, target)) context.status.anyMoved = true

        continue
      }
      doMove(target.id)
    }

    const openShutTargets = throughEmptyPush
      ? []
      : getLiveCellItems(context, nx, ny).filter((target) =>
          isLockCollision(context, item, target),
        )

    if (openShutTargets.length) {
      // Official lock: an unsafe mover dies at its origin (`gone` skips
      // the position update); a `safe` mover survives and still lands.
      if (removeOne(context, item)) {
        context.moved.add(item.id)
        context.status.anyMoved = true
      } else if (moveOne(context, item, nx, ny)) {
        context.moved.add(item.id)
        context.status.anyMoved = true
      }

      for (const target of openShutTargets)
        if (removeOne(context, target)) context.status.anyMoved = true

      for (const target of pullTargets) {
        if (context.moved.has(target.id) || context.removed.has(target.id))
          continue
        if (!canMoveRoot(target.id)) continue
        doMove(target.id)
      }

      return
    }

    if (item.dir !== direction) item.dir = direction
    if (moveOne(context, item, nx, ny)) {
      context.moved.add(item.id)
      context.status.anyMoved = true

      // `x eat y` specials: whatever the mover stepped onto is consumed.
      for (const target of getLiveCellItems(context, nx, ny)) {
        if (target.id === item.id || !context.eats(item, target)) continue
        if (removeOne(context, target)) context.status.anyMoved = true
      }
    }

    for (const target of swapTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      const targetLive = context.byId.get(target.id)
      if (!targetLive) continue
      if (moveOne(context, targetLive, oldX, oldY)) {
        context.moved.add(targetLive.id)
        context.status.anyMoved = true
      }
    }

    for (const target of pullTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      if (!canMoveRoot(target.id)) continue
      doMove(target.id)
    }
  }

  return { canMove, canMoveRoot, doMove }
}
