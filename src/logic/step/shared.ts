import type { Direction, Item, Rule } from '../types.js'

export const keyFor = (x: number, y: number, width: number): number =>
  y * width + x

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

const matchesSubject = (item: Item, rule: Rule): boolean => {
  const subjectNegated = rule.subjectNegated ?? false
  if (rule.subject === 'text')
    return subjectNegated ? !item.isText : item.isText
  if (rule.subject === 'empty') return false
  if (item.isText) return false
  return subjectNegated
    ? item.name !== rule.subject
    : item.name === rule.subject
}

const resolveHasTargets = (item: Item, hasRules: Rule[]): string[] => {
  const yes = new Set<string>()
  const no = new Set<string>()
  for (const rule of hasRules) {
    if (!matchesSubject(item, rule)) continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  return Array.from(yes).filter((target) => !no.has(target))
}

export const appendHasSpawns = (
  survivors: Item[],
  removedItems: Item[],
  hasRules: Rule[],
  preserveDirection: boolean,
): { items: Item[]; changed: boolean } => {
  if (!hasRules.length || !removedItems.length)
    return { items: survivors, changed: false }

  let nextId =
    [...survivors, ...removedItems].reduce(
      (max, item) => Math.max(max, item.id),
      0,
    ) + 1
  const spawned: Item[] = []

  for (const item of removedItems) {
    const targets = resolveHasTargets(item, hasRules)
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
