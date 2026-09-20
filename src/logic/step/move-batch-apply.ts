import {
  getLiveCellItems,
  isLockCollision,
  moveOne,
  removeOne,
} from './move-core.js'
import { MOVE_DELTAS } from './shared.js'

import type { Arrow, BatchMoveContext } from './move-batch-runtime.js'
import type { Item } from '../types.js'

const arrowDelta = (
  arrow: Arrow,
): { dx: number; dy: number } => {
  const [dx, dy] = MOVE_DELTAS[arrow.dir]
  return { dx, dy }
}

export const applyBatchMovement = (
  context: BatchMoveContext,
  arrows: Map<number, Arrow>,
): void => {
  const movingIds: number[] = []
  const swapIds = new Set<number>()
  for (const [id, arrow] of arrows.entries()) {
    if (arrow.status !== 'moving') continue
    if (context.removed.has(id)) continue
    movingIds.push(id)
    if (context.swapIds.has(id)) swapIds.add(id)
  }

  // Plain movers go first so swap movers see the settled destination
  // cell — a target that vacated under its own arrow must not be dragged
  // back into the mover's old cell.
  const ordered = [
    ...movingIds.filter((id) => !swapIds.has(id)),
    ...movingIds.filter((id) => swapIds.has(id)),
  ]

  for (const id of ordered) {
    const item = context.byId.get(id)
    const arrow = arrows.get(id)
    if (!item || !arrow) continue

    if (item.dir !== arrow.dir) {
      item.dir = arrow.dir
      context.status.changed = true
    }

    const { dx, dy } = arrowDelta(arrow)
    const oldX = item.x
    const oldY = item.y
    const nx = item.x + dx
    const ny = item.y + dy

    // Official `lock` specials resolve before the position update:
    // unsafe `open`/`shut` partners die at their own cell and an unsafe
    // mover dies at its ORIGIN (`gone` skips the update), so `x has y`
    // drops land on the departure cell rather than the destination.
    const lockTargets = getLiveCellItems(context, nx, ny).filter(
      (target): target is Item =>
        target.id !== id && isLockCollision(context, item, target),
    )
    for (const target of lockTargets)
      if (removeOne(context, target)) context.status.changed = true
    if (lockTargets.length && removeOne(context, item)) {
      context.status.changed = true
      continue
    }

    if (!moveOne(context, item, nx, ny)) continue
    context.status.changed = true

    // `x eat y` specials fire when the move lands: whatever the mover
    // stepped onto is consumed before swap displaces other occupants.
    for (const target of getLiveCellItems(context, nx, ny)) {
      if (target.id === id) continue
      if (context.eats(item, target)) {
        if (removeOne(context, target)) context.status.changed = true
      }
    }

    if (!swapIds.has(id)) {
      // Target-side swap (official `findfeatureat` at the destination):
      // a `x is swap` unit trades places with whatever walks in — the
      // mover doesn't need swap itself.
      const swappees = getLiveCellItems(context, nx, ny).filter(
        (target): target is Item =>
          target.id !== id &&
          context.swapIds.has(target.id) &&
          !context.phantomIds.has(target.id) &&
          !context.weakIds.has(target.id) &&
          arrows.get(target.id)?.status !== 'moving',
      )
      for (const target of swappees) {
        if (moveOne(context, target, oldX, oldY))
          context.status.changed = true
      }
      continue
    }
    // Swap: every unit still sharing the destination cell (that isn't
    // moving itself this batch, and can be displaced at all) is carried
    // back to the mover's origin.
    const cellMates = getLiveCellItems(context, nx, ny).filter(
      (target): target is Item =>
        target.id !== id &&
        !context.phantomIds.has(target.id) &&
        !context.weakIds.has(target.id) &&
        !context.stillIds.has(target.id) &&
        !context.pinnedIds.has(target.id) &&
        arrows.get(target.id)?.status !== 'moving',
    )
    for (const target of cellMates) {
      if (moveOne(context, target, oldX, oldY))
        context.status.changed = true
    }
  }
}
