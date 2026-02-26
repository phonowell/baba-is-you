import { applyProperties, applyTransforms } from './resolve.js'
import { collectRules } from './rules.js'

import type { Direction, GameState, Item, Rule, StepResult } from './types.js'

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

const MOVE_DELTAS: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

const reverseDirection = (direction: Direction): Direction => {
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

const moveItems = (
  items: Item[],
  direction: Direction,
  width: number,
  height: number,
  rules: Rule[],
  isMover: (item: Item) => boolean,
  isMovePhase: boolean,
): { items: Item[]; moved: boolean; movedIds: Set<number> } => {
  const next = items.map((item) => ({ ...item }))
  const byId = new Map<number, Item>()
  const movers: number[] = []
  const moverIds = new Set<number>()
  const pushIds = new Set<number>()
  const stopIds = new Set<number>()
  const pullIds = new Set<number>()
  const swapIds = new Set<number>()
  const openIds = new Set<number>()
  const shutIds = new Set<number>()
  const weakIds = new Set<number>()

  for (const item of next) {
    byId.set(item.id, item)
    if (isMover(item)) {
      movers.push(item.id)
      moverIds.add(item.id)
    }
    if (hasProp(item, 'push')) pushIds.add(item.id)
    if (hasProp(item, 'stop')) stopIds.add(item.id)
    if (hasProp(item, 'pull')) pullIds.add(item.id)
    if (hasProp(item, 'swap')) swapIds.add(item.id)
    if (hasProp(item, 'open')) openIds.add(item.id)
    if (hasProp(item, 'shut')) shutIds.add(item.id)
    if (hasProp(item, 'weak')) weakIds.add(item.id)
  }

  const moved = new Set<number>()
  const removed = new Set<number>()
  const removedItems: Item[] = []
  let anyMoved = false
  const grid = buildGrid(next, width)
  const [dx, dy] = MOVE_DELTAS[direction]

  const isOpenShutPair = (a: Item, b: Item): boolean =>
    (openIds.has(a.id) && shutIds.has(b.id)) ||
    (shutIds.has(a.id) && openIds.has(b.id))

  const isMoveEntity = (id: number): boolean => isMovePhase && moverIds.has(id)

  const removeOne = (item: Item): void => {
    if (removed.has(item.id)) return
    removed.add(item.id)
    removedItems.push(item)
    byId.delete(item.id)

    const cellKey = keyFor(item.x, item.y, width)
    const cellItems = grid.get(cellKey) ?? []
    grid.set(
      cellKey,
      cellItems.filter((other) => other.id !== item.id),
    )
  }

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)

    const item = byId.get(id)
    if (!item) return false

    const nx = item.x + dx
    const ny = item.y + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false

    const targetKey = keyFor(nx, ny, width)
    const targets = (grid.get(targetKey) ?? []).filter(
      (target) => !removed.has(target.id),
    )
    if (!targets.length) return true

    if (targets.some((target) => isOpenShutPair(item, target))) return true

    const pushTargets: Item[] = []
    for (const target of targets) {
      if (weakIds.has(target.id)) continue

      const pushable = pushIds.has(target.id)
      const swappable = swapIds.has(target.id) && !pushable
      const blockingStop = stopIds.has(target.id) && !pushable && !swappable
      const blockingPull = pullIds.has(target.id) && !pushable && !swappable
      if (blockingStop || blockingPull) return false
      if (pushable) pushTargets.push(target)
    }

    for (const target of pushTargets) {
      if (canMove(target.id, visiting)) continue
      if (weakIds.has(target.id) && !isMoveEntity(target.id)) continue
      return false
    }

    return true
  }

  const moveOne = (item: Item, nx: number, ny: number): void => {
    const oldKey = keyFor(item.x, item.y, width)
    const oldList = grid.get(oldKey) ?? []
    grid.set(
      oldKey,
      oldList.filter((other) => other.id !== item.id),
    )

    item.x = nx
    item.y = ny

    const newKey = keyFor(nx, ny, width)
    const newList = grid.get(newKey) ?? []
    newList.push(item)
    grid.set(newKey, newList)
  }

  const doMove = (id: number): void => {
    if (moved.has(id) || removed.has(id)) return

    const item = byId.get(id)
    if (!item) return

    const oldX = item.x
    const oldY = item.y
    const nx = item.x + dx
    const ny = item.y + dy
    const targetKey = keyFor(nx, ny, width)
    const targets = [...(grid.get(targetKey) ?? [])]
    const pushTargets = targets.filter((target) => pushIds.has(target.id))
    const swapTargets = targets.filter(
      (target) => !pushIds.has(target.id) && swapIds.has(target.id),
    )

    const behindX = oldX - dx
    const behindY = oldY - dy
    const pullTargets =
      behindX < 0 || behindY < 0 || behindX >= width || behindY >= height
        ? []
        : [...(grid.get(keyFor(behindX, behindY, width)) ?? [])].filter((target) =>
            pullIds.has(target.id),
          )

    for (const target of pushTargets) {
      if (moved.has(target.id) || removed.has(target.id)) continue
      if (!canMove(target.id, new Set())) {
        if (weakIds.has(target.id) && !isMoveEntity(target.id)) {
          removeOne(target)
          anyMoved = true
        }
        continue
      }
      doMove(target.id)
    }

    const liveTargets = [...(grid.get(targetKey) ?? [])].filter(
      (target) => !removed.has(target.id),
    )
    const openShutTargets = liveTargets.filter((target) =>
      isOpenShutPair(item, target),
    )

    if (openShutTargets.length) {
      removeOne(item)
      moved.add(item.id)
      anyMoved = true

      for (const target of openShutTargets) removeOne(target)

      for (const target of pullTargets) {
        if (moved.has(target.id) || removed.has(target.id)) continue
        if (!canMove(target.id, new Set())) continue
        doMove(target.id)
      }

      return
    }

    moveOne(item, nx, ny)
    moved.add(item.id)
    anyMoved = true

    for (const target of swapTargets) {
      if (moved.has(target.id) || removed.has(target.id)) continue
      const targetLive = byId.get(target.id)
      if (!targetLive) continue
      moveOne(targetLive, oldX, oldY)
      moved.add(targetLive.id)
      anyMoved = true
    }

    for (const target of pullTargets) {
      if (moved.has(target.id) || removed.has(target.id)) continue
      if (!canMove(target.id, new Set())) continue
      doMove(target.id)
    }
  }

  for (const id of movers) {
    if (moved.has(id) || removed.has(id)) continue

    if (!canMove(id, new Set())) {
      const item = byId.get(id)
      if (item && weakIds.has(id) && !isMoveEntity(id)) {
        removeOne(item)
        anyMoved = true
      }
      continue
    }

    doMove(id)
  }

  const survivors = next.filter((item) => !removed.has(item.id))
  const hasRules = rules.filter((rule) => rule.kind === 'has')
  if (!hasRules.length)
    return {
      items: survivors,
      moved: anyMoved,
      movedIds: moved,
    }

  let nextId = next.reduce((max, item) => Math.max(max, item.id), 0) + 1
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
          ...(item.dir ? { dir: item.dir } : {}),
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
        ...(item.dir ? { dir: item.dir } : {}),
      })
    }
  }

  return {
    items: [...survivors, ...spawned],
    moved: anyMoved,
    movedIds: moved,
  }
}


