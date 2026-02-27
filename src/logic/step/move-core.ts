import { keyFor } from './shared.js'

import type { Item } from '../types.js'

export type MoveCoreContext = {
  byId: Map<number, Item>
  grid: Map<number, Item[]>
  height: number
  openIds: Set<number>
  pullIds: Set<number>
  pushIds: Set<number>
  removed: Set<number>
  removedItems: Item[]
  shutIds: Set<number>
  stopIds: Set<number>
  weakIds: Set<number>
  width: number
}

export const inBounds = (
  context: MoveCoreContext,
  x: number,
  y: number,
): boolean => x >= 0 && y >= 0 && x < context.width && y < context.height

export const isOpenShutPair = (
  context: MoveCoreContext,
  a: Item,
  b: Item,
): boolean =>
  (context.openIds.has(a.id) && context.shutIds.has(b.id)) ||
  (context.shutIds.has(a.id) && context.openIds.has(b.id))

export const removeOne = (context: MoveCoreContext, item: Item): boolean => {
  if (context.removed.has(item.id)) return false
  context.removed.add(item.id)
  context.removedItems.push(item)
  context.byId.delete(item.id)

  const cellKey = keyFor(item.x, item.y, context.width)
  const cellItems = context.grid.get(cellKey) ?? []
  context.grid.set(
    cellKey,
    cellItems.filter((other) => other.id !== item.id),
  )
  return true
}

export const moveOne = (
  context: MoveCoreContext,
  item: Item,
  nx: number,
  ny: number,
): boolean => {
  if (item.x === nx && item.y === ny) return false

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
  return true
}

export const getLiveCellItems = (
  context: MoveCoreContext,
  x: number,
  y: number,
): Item[] => {
  if (!inBounds(context, x, y)) return []
  return (context.grid.get(keyFor(x, y, context.width)) ?? []).filter(
    (target) => !context.removed.has(target.id),
  )
}
