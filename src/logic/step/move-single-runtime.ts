import {
  getLiveCellItems,
  inBounds,
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
  doMove: (id: number) => void
} => {
  const [dx, dy] = MOVE_DELTAS[direction]

  const isMoveEntity = (id: number): boolean =>
    isMovePhase && context.moverIds.has(id)

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)

    const item = context.byId.get(id)
    if (!item) return false

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
    for (const target of targets) {
      if (context.weakIds.has(target.id)) continue

      const pushable = context.pushIds.has(target.id)
      const swappable = context.swapIds.has(target.id) && !pushable
      const blockingStop =
        context.stopIds.has(target.id) && !pushable && !swappable
      const blockingPull =
        context.pullIds.has(target.id) && !pushable && !swappable
      if (blockingStop || blockingPull) return false
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

    const pushTargets = frontTargets.filter((target) =>
      context.pushIds.has(target.id),
    )
    const swapTargets = throughEmptyPush
      ? []
      : frontTargets.filter(
      (target) =>
        !context.pushIds.has(target.id) && context.swapIds.has(target.id),
    )

    const behindX = oldX - dx
    const behindY = oldY - dy
    const pullTargets = getLiveCellItems(context, behindX, behindY).filter(
      (target) => context.pullIds.has(target.id),
    )

    for (const target of pushTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      if (!canMove(target.id, new Set())) {
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
        if (!canMove(target.id, new Set())) continue
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
      if (!canMove(target.id, new Set())) continue
      doMove(target.id)
    }
  }

  return { canMove, doMove }
}
