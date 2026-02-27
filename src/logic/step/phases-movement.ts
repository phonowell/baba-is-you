import { keyFor } from '../helpers.js'

import { moveItemsBatch } from './move-batch.js'
import { buildGrid, hasProp } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item, Rule } from '../types.js'

export const applyMoveAdjective = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; moved: boolean } => {
  const movers = items
    .filter((item) => hasProp(item, 'move') && !hasProp(item, 'sleep'))
    .map((item) => ({
      id: item.id,
      dir: item.dir ?? 'right',
      isMove: true,
    }))

  if (!movers.length) return { items, moved: false }
  return moveItemsBatch(items, runtime, movers)
}

export const applyFall = (
  items: Item[],
  width: number,
  height: number,
  _rules: Rule[],
): { items: Item[]; moved: boolean } => {
  const fallers = items.filter(
    (item) => hasProp(item, 'fall') && !hasProp(item, 'sleep'),
  )
  if (!fallers.length) return { items, moved: false }

  const next = items.map((item) => ({ ...item }))
  const byId = new Map<number, Item>()
  const byCell = new Map<number, Item[]>()
  const addCell = (item: Item): void => {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    list.push(item)
    byCell.set(key, list)
  }
  const removeCell = (item: Item): void => {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    byCell.set(
      key,
      list.filter((candidate) => candidate.id !== item.id),
    )
  }

  for (const item of next) {
    byId.set(item.id, item)
    addCell(item)
  }

  let moved = false
  const sortedFallers = [...fallers].sort((a, b) =>
    a.y === b.y ? a.id - b.id : b.y - a.y,
  )

  for (const source of sortedFallers) {
    const live = byId.get(source.id)
    if (!live) continue

    while (live.y + 1 < height) {
      const nextKey = keyFor(live.x, live.y + 1, width)
      const blocking = byCell.get(nextKey) ?? []
      if (blocking.length) break

      removeCell(live)
      live.y += 1
      addCell(live)
      moved = true
    }
  }

  return { items: next, moved }
}

export const applyShift = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; moved: boolean } => {
  const { width } = runtime
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
        if (hasProp(live, 'sleep')) continue

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

  const shiftedResult = moveItemsBatch(shiftedItems, runtime, movers)
  return {
    items: shiftedResult.items,
    moved: shiftedResult.moved || facingChanged,
  }
}
