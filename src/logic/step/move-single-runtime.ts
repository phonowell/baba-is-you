import {
  getLiveCellItems,
  inBounds,
  isLockedFor,
  isOpenShutPair,
  moveOne,
  removeOne,
} from './move-core.js'
import { MOVE_DELTAS } from './shared.js'

import type { MoveCoreContext } from './move-core.js'
import type { Direction, Item } from '../types.js'

export type SingleMoveContext = MoveCoreContext & {
  emptyPush: boolean
  emptyStop: boolean
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
      if (!context.emptyPush) return !context.emptyStop

      throughEmptyPush = true
      let lookX = nx
      let lookY = ny
      while (true) {
        lookX += dx
        lookY += dy
        if (!inBounds(context, lookX, lookY)) return false
        targets = getLiveCellItems(context, lookX, lookY)
        if (targets.length) break
      }
    }

    if (
      !throughEmptyPush &&
      targets.some((target) => isOpenShutPair(context, item, target))
    )
      return true

    const pushTargets: Item[] = []
    // `x is swap` works both ways: the mover itself carrying swap trades
    // places with whatever it walks into, ignoring the target's
    // push/pull/stop entirely (but `still` units can't be displaced, so
    // the swap — and the move — fails against them).
    const moverSwap = !throughEmptyPush && context.swapIds.has(item.id)
    for (const target of targets) {
      // Phantom units are ghosts for collision purposes — movers pass
      // through them with no push/pull/stop interaction at all.
      if (context.phantomIds.has(target.id)) continue
      if (context.weakIds.has(target.id)) continue

      if (moverSwap) {
        if (!context.stillIds.has(target.id)) continue
        if (context.moverIds.has(target.id)) {
          if (!canMove(target.id, visiting)) return false
          continue
        }
        return false
      }

      // A swap target trades places instead of being pushed — swap
      // outranks push on the same object.
      const pushable = context.pushIds.has(target.id)
      const swappable = context.swapIds.has(target.id)
      const blockingStop =
        context.stopIds.has(target.id) && !pushable && !swappable
      const blockingPull =
        context.pullIds.has(target.id) && !pushable && !swappable
      // A `still` unit can't be carried by external forces — it blocks
      // like a wall unless it is vacating the cell under its own move.
      const blockingStill =
        context.stillIds.has(target.id) && !pushable && !swappable
      if (blockingStop || blockingPull || blockingStill) {
        // A blocker that is itself a mover this phase (e.g. WALL IS YOU
        // plus WALL IS STOP) only blocks if it cannot vacate its cell —
        // the predecessor defers to the blocker's own pending arrow.
        if (context.moverIds.has(target.id)) {
          if (!canMove(target.id, visiting)) return false
          continue
        }
        return false
      }
      if (pushable && !swappable) pushTargets.push(target)
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
    if (!frontTargets.length && context.emptyPush) {
      throughEmptyPush = true
      let lookX = nx
      let lookY = ny
      while (true) {
        lookX += dx
        lookY += dy
        if (!inBounds(context, lookX, lookY)) break
        frontTargets = getLiveCellItems(context, lookX, lookY)
        if (frontTargets.length) break
      }
    }

    const moverSwap = !throughEmptyPush && context.swapIds.has(item.id)
    const pushTargets = moverSwap
      ? []
      : frontTargets.filter(
          (target) =>
            context.pushIds.has(target.id) &&
            !context.swapIds.has(target.id),
        )
    const swapTargets = throughEmptyPush
      ? []
      : frontTargets.filter(
          (target) =>
            !context.phantomIds.has(target.id) &&
            !context.weakIds.has(target.id) &&
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
          isOpenShutPair(context, item, target),
        )

    if (openShutTargets.length) {
      if (removeOne(context, item)) {
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
