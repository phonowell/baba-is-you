import { keyForLayer } from '../helpers.js'

import { hasProp } from './shared.js'

import type { Item } from '../types.js'

export { applyFall, applyMoveAdjective, applyShift } from './phases-movement.js'

export const applyMore = (
  items: Item[],
  width: number,
  height: number,
): {
  items: Item[]
  changed: boolean
} => {
  const sources = items.filter(
    (item) => hasProp(item, 'more') && !hasProp(item, 'sleep'),
  )
  if (!sources.length) return { items, changed: false }

  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const occupied = new Set<number>()
  for (const item of items)
    occupied.add(keyForLayer(item.x, item.y, width, hasProp(item, 'float')))

  const spawned: Item[] = []
  const deltas: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]

  for (const source of sources) {
    const floating = hasProp(source, 'float')
    for (const [dx, dy] of deltas) {
      const nx = source.x + dx
      const ny = source.y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const key = keyForLayer(nx, ny, width, floating)
      if (occupied.has(key)) continue
      occupied.add(key)
      spawned.push({
        ...source,
        id: nextId++,
        x: nx,
        y: ny,
        props: [],
      })
    }
  }

  if (!spawned.length) return { items, changed: false }
  return {
    items: [...items, ...spawned],
    changed: true,
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
