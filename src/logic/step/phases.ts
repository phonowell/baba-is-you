import { keyForLayer } from '../helpers.js'

import { hasProp } from './shared.js'

import type { Item } from '../types.js'

export {
  applyBack,
  applyFall,
  applyMoveAdjective,
  applyShift,
} from './phases-movement.js'

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

const FACING_PROPS = new Set(['up', 'down', 'left', 'right'])

const ROTATE_CW: Record<string, 'up' | 'right' | 'down' | 'left'> = {
  up: 'right',
  right: 'down',
  down: 'left',
  left: 'up',
}

export const applyDirectionalFacing = (
  items: Item[],
): {
  items: Item[]
  changed: boolean
} => {
  // Most boards carry no facing or rotation rules at all — skip the map.
  if (
    !items.some((item) =>
      item.props.some(
        (prop) => FACING_PROPS.has(prop) || prop === 'turn' || prop === 'deturn',
      ),
    )
  )
    return { items, changed: false }

  let changed = false
  const next = items.map((item) => {
    let { dir } = item
    // `turn`/`deturn` rotate the facing a quarter turn each step —
    // clockwise and counter-clockwise respectively.
    if (hasProp(item, 'turn')) dir = ROTATE_CW[dir ?? 'right'] ?? dir
    if (hasProp(item, 'deturn')) {
      const cw = dir ?? 'right'
      dir = ROTATE_CW[ROTATE_CW[ROTATE_CW[cw] ?? cw] ?? cw] ?? cw
    }
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
