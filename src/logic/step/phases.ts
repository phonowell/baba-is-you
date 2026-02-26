import { moveItemsBatch } from './move-batch.js'
import { buildGrid, hasProp } from './shared.js'

import type { Direction, Item, Rule } from '../types.js'

export const applyMoveAdjective = (
  items: Item[],
  width: number,
  height: number,
  rules: Rule[],
): { items: Item[]; moved: boolean } => {
  const movers = items
    .filter((item) => hasProp(item, 'move'))
    .map((item) => ({
      id: item.id,
      dir: item.dir ?? 'right',
      isMove: true,
    }))

  if (!movers.length) return { items, moved: false }
  return moveItemsBatch(items, width, height, rules, movers)
}

export const applyShift = (
  items: Item[],
  width: number,
  height: number,
  rules: Rule[],
): { items: Item[]; moved: boolean } => {
  const shiftedItems = items.map((item) => ({ ...item }))
  const byCell = buildGrid(shiftedItems, width)
  const byId = new Map<number, Item>()
  for (const item of shiftedItems) byId.set(item.id, item)

  const movers: Array<{ id: number; dir: Direction; isMove: boolean }> = []
  let facingChanged = false

  for (const cellItems of byCell.values()) {
    const shifts = cellItems.filter((item) => hasProp(item, 'shift'))
    if (!shifts.length) continue

    const firstShift = shifts[0]
    if (!firstShift) continue

    for (let n = 0; n < shifts.length; n += 1) {
      const shift = shifts[n]
      if (!shift) continue

      const shiftLive = byId.get(shift.id)
      if (!shiftLive) continue
      const direction = shiftLive.dir ?? 'right'

      for (const item of cellItems) {
        if (item.id === shift.id) continue
        if (n > 0 && item.id !== firstShift.id) continue

        const live = byId.get(item.id)
        if (!live) continue

        if (live.dir !== direction) {
          live.dir = direction
          facingChanged = true
        }

        movers.push({
          id: item.id,
          dir: direction,
          isMove: false,
        })
      }
    }
  }

  if (!movers.length) return { items, moved: false }

  const shiftedResult = moveItemsBatch(
    shiftedItems,
    width,
    height,
    rules,
    movers,
  )
  return {
    items: shiftedResult.items,
    moved: shiftedResult.moved || facingChanged,
  }
}

export const applyDirectionalFacing = (
  items: Item[],
): {
  items: Item[]
  changed: boolean
} => {
  let changed = false
  const next = items.map((item) => {
    let { dir } = item
    if (hasProp(item, 'up')) dir = 'up'
    if (hasProp(item, 'down')) dir = 'down'
    if (hasProp(item, 'left')) dir = 'left'
    if (hasProp(item, 'right')) dir = 'right'
    if (dir === item.dir) return item
    changed = true
    if (!dir) {
      const { dir: _dir, ...rest } = item
      return rest
    }
    return { ...item, dir }
  })

  return { items: next, changed }
}
