import { applyProperties, applyTransforms } from './resolve.js'
import { collectRules } from './rules.js'

import type {
  Direction,
  GameState,
  Item,
  LevelItem,
  StepResult,
} from './types.js'

const keyFor = (x: number, y: number, width: number): number => y * width + x

const hasProp = (item: Item, prop: Item['props'][number]): boolean =>
  item.props.includes(prop)

const buildGrid = (items: Item[], width: number): Map<number, Item[]> => {
  const grid = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    list.push(item)
    grid.set(key, list)
  }
  return grid
}

const moveItems = (
  items: Item[],
  direction: Direction,
  width: number,
  height: number,
): { items: Item[]; moved: boolean } => {
  const next = items.map((item) => ({ ...item }))
  const byId = new Map<number, Item>()
  for (const item of next) byId.set(item.id, item)

  const movers = next
    .filter((item) => hasProp(item, 'you'))
    .map((item) => item.id)
  const moverSet = new Set<number>(movers)
  const moved = new Set<number>()
  let anyMoved = false

  const grid = buildGrid(next, width)

  const deltas: Record<Direction, [number, number]> = {
    up: [0, -1],
    right: [1, 0],
    down: [0, 1],
    left: [-1, 0],
  }
  const [dx, dy] = deltas[direction]

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true

    visiting.add(id)

    const item = byId.get(id)
    if (!item) return false

    const nx = item.x + dx
    const ny = item.y + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false

    const targetKey = keyFor(nx, ny, width)
    const targets = grid.get(targetKey) ?? []

    for (const target of targets) {
      const pushable = hasProp(target, 'push') || moverSet.has(target.id)
      if (hasProp(target, 'stop') && !pushable) return false
    }

    for (const target of targets) {
      const pushable = hasProp(target, 'push') || moverSet.has(target.id)
      if (!pushable) continue

      if (!canMove(target.id, visiting)) return false
    }

    return true
  }

  const doMove = (id: number): void => {
    if (moved.has(id)) return

    const item = byId.get(id)
    if (!item) return

    const nx = item.x + dx
    const ny = item.y + dy
    const targetKey = keyFor(nx, ny, width)
    const targets = grid.get(targetKey) ?? []

    for (const target of targets) {
      const pushable = hasProp(target, 'push') || moverSet.has(target.id)
      if (pushable) doMove(target.id)
    }

    const oldKey = keyFor(item.x, item.y, width)
    const oldList = grid.get(oldKey) ?? []
    grid.set(
      oldKey,
      oldList.filter((other) => other.id !== item.id),
    )

    item.x = nx
    item.y = ny

    const newList = grid.get(targetKey) ?? []
    newList.push(item)
    grid.set(targetKey, newList)

    moved.add(id)
    anyMoved = true
  }

  for (const id of movers) {
    if (moved.has(id)) continue

    if (!canMove(id, new Set())) continue

    doMove(id)
  }

  return { items: next, moved: anyMoved }
}

const applyInteractions = (
  items: Item[],
  width: number,
): { items: Item[]; changed: boolean } => {
  const byCell = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    list.push(item)
    byCell.set(key, list)
  }

  const removed = new Set<number>()
  let changed = false

  for (const list of byCell.values()) {
    if (list.length <= 1) continue

    const hasSink = list.some((item) => hasProp(item, 'sink'))
    if (hasSink) {
      for (const item of list) removed.add(item.id)

      changed = true
      continue
    }

    const hasHot = list.some((item) => hasProp(item, 'hot'))
    if (hasHot) {
      for (const item of list) {
        if (hasProp(item, 'melt')) {
          removed.add(item.id)
          changed = true
        }
      }
    }

    const hasDefeat = list.some((item) => hasProp(item, 'defeat'))
    if (hasDefeat) {
      for (const item of list) {
        if (hasProp(item, 'you')) {
          removed.add(item.id)
          changed = true
        }
      }
    }
  }

  if (!removed.size) return { items, changed }

  return {
    items: items.filter((item) => !removed.has(item.id)),
    changed,
  }
}

const checkWin = (items: Item[], width: number): boolean => {
  const byCell = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    list.push(item)
    byCell.set(key, list)
  }

  for (const list of byCell.values()) {
    if (list.length <= 1) continue

    const hasYou = list.some((item) => hasProp(item, 'you'))
    if (!hasYou) continue

    const hasWin = list.some((item) => hasProp(item, 'win'))
    if (hasWin) return true
  }

  return false
}

export const step = (state: GameState, direction: Direction): StepResult => {
  const baseRules = collectRules(state.items, state.width, state.height)
  const baseItems = applyProperties(state.items, baseRules)
  const moveResult = moveItems(baseItems, direction, state.width, state.height)

  const postMoveItems = moveResult.items as LevelItem[]
  const postRules = collectRules(postMoveItems, state.width, state.height)
  const transformResult = applyTransforms(postMoveItems, postRules)
  const withProps = applyProperties(transformResult.items, postRules)
  const interactionResult = applyInteractions(withProps, state.width)
  const finalRules = collectRules(
    interactionResult.items,
    state.width,
    state.height,
  )
  const finalItems = applyProperties(interactionResult.items, finalRules)
  const didWin = checkWin(finalItems, state.width)

  const nextState: GameState = {
    ...state,
    items: finalItems,
    rules: finalRules,
    status: didWin ? 'win' : 'playing',
    turn: state.turn + 1,
  }

  const changed =
    moveResult.moved ||
    transformResult.changed ||
    interactionResult.changed ||
    didWin !== (state.status === 'win')

  return { state: nextState, changed }
}
