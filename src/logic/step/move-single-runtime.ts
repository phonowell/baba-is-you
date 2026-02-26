import { keyFor, MOVE_DELTAS } from './shared.js'

import type { Direction, Item } from '../types.js'

export type SingleMoveContext = {
  byId: Map<number, Item>
  grid: Map<number, Item[]>
  height: number
  moverIds: Set<number>
  moved: Set<number>
  openIds: Set<number>
  pullIds: Set<number>
  pushIds: Set<number>
  removed: Set<number>
  removedItems: Item[]
  status: { anyMoved: boolean }
  stopIds: Set<number>
  shutIds: Set<number>
  swapIds: Set<number>
  weakIds: Set<number>
  width: number
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

  const isOpenShutPair = (a: Item, b: Item): boolean =>
    (context.openIds.has(a.id) && context.shutIds.has(b.id)) ||
    (context.shutIds.has(a.id) && context.openIds.has(b.id))

  const isMoveEntity = (id: number): boolean =>
    isMovePhase && context.moverIds.has(id)

  const removeOne = (item: Item): void => {
    if (context.removed.has(item.id)) return
    context.removed.add(item.id)
    context.removedItems.push(item)
    context.byId.delete(item.id)

    const cellKey = keyFor(item.x, item.y, context.width)
    const cellItems = context.grid.get(cellKey) ?? []
    context.grid.set(
      cellKey,
      cellItems.filter((other) => other.id !== item.id),
    )
  }

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)

    const item = context.byId.get(id)
    if (!item) return false

    const nx = item.x + dx
    const ny = item.y + dy
    if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
      return false

    const targetKey = keyFor(nx, ny, context.width)
    const targets = (context.grid.get(targetKey) ?? []).filter(
      (target) => !context.removed.has(target.id),
    )
    if (!targets.length) return true

    if (targets.some((target) => isOpenShutPair(item, target))) return true

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

  const moveOne = (item: Item, nx: number, ny: number): void => {
    const oldKey = keyFor(item.x, item.y, context.width)
    const oldList = context.grid.get(oldKey) ?? []
    context.grid.set(
      oldKey,
      oldList.filter((other) => other.id !== item.id),
    )

    item.x = nx
    item.y = ny

    const newKey = keyFor(nx, ny, context.width)
    const newList = context.grid.get(newKey) ?? []
    newList.push(item)
    context.grid.set(newKey, newList)
  }

  const doMove = (id: number): void => {
    if (context.moved.has(id) || context.removed.has(id)) return

    const item = context.byId.get(id)
    if (!item) return

    const oldX = item.x
    const oldY = item.y
    const nx = item.x + dx
    const ny = item.y + dy
    const targetKey = keyFor(nx, ny, context.width)
    const targets = [...(context.grid.get(targetKey) ?? [])]
    const pushTargets = targets.filter((target) =>
      context.pushIds.has(target.id),
    )
    const swapTargets = targets.filter(
      (target) =>
        !context.pushIds.has(target.id) && context.swapIds.has(target.id),
    )

    const behindX = oldX - dx
    const behindY = oldY - dy
    const pullTargets =
      behindX < 0 ||
      behindY < 0 ||
      behindX >= context.width ||
      behindY >= context.height
        ? []
        : [
            ...(context.grid.get(keyFor(behindX, behindY, context.width)) ??
              []),
          ].filter((target) => context.pullIds.has(target.id))

    for (const target of pushTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      if (!canMove(target.id, new Set())) {
        if (context.weakIds.has(target.id) && !isMoveEntity(target.id)) {
          removeOne(target)
          context.status.anyMoved = true
        }
        continue
      }
      doMove(target.id)
    }

    const liveTargets = [...(context.grid.get(targetKey) ?? [])].filter(
      (target) => !context.removed.has(target.id),
    )
    const openShutTargets = liveTargets.filter((target) =>
      isOpenShutPair(item, target),
    )

    if (openShutTargets.length) {
      removeOne(item)
      context.moved.add(item.id)
      context.status.anyMoved = true

      for (const target of openShutTargets) removeOne(target)

      for (const target of pullTargets) {
        if (context.moved.has(target.id) || context.removed.has(target.id))
          continue
        if (!canMove(target.id, new Set())) continue
        doMove(target.id)
      }

      return
    }

    moveOne(item, nx, ny)
    context.moved.add(item.id)
    context.status.anyMoved = true

    for (const target of swapTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      const targetLive = context.byId.get(target.id)
      if (!targetLive) continue
      moveOne(targetLive, oldX, oldY)
      context.moved.add(targetLive.id)
      context.status.anyMoved = true
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
