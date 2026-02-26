import { keyFor, MOVE_DELTAS } from './shared.js'

import type { Arrow, BatchMoveContext } from './move-batch-runtime.js'

export const applyBatchMovement = (
  context: BatchMoveContext,
  arrows: Map<number, Arrow>,
): void => {
  const movingIds: number[] = []
  for (const [id, arrow] of arrows.entries()) {
    if (arrow.status !== 'moving') continue
    if (context.removed.has(id)) continue
    movingIds.push(id)
  }

  for (const id of movingIds) {
    const item = context.byId.get(id)
    const arrow = arrows.get(id)
    if (!item || !arrow) continue

    if (item.dir !== arrow.dir) {
      item.dir = arrow.dir
      context.status.changed = true
    }

    const oldKey = keyFor(item.x, item.y, context.width)
    const oldList = context.grid.get(oldKey) ?? []
    context.grid.set(
      oldKey,
      oldList.filter((other) => other.id !== id),
    )

    const [dx, dy] = MOVE_DELTAS[arrow.dir]
    item.x += dx
    item.y += dy

    const newKey = keyFor(item.x, item.y, context.width)
    const newList = context.grid.get(newKey) ?? []
    newList.push(item)
    context.grid.set(newKey, newList)

    context.status.changed = true
  }
}
