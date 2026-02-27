import {
  getLiveCellItems,
  inBounds,
  isOpenShutPair,
  removeOne,
} from './move-core.js'
import { MOVE_DELTAS, reverseDirection } from './shared.js'

import type { MoveCoreContext } from './move-core.js'
import type { Direction } from '../types.js'

type ArrowStatus = 'pending' | 'moving' | 'stopped'

export type Arrow = {
  dir: Direction
  flipped: boolean
  isMove: boolean
  status: ArrowStatus
}

export type BatchMoveContext = MoveCoreContext & {
  emptyPush: boolean
  emptyStop: boolean
  status: { changed: boolean }
}

export const resolveBatchArrows = (
  context: BatchMoveContext,
  movers: Array<{ id: number; dir: Direction; isMove: boolean }>,
): Map<number, Arrow> => {
  const arrows = new Map<number, Arrow>()
  const queue: number[] = []

  const addArrow = (id: number, dir: Direction, isMove: boolean): void => {
    if (context.removed.has(id) || arrows.has(id)) return
    arrows.set(id, {
      dir,
      flipped: false,
      isMove,
      status: 'pending',
    })
    queue.push(id)
  }

  for (const mover of movers) addArrow(mover.id, mover.dir, mover.isMove)

  while (queue.length) {
    const id = queue.shift()
    if (id === undefined || context.removed.has(id)) continue

    const arrow = arrows.get(id)
    if (arrow?.status !== 'pending') continue

    const item = context.byId.get(id)
    if (!item) continue

    const [dx, dy] = MOVE_DELTAS[arrow.dir]
    const nx = item.x + dx
    const ny = item.y + dy

    let blocked = !inBounds(context, nx, ny)
    let defer = false
    let throughEmptyPush = false
    let targets = blocked ? [] : getLiveCellItems(context, nx, ny)

    if (!blocked) {
      if (!targets.length) {
        if (!context.emptyPush) blocked = context.emptyStop
        else {
          throughEmptyPush = true
          let lookX = nx
          let lookY = ny
          while (true) {
            lookX += dx
            lookY += dy
            if (!inBounds(context, lookX, lookY)) {
              blocked = true
              break
            }
            targets = getLiveCellItems(context, lookX, lookY)
            if (targets.length) break
          }
        }
      }

      if (!blocked) {
        let pushed = false
        for (const target of targets) {
          if (!context.pushIds.has(target.id)) continue
          if (arrows.has(target.id)) continue
          addArrow(target.id, arrow.dir, false)
          pushed = true
        }
        if (pushed) {
          queue.push(id)
          continue
        }
      }

      for (const target of targets) {
        if (!throughEmptyPush && isOpenShutPair(context, item, target)) {
          if (removeOne(context, item)) context.status.changed = true
          if (removeOne(context, target)) context.status.changed = true
          continue
        }

        const stop = context.stopIds.has(target.id)
        const push = context.pushIds.has(target.id)
        const pull = context.pullIds.has(target.id)
        const weak = context.weakIds.has(target.id)
        if (weak || blocked || (!push && !stop && !pull)) continue

        const targetArrow = arrows.get(target.id)
        if (targetArrow?.dir === arrow.dir) {
          if (targetArrow.status === 'moving') continue
          if (targetArrow.status === 'stopped') {
            blocked = true
            continue
          }
          defer = true
          continue
        }

        if (stop || pull) blocked = true
      }
    }

    if (blocked) {
      if (context.weakIds.has(id) && !arrow.isMove) {
        if (removeOne(context, item)) context.status.changed = true
        continue
      }

      if (arrow.isMove && !arrow.flipped) {
        arrow.dir = reverseDirection(arrow.dir)
        arrow.flipped = true
        queue.push(id)
        continue
      }

      arrow.status = 'stopped'
      continue
    }

    if (defer) {
      queue.push(id)
      continue
    }

    const [bx, by] = MOVE_DELTAS[reverseDirection(arrow.dir)]
    const px = item.x + bx
    const py = item.y + by
    if (inBounds(context, px, py)) {
      const behind = getLiveCellItems(context, px, py)
      for (const target of behind) {
        if (!context.pullIds.has(target.id)) continue
        addArrow(target.id, arrow.dir, false)
      }
    }

    arrow.status = 'moving'
  }

  return arrows
}
