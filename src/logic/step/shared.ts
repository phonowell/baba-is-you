import { keyFor as gridKeyFor, resolveRuleTargets } from '../helpers.js'
import { createRuleMatchContext, matchesRuleSubject } from '../rule-match.js'

import type { Direction, Item, Rule } from '../types.js'

export const keyFor = (x: number, y: number, width: number): number =>
  gridKeyFor(x, y, width)

export const hasProp = (item: Item, prop: Item['props'][number]): boolean =>
  item.props.includes(prop)

export const buildGrid = (
  items: Item[],
  width: number,
): Map<number, Item[]> => {
  const grid = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    list.push(item)
    grid.set(key, list)
  }
  return grid
}

export const MOVE_DELTAS: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

export const reverseDirection = (direction: Direction): Direction => {
  switch (direction) {
    case 'up':
      return 'down'
    case 'down':
      return 'up'
    case 'left':
      return 'right'
    case 'right':
      return 'left'
  }
}

export const splitByFloatLayer = (items: Item[]): Item[][] => {
  const floating = items.filter((item) => hasProp(item, 'float'))
  const grounded = items.filter((item) => !hasProp(item, 'float'))
  const result: Item[][] = []
  if (floating.length) result.push(floating)
  if (grounded.length) result.push(grounded)
  return result
}

export const appendHasSpawns = (
  survivors: Item[],
  removedItems: Item[],
  hasRules: Rule[],
  preserveDirection: boolean,
  width: number,
  height: number,
  sourceItems: Item[],
): { items: Item[]; changed: boolean } => {
  if (!hasRules.length || !removedItems.length)
    return { items: survivors, changed: false }
  const context = createRuleMatchContext(sourceItems, hasRules, width, height)

  let nextId =
    [...survivors, ...removedItems].reduce(
      (max, item) => Math.max(max, item.id),
      0,
    ) + 1
  const spawned: Item[] = []

  for (const item of removedItems) {
    const targets = resolveRuleTargets(item, hasRules, (candidate, rule) =>
      matchesRuleSubject(candidate, rule, context),
    )
    if (!targets.length) continue

    for (const target of targets) {
      if (target === 'empty') continue
      if (target === 'text') {
        spawned.push({
          id: nextId++,
          name: item.isText ? 'text' : item.name,
          x: item.x,
          y: item.y,
          isText: true,
          props: [],
          ...(preserveDirection && item.dir ? { dir: item.dir } : {}),
        })
        continue
      }

      spawned.push({
        id: nextId++,
        name: target,
        x: item.x,
        y: item.y,
        isText: false,
        props: [],
        ...(preserveDirection && item.dir ? { dir: item.dir } : {}),
      })
    }
  }

  if (!spawned.length) return { items: survivors, changed: false }
  return { items: [...survivors, ...spawned], changed: true }
}