const moveItemsBatch = (
  items: Item[],
  width: number,
  height: number,
  rules: Rule[],
  movers: Array<{ id: number; dir: Direction; isMove: boolean }>,
): { items: Item[]; moved: boolean } => {
  const next = items.map((item) => ({ ...item }))
  const byId = new Map<number, Item>()
  const grid = buildGrid(next, width)

  const pushIds = new Set<number>()
  const stopIds = new Set<number>()
  const pullIds = new Set<number>()
  const openIds = new Set<number>()
  const shutIds = new Set<number>()
  const weakIds = new Set<number>()

  for (const item of next) {
    byId.set(item.id, item)
    if (hasProp(item, 'push')) pushIds.add(item.id)
    if (hasProp(item, 'stop')) stopIds.add(item.id)
    if (hasProp(item, 'pull')) pullIds.add(item.id)
    if (hasProp(item, 'open')) openIds.add(item.id)
    if (hasProp(item, 'shut')) shutIds.add(item.id)
    if (hasProp(item, 'weak')) weakIds.add(item.id)
  }

  type ArrowStatus = 'pending' | 'moving' | 'stopped'
  type Arrow = {
    dir: Direction
    flipped: boolean
    isMove: boolean
    status: ArrowStatus
  }

  const arrows = new Map<number, Arrow>()
  const queue: number[] = []
  const removed = new Set<number>()
  const removedItems: Item[] = []
  let changed = false

  const isOpenShutPair = (a: Item, b: Item): boolean =>
    (openIds.has(a.id) && shutIds.has(b.id)) ||
    (shutIds.has(a.id) && openIds.has(b.id))

  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height

  const addArrow = (id: number, dir: Direction, isMove: boolean): void => {
    if (removed.has(id) || arrows.has(id)) return
    arrows.set(id, {
      dir,
      flipped: false,
      isMove,
      status: 'pending',
    })
    queue.push(id)
  }

  const removeOne = (item: Item): void => {
    if (removed.has(item.id)) return
    removed.add(item.id)
    removedItems.push(item)
    byId.delete(item.id)
    changed = true

    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    grid.set(
      key,
      list.filter((other) => other.id !== item.id),
    )
  }

  for (const mover of movers) addArrow(mover.id, mover.dir, mover.isMove)

  while (queue.length) {
    const id = queue.shift()
    if (id === undefined) continue
    if (removed.has(id)) continue

    const arrow = arrows.get(id)
    if (!arrow || arrow.status !== 'pending') continue

    const item = byId.get(id)
    if (!item) continue

    const [dx, dy] = MOVE_DELTAS[arrow.dir]
    const nx = item.x + dx
    const ny = item.y + dy

    if (inBounds(nx, ny)) {
      const targetKey = keyFor(nx, ny, width)
      const targets = grid.get(targetKey) ?? []
      let pushed = false
      for (const target of targets) {
        if (removed.has(target.id)) continue
        if (!pushIds.has(target.id)) continue
        if (arrows.has(target.id)) continue
        addArrow(target.id, arrow.dir, false)
        pushed = true
      }
      if (pushed) {
        queue.push(id)
        continue
      }
    }

    let blocked = !inBounds(nx, ny)
    let defer = false

    if (!blocked) {
      const targetKey = keyFor(nx, ny, width)
      const targets = grid.get(targetKey) ?? []

      for (const target of targets) {
        if (removed.has(target.id)) continue
        if (isOpenShutPair(item, target)) {
          removeOne(item)
          removeOne(target)
          continue
        }

        const stop = stopIds.has(target.id)
        const push = pushIds.has(target.id)
        const pull = pullIds.has(target.id)
        const weak = weakIds.has(target.id)

        if (weak || blocked || (!push && !stop && !pull)) continue

        const targetArrow = arrows.get(target.id)
        if (targetArrow && targetArrow.dir === arrow.dir) {
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
      if (weakIds.has(id) && !arrow.isMove) {
        removeOne(item)
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
    if (inBounds(px, py)) {
      const pullKey = keyFor(px, py, width)
      const behind = grid.get(pullKey) ?? []
      for (const target of behind) {
        if (removed.has(target.id)) continue
        if (!pullIds.has(target.id)) continue
        addArrow(target.id, arrow.dir, false)
      }
    }

    arrow.status = 'moving'
  }


  const movingIds: number[] = []
  for (const [id, arrow] of arrows.entries()) {
    if (arrow.status !== 'moving') continue
    if (removed.has(id)) continue
    movingIds.push(id)
  }

  for (const id of movingIds) {
    const item = byId.get(id)
    const arrow = arrows.get(id)
    if (!item || !arrow) continue

    if (item.dir !== arrow.dir) {
      item.dir = arrow.dir
      changed = true
    }

    const oldKey = keyFor(item.x, item.y, width)
    const oldList = grid.get(oldKey) ?? []
    grid.set(
      oldKey,
      oldList.filter((other) => other.id !== id),
    )

    const [dx, dy] = MOVE_DELTAS[arrow.dir]
    item.x += dx
    item.y += dy

    const newKey = keyFor(item.x, item.y, width)
    const newList = grid.get(newKey) ?? []
    newList.push(item)
    grid.set(newKey, newList)

    changed = true
  }

  const survivors = next.filter((item) => !removed.has(item.id))
  const hasRules = rules.filter((rule) => rule.kind === 'has')
  if (!hasRules.length) return { items: survivors, moved: changed }

  let nextId = next.reduce((max, item) => Math.max(max, item.id), 0) + 1
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
          ...(item.dir ? { dir: item.dir } : {}),
        })
        changed = true
        continue
      }

      spawned.push({
        id: nextId++,
        name: target,
        x: item.x,
        y: item.y,
        isText: false,
        props: [],
        ...(item.dir ? { dir: item.dir } : {}),
      })
      changed = true
    }
  }

  return {
    items: [...survivors, ...spawned],
    moved: changed,
  }
}

