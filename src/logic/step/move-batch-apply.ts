import { moveOne } from './move-core.js'

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

    const nx =
      arrow.dir === 'left'
        ? item.x - 1
        : arrow.dir === 'right'
          ? item.x + 1
          : item.x
    const ny =
      arrow.dir === 'up'
        ? item.y - 1
        : arrow.dir === 'down'
          ? item.y + 1
          : item.y
    if (moveOne(context, item, nx, ny)) context.status.changed = true
  }
}
