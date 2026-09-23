import { resolveEmptyPropsByCell } from '../empty.js'

import { hasProp, keyFor } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item } from '../types.js'

export {
  applyBack,
  applyFall,
  applyMoveAdjective,
  applyShift,
} from './phases-movement.js'

// Official `more` (blocks.lua ~1174): a neighbouring cell blocks the copy
// only when it holds the level edge, a stop/push/pull unit, or a unit with
// the same name as the source — soft units (water, hot, …) never block, so
// the copy lands on them and interactions resolve the overlap afterwards.
// Cells empty of units block via their own `empty is stop/push/pull` rules.
export const applyMore = (
  items: Item[],
  runtime: RuleRuntime,
): {
  items: Item[]
  changed: boolean
} => {
  const sources = items.filter(
    (item) => hasProp(item, 'more') && !hasProp(item, 'sleep'),
  )
  if (!sources.length) return { items, changed: false }

  const { width, height } = runtime
  const byCell = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const cell = byCell.get(key)
    if (cell) cell.push(item)
    else byCell.set(key, [item])
  }
  const emptyProps = resolveEmptyPropsByCell(
    runtime.rules,
    items,
    width,
    height,
    runtime.context,
  )

  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const spawned: Item[] = []
  const deltas: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]

  for (const source of sources) {
    for (const [dx, dy] of deltas) {
      const nx = source.x + dx
      const ny = source.y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const key = keyFor(nx, ny, width)
      const cell = byCell.get(key)
      if (cell) {
        if (
          cell.some(
            (item) =>
              item.name === source.name ||
              hasProp(item, 'stop') ||
              hasProp(item, 'push') ||
              hasProp(item, 'pull'),
          )
        )
          continue
      } else {
        const props = emptyProps.get(key)
        if (
          props?.has('stop') ||
          props?.has('push') ||
          props?.has('pull')
        )
          continue
      }
      const copy: Item = {
        ...source,
        id: nextId++,
        x: nx,
        y: ny,
        props: [],
        converted: true,
        spawned: true,
      }
      // Official `copy()`→`create()`→`addunit`→`statusblock` re-latches
      // the copy's float from live rules — the source's turn-start latch
      // doesn't carry over.
      delete copy.floatLatch
      spawned.push(copy)
      const landed = byCell.get(key)
      if (landed) landed.push(copy)
      else byCell.set(key, [copy])
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