const applyMoveAdjective = (
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

const applyShift = (
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

  const shiftedResult = moveItemsBatch(shiftedItems, width, height, rules, movers)
  return {
    items: shiftedResult.items,
    moved: shiftedResult.moved || facingChanged,
  }
}

const applyDirectionalFacing = (
  items: Item[],
): {
  items: Item[]
  changed: boolean
} => {
  let changed = false
  const next = items.map((item) => {
    let dir = item.dir
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

const OORANDOM_MULTIPLIER = 747796405 >>> 0
const OORANDOM_INCREMENT = 2891336453 >>> 0
const OORANDOM_ROTATE_MULTIPLIER = 277803737 >>> 0

const toU32 = (value: number): number => value >>> 0

const defaultSeed = (randSeed: number): number => {
  const value = Math.imul(toU32(randSeed ^ OORANDOM_INCREMENT), OORANDOM_MULTIPLIER)
  const shift = toU32((value >>> 28) + 4)
  const word = Math.imul(toU32((value >>> shift) ^ value), OORANDOM_ROTATE_MULTIPLIER)
  return toU32((word >>> 22) ^ word)
}

const createRng = (seed: number): ((start: number, end: number) => number) => {
  let state = defaultSeed(seed)

  const randU32 = (): number => {
    state = toU32(Math.imul(state, OORANDOM_MULTIPLIER) + OORANDOM_INCREMENT)
    const shift = toU32((state >>> 28) + 4)
    const word = Math.imul(toU32((state >>> shift) ^ state), OORANDOM_ROTATE_MULTIPLIER)
    return toU32((word >>> 22) ^ word)
  }

  const randRange = (start: number, end: number): number => {
    if (start >= end) return start

    const range = toU32(end - start)
    if (range <= 1) return start

    let entropy = randU32()
    let scale = BigInt(entropy) * BigInt(range)
    let bias = Number(scale & 0xffffffffn) >>> 0

    if (bias < range) {
      const threshold = toU32(0 - range) % range
      while (bias < threshold) {
        entropy = randU32()
        scale = BigInt(entropy) * BigInt(range)
        bias = Number(scale & 0xffffffffn) >>> 0
      }
    }

    return start + (Number((scale >> 32n) & 0xffffffffn) >>> 0)
  }

  return randRange
}

const applyTeleport = (
  items: Item[],
  width: number,
  seed: number,
): {
  items: Item[]
  moved: boolean
} => {
  const next = items.map((item) => ({ ...item }))
  const byCell = buildGrid(next, width)
  const cellKeys = Array.from(byCell.keys()).sort((a, b) => a - b)

  const padsByCell = new Map<number, { x: number; y: number; floatLayers: Set<boolean> }>()
  const padList: Array<{ x: number; y: number }> = []
  for (const key of cellKeys) {
    const list = byCell.get(key)
    if (!list?.length) continue

    const teleItems = list.filter((item) => hasProp(item, 'tele'))
    if (!teleItems.length) continue

    const sample = teleItems[0]
    if (!sample) continue

    const floatLayers = new Set<boolean>()
    for (const teleItem of teleItems) floatLayers.add(hasProp(teleItem, 'float'))

    padsByCell.set(key, { x: sample.x, y: sample.y, floatLayers })
    padList.push({ x: sample.x, y: sample.y })
  }

  if (padList.length < 2) return { items, moved: false }

  const rng = createRng(seed)
  const destinations = new Map<number, { x: number; y: number }>()

  for (const key of cellKeys) {
    const list = byCell.get(key)
    if (!list?.length) continue

    const pad = padsByCell.get(key)
    if (!pad) continue

    for (const floatLayer of [true, false]) {
      if (!pad.floatLayers.has(floatLayer)) continue

      const hasTeleLayer = list.some(
        (item) => hasProp(item, 'tele') && hasProp(item, 'float') === floatLayer,
      )
      if (!hasTeleLayer) continue

      const candidates = padList.filter(
        (candidate) => candidate.x !== pad.x || candidate.y !== pad.y,
      )
      if (!candidates.length) continue

      for (const item of list) {
        if (hasProp(item, 'tele')) continue
        if (hasProp(item, 'float') !== floatLayer) continue

        const dest = candidates[rng(0, candidates.length)]
        if (!dest) continue
        destinations.set(item.id, dest)
      }
    }
  }

  if (!destinations.size) return { items, moved: false }

  let moved = false
  for (const item of next) {
    const dest = destinations.get(item.id)
    if (!dest) continue

    item.x = dest.x
    item.y = dest.y
    moved = true
  }

  return { items: next, moved }
}

const splitByFloatLayer = (items: Item[]): Item[][] => {
  const floating = items.filter((item) => hasProp(item, 'float'))
  const grounded = items.filter((item) => !hasProp(item, 'float'))
  const result: Item[][] = []
  if (floating.length) result.push(floating)
  if (grounded.length) result.push(grounded)
  return result
}

const applyOpenShut = (items: Item[], removed: Set<number>): boolean => {
  const opens = items.filter((item) => hasProp(item, 'open'))
  const shuts = items.filter((item) => hasProp(item, 'shut'))
  const pairCount = Math.min(opens.length, shuts.length)
  if (!pairCount) return false

  let changed = false
  for (let i = 0; i < pairCount; i += 1) {
    const open = opens[i]
    const shut = shuts[i]
    if (open) {
      removed.add(open.id)
      changed = true
    }
    if (shut) {
      removed.add(shut.id)
      changed = true
    }
  }

  return changed
}

const matchesSubject = (item: Item, rule: Rule): boolean => {
  const subjectNegated = rule.subjectNegated ?? false
  if (rule.subject === 'text') return subjectNegated ? !item.isText : item.isText
  if (rule.subject === 'empty') return false
  if (item.isText) return false
  return subjectNegated ? item.name !== rule.subject : item.name === rule.subject
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

const applyInteractions = (
  items: Item[],
  width: number,
  rules: Rule[],
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

  for (const list of byCell.values())
    for (const layer of splitByFloatLayer(list)) {
      if (!layer.length) continue
      const occupied = layer.length > 1

      if (occupied) {
        const hasSink = layer.some((item) => hasProp(item, 'sink'))
        if (hasSink) {
          for (const item of layer) removed.add(item.id)
          changed = true
        }
      }

      const hasDefeat = layer.some((item) => hasProp(item, 'defeat'))
      if (hasDefeat)
        for (const item of layer)
          if (hasProp(item, 'you')) {
            removed.add(item.id)
            changed = true
          }

      const hasHot = layer.some((item) => hasProp(item, 'hot'))
      if (hasHot)
        for (const item of layer)
          if (hasProp(item, 'melt')) {
            removed.add(item.id)
            changed = true
          }

      const openShutChanged = applyOpenShut(layer, removed)
      if (openShutChanged) changed = true

      if (occupied)
        for (const item of layer)
          if (hasProp(item, 'weak')) {
            removed.add(item.id)
            changed = true
          }
    }

  if (!removed.size) return { items, changed }

  const hasRules = rules.filter((rule) => rule.kind === 'has')
  if (!hasRules.length)
    return {
      items: items.filter((item) => !removed.has(item.id)),
      changed,
    }

  const survivors = items.filter((item) => !removed.has(item.id))
  const removedItems = items.filter((item) => removed.has(item.id))
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
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
        })
        changed = true
        continue
      }

      spawned.push({
        id: nextId++,
        name: target,
        x: item.x,
        y: item.y,
        isText: false,
        props: [],
      })
      changed = true
    }
  }

  return {
    items: [...survivors, ...spawned],
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

  for (const list of byCell.values())
    for (const layer of splitByFloatLayer(list)) {
      const hasYou = layer.some((item) => hasProp(item, 'you'))
      if (!hasYou) continue
      if (layer.some((item) => hasProp(item, 'win'))) return true
    }

  return false
}

const hasAnyYou = (items: Item[]): boolean =>
  items.some((item) => hasProp(item, 'you'))

export const step = (state: GameState, direction: Direction): StepResult => {
  const baseRules = collectRules(state.items, state.width, state.height)
  const baseItems = applyProperties(state.items, baseRules)

  const playerMoveResult = moveItems(
    baseItems,
    direction,
    state.width,
    state.height,
    baseRules,
    (item) => hasProp(item, 'you'),
    false,
  )
  const playerMoveWithProps = applyProperties(playerMoveResult.items, baseRules)
  const moveAdjectiveResult = applyMoveAdjective(
    playerMoveWithProps,
    state.width,
    state.height,
    baseRules,
  )
  const moveAdjectiveWithProps = applyProperties(moveAdjectiveResult.items, baseRules)
  const shiftResult = applyShift(
    moveAdjectiveWithProps,
    state.width,
    state.height,
    baseRules,
  )

  const postMoveRules = collectRules(shiftResult.items, state.width, state.height)
  const postMoveWithProps = applyProperties(shiftResult.items, postMoveRules)
  const rotatedResult = applyDirectionalFacing(postMoveWithProps)
  const transformResult = applyTransforms(
    rotatedResult.items,
    postMoveRules,
    state.width,
    state.height,
  )

  const preInteractionWithProps = applyProperties(
    transformResult.items,
    postMoveRules,
  )
  const interactionResult = applyInteractions(
    preInteractionWithProps,
    state.width,
    postMoveRules,
  )

  const postInteractionWithProps = applyProperties(
    interactionResult.items,
    postMoveRules,
  )
  const teleportResult = applyTeleport(
    postInteractionWithProps,
    state.width,
    state.turn,
  )

  const didWin = checkWin(teleportResult.items, state.width)
  const didLose = !didWin && !hasAnyYou(teleportResult.items)

  const finalRules = collectRules(teleportResult.items, state.width, state.height)
  const finalItems = applyProperties(teleportResult.items, finalRules)

  const nextState: GameState = {
    ...state,
    items: finalItems,
    rules: finalRules,
    status: didWin ? 'win' : didLose ? 'lose' : 'playing',
    turn: state.turn + 1,
  }

  const statusChanged =
    (state.status === 'win') !== didWin || (state.status === 'lose') !== didLose
  const changed =
    playerMoveResult.moved ||
    moveAdjectiveResult.moved ||
    shiftResult.moved ||
    rotatedResult.changed ||
    transformResult.changed ||
    interactionResult.changed ||
    teleportResult.moved ||
    statusChanged

  return { state: nextState, changed }
}
