import { keyFor, MOVE_DELTAS, reverseDirection } from './shared.js'

import type { Direction, Item } from '../types.js'

type ArrowStatus = 'pending' | 'moving' | 'stopped'

export type Arrow = {
  dir: Direction
  flipped: boolean
  isMove: boolean
  status: ArrowStatus
}

export type BatchMoveContext = {
  byId: Map<number, Item>
  grid: Map<number, Item[]>
  height: number
  openIds: Set<number>
  pullIds: Set<number>
  pushIds: Set<number>
  removed: Set<number>
  removedItems: Item[]
  shutIds: Set<number>
  status: { changed: boolean }
  stopIds: Set<number>
  weakIds: Set<number>
  width: number
}

const isOpenShutPair = (context: BatchMoveContext, a: Item, b: Item): boolean =>
  (context.openIds.has(a.id) && context.shutIds.has(b.id)) ||
  (context.shutIds.has(a.id) && context.openIds.has(b.id))

const inBounds = (context: BatchMoveContext, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < context.width && y < context.height

const removeOne = (context: BatchMoveContext, item: Item): void => {
  if (context.removed.has(item.id)) return
  context.removed.add(item.id)
  context.removedItems.push(item)
  context.byId.delete(item.id)
  context.status.changed = true

  const key = keyFor(item.x, item.y, context.width)
  const list = context.grid.get(key) ?? []
  context.grid.set(
    key,
    list.filter((other) => other.id !== item.id),
  )
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

    if (inBounds(context, nx, ny)) {
      const targetKey = keyFor(nx, ny, context.width)
      const targets = context.grid.get(targetKey) ?? []
      let pushed = false
      for (const target of targets) {
        if (context.removed.has(target.id)) continue
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

    let blocked = !inBounds(context, nx, ny)
    let defer = false

    if (!blocked) {
      const targetKey = keyFor(nx, ny, context.width)
      const targets = context.grid.get(targetKey) ?? []

      for (const target of targets) {
        if (context.removed.has(target.id)) continue
        if (isOpenShutPair(context, item, target)) {
          removeOne(context, item)
          removeOne(context, target)
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
        removeOne(context, item)
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
      const pullKey = keyFor(px, py, context.width)
      const behind = context.grid.get(pullKey) ?? []
      for (const target of behind) {
        if (context.removed.has(target.id)) continue
        if (!context.pullIds.has(target.id)) continue
        addArrow(target.id, arrow.dir, false)
      }
    }

    arrow.status = 'moving'
  }

  return arrows
}
