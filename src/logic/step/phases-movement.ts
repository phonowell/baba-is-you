import { resolveActiveEmptyProps } from '../empty.js'
import { keyFor } from '../helpers.js'
import { matchesRuleSubject } from '../rule-match.js'

import { moveItemsBatch } from './move-batch.js'
import {
  buildGrid,
  hasProp,
  MOVE_DELTAS,
  resolveLevelPropsGlobal,
  reverseDirection,
  splitByFloatLayer,
} from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Direction, Item, Rule } from '../types.js'

// `chill` picks a deterministic direction per (turn, item) — the official
// `random{-1,1}` pick stands in as a seeded hash so replays stay stable.
const CHILL_DIRS: Direction[] = ['up', 'right', 'down', 'left']

const chillDirection = (turn: number, id: number): Direction => {
  let hash = 2166136261
  const seed = `chill:${turn}:${id}`
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return CHILL_DIRS[(hash >>> 0) % 4] ?? 'right'
}

// `nudge*` props are self-movement in a fixed direction — the official
// `findallfeature(is nudge*)` feeds them into `moving_units` like `move`.
const NUDGE_PROPS: Record<string, Direction> = {
  nudgeright: 'right',
  nudgeup: 'up',
  nudgeleft: 'left',
  nudgedown: 'down',
}

// Official direction numbering (values.lua ndirs): 0=right 1=up 2=left
// 3=down. `x fear y` probes adjacent cells starting behind the unit's
// facing and rotating; the unit flees opposite the first direction that
// holds the most feared targets.
const OFFICIAL_DIRS: Direction[] = ['right', 'up', 'left', 'down']
const OFFICIAL_DIR_INDEX: Record<Direction, number> = {
  right: 0,
  up: 1,
  left: 2,
  down: 3,
}

// Target words for `fear`/`follow` objects: `text` matches text entities,
// `all` any entity, negated objects everything but the word. `empty` and
// group subjects are unsupported (officially rare — empty cells can't be
// resolved through the item matcher).
const matchesVerbTarget = (
  item: Item,
  word: string,
  negated: boolean,
): boolean => {
  const match =
    word === 'all' ||
    (word === 'text' ? item.isText : item.name === word)
  return negated ? !match : match
}

const followDirectionForWords = (
  x: number,
  y: number,
  selfId: number,
  items: Item[],
  words: Array<{ word: string; negated: boolean }>,
): Direction | null => {
  if (!words.length) return null

  let best: { dist: number; dx: number; dy: number } | null = null
  for (const candidate of items) {
    if (candidate.id === selfId) continue
    if (!words.some((w) => matchesVerbTarget(candidate, w.word, w.negated)))
      continue
    const dx = candidate.x - x
    const dy = candidate.y - y
    const dist = Math.abs(dx) + Math.abs(dy)
    if (dist === 0) continue
    if (!best || dist < best.dist) best = { dist, dx, dy }
  }
  if (!best) return null

  // Official picks the axis with the larger remaining distance (vertical
  // wins ties) and moves along its sign.
  const vertical = Math.abs(best.dy) >= Math.abs(best.dx)
  if (vertical && best.dy !== 0) return best.dy > 0 ? 'down' : 'up'
  if (best.dx !== 0) return best.dx > 0 ? 'right' : 'left'
  return best.dy > 0 ? 'down' : 'up'
}

const followDirection = (
  item: Item,
  items: Item[],
  rules: Rule[],
  context: RuleRuntime['context'],
): Direction | null =>
  followDirectionForWords(
    item.x,
    item.y,
    item.id,
    items,
    rules
      .filter((rule) => matchesRuleSubject(item, rule, context))
      .map((rule) => ({
        word: rule.object,
        negated: rule.objectNegated === true,
      })),
  )

const fearDirection = (
  item: Item,
  items: Item[],
  rules: Rule[],
  context: RuleRuntime['context'],
): Direction | null => {
  const words = rules
    .filter((rule) => matchesRuleSubject(item, rule, context))
    .map((rule) => ({ word: rule.object, negated: rule.objectNegated === true }))
  if (!words.length) return null

  const fearedByCell = new Map<string, Item[]>()
  for (const candidate of items) {
    if (candidate.id === item.id) continue
    if (!words.some((w) => matchesVerbTarget(candidate, w.word, w.negated)))
      continue
    const key = `${candidate.x},${candidate.y}`
    const list = fearedByCell.get(key) ?? []
    list.push(candidate)
    fearedByCell.set(key, list)
  }

  const facing = OFFICIAL_DIR_INDEX[item.dir ?? 'right'] ?? 0
  const counts = new Array<number>(4).fill(0)
  let maxCount = 0
  for (let j = 0; j < 4; j += 1) {
    const dirIndex = (facing + 2 + j) % 4
    const direction = OFFICIAL_DIRS[dirIndex]
    if (!direction) continue
    const [dx, dy] = MOVE_DELTAS[direction]
    const feared = fearedByCell.get(`${item.x + dx},${item.y + dy}`)?.length ?? 0
    counts[dirIndex] = feared
    if (feared > maxCount) maxCount = feared
  }
  if (!maxCount) return null

  for (let j = 0; j < 4; j += 1) {
    const dirIndex = (facing + 2 + j) % 4
    if (counts[dirIndex] !== maxCount) continue
    const direction = OFFICIAL_DIRS[dirIndex]
    return direction ? reverseDirection(direction) : null
  }
  return null
}

export const applyMoveAdjective = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; moved: boolean } => {
  // Movers are collected row-major (y,x) like the predecessor's cell
  // iteration: resolution order decides which direction a contested pushed
  // item is pushed in. `auto`/`chill`/`nudge*` move unprompted like
  // `move`; `broken` units never move under their own power. `reverse`
  // flips every self-move direction (official `reversecheck`).
  const turn = runtime.context.turn ?? 0
  const selfMovers = items
    .filter(
      (item) =>
        (hasProp(item, 'move') ||
          hasProp(item, 'auto') ||
          hasProp(item, 'chill') ||
          item.props.some((prop) => prop in NUDGE_PROPS)) &&
        !hasProp(item, 'sleep') &&
        !hasProp(item, 'broken'),
    )
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    .map((item) => {
      const nudge = item.props.find((prop) => prop in NUDGE_PROPS)
      const dir = hasProp(item, 'chill')
        ? chillDirection(turn, item.id)
        : nudge
          ? (NUDGE_PROPS[nudge] ?? 'right')
          : (item.dir ?? 'right')
      return {
        id: item.id,
        dir: hasProp(item, 'reverse') ? reverseDirection(dir) : dir,
        isMove: true,
      }
    })

  const { context } = runtime
  const verbMovers: Array<{ id: number; dir: Direction; isMove: boolean }> =
    []
  if (runtime.buckets.follow.length || runtime.buckets.fear.length) {
    const candidates = items
      .filter((item) => !hasProp(item, 'sleep') && !hasProp(item, 'broken'))
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    for (const item of candidates) {
      // Officially `follow` resolves in the start block, `fear` in a
      // later movement take — follow takes the slot first here.
      const dir =
        followDirection(item, items, runtime.buckets.follow, context) ??
        fearDirection(item, items, runtime.buckets.fear, context)
      if (!dir) continue
      verbMovers.push({
        id: item.id,
        dir: hasProp(item, 'reverse') ? reverseDirection(dir) : dir,
        isMove: true,
      })
    }
  }

  const movers = [...selfMovers, ...verbMovers]

  // `empty is move`/`auto`: empty pseudo-units (official unitid 2) move
  // in the direction their `empty is <dir>` rules set (`emptydir`) and
  // push whatever stands in the target cell — or swap under
  // `empty is swap`. `empty is reverse` flips the direction.
  const emptyProps = resolveActiveEmptyProps(
    runtime.rules,
    items,
    runtime.width,
    runtime.height,
    runtime.context,
  )
  const emptySwaps: Array<{ id: number; x: number; y: number }> = []
  const emptyMoves =
    (emptyProps.has('move') || emptyProps.has('auto')) &&
    !emptyProps.has('still') &&
    !emptyProps.has('sleep')
  if (emptyMoves) {
    let dirProp: Direction | undefined
    for (const rule of runtime.rules) {
      if (
        rule.kind === 'is-property' &&
        rule.subject === 'empty' &&
        !rule.subjectNegated &&
        !rule.condition &&
        !rule.objectNegated &&
        (rule.object === 'right' ||
          rule.object === 'up' ||
          rule.object === 'left' ||
          rule.object === 'down')
      )
        dirProp = rule.object as Direction
    }
    // `empty follow x` steers each empty cell toward the nearest target —
    // it overrides the direction prop like the official `emptydir`.
    const emptyFollowRules = runtime.buckets.follow.filter(
      (rule) =>
        rule.subject === 'empty' && !rule.subjectNegated && !rule.condition,
    )
    const dirAt = (x: number, y: number): Direction | undefined => {
      if (emptyFollowRules.length) {
        const followed = followDirectionForWords(
          x,
          y,
          -1,
          items,
          emptyFollowRules.map((rule) => ({
            word: rule.object,
            negated: rule.objectNegated === true,
          })),
        )
        if (followed) return followed
      }
      return dirProp
    }
    const grid = buildGrid(items, runtime.width)
    const emptySwap = emptyProps.has('swap')
    const queued = new Set(movers.map((mover) => mover.id))
    for (let y = 0; y < runtime.height; y += 1) {
      for (let x = 0; x < runtime.width; x += 1) {
        if ((grid.get(keyFor(x, y, runtime.width))?.length ?? 0) > 0)
          continue
        const cellDir = dirAt(x, y)
        if (!cellDir) continue
        const dir = emptyProps.has('reverse')
          ? reverseDirection(cellDir)
          : cellDir
        const [dx, dy] = MOVE_DELTAS[dir]
        const tx = x + dx
        const ty = y + dy
        if (
          tx < 0 ||
          tx >= runtime.width ||
          ty < 0 ||
          ty >= runtime.height
        )
          continue
        const targets = grid.get(keyFor(tx, ty, runtime.width))
        if (!targets?.length) continue
        for (const target of targets) {
          if (emptySwap) {
            if (!hasProp(target, 'still'))
              emptySwaps.push({ id: target.id, x, y })
          } else if (
            (hasProp(target, 'push') || hasProp(target, 'word')) &&
            !hasProp(target, 'still') &&
            !hasProp(target, 'phantom') &&
            !queued.has(target.id)
          ) {
            movers.push({ id: target.id, dir, isMove: true })
            queued.add(target.id)
          }
        }
      }
    }
  }

  if (!movers.length && !emptySwaps.length) return { items, moved: false }
  const moved = moveItemsBatch(items, runtime, movers)
  if (!emptySwaps.length) return moved

  const byId = new Map<number, Item>()
  const next = moved.items.map((item) => {
    byId.set(item.id, item)
    return { ...item }
  })
  let swapped = false
  for (const swap of emptySwaps) {
    const item = byId.get(swap.id)
    if (!item || (item.x === swap.x && item.y === swap.y)) continue
    item.x = swap.x
    item.y = swap.y
    swapped = true
  }
  return { items: swapped ? next : moved.items, moved: moved.moved || swapped }
}

// `fall` slides downward; `fallup`/`fallleft`/`fallright` are the
// directional variants the official prop set adds. The official
// `fallblock` resolves each cell of a fall through the regular move
// `check` — fallers pass through walk-over units, push pushables and
// stop only on real blockers — and re-runs the whole set until settled.
// Reuse `moveItemsBatch` for one cell per iteration; `isMove:false`
// keeps a blocked faller in place instead of bouncing like `move`.
const FALL_PROPS: Record<string, Direction> = {
  fall: 'down',
  fallup: 'up',
  fallleft: 'left',
  fallright: 'right',
}

const MAX_FALL_ITERATIONS = 64

export const applyFall = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; moved: boolean } => {
  let current = items
  let moved = false

  for (let iteration = 0; iteration < MAX_FALL_ITERATIONS; iteration += 1) {
    const movers: Array<{ id: number; dir: Direction; isMove: boolean }> = []
    for (const item of current) {
      if (hasProp(item, 'sleep') || hasProp(item, 'broken')) continue
      const fallProp = item.props.find((prop) => prop in FALL_PROPS)
      if (fallProp === undefined) continue
      movers.push({ id: item.id, dir: FALL_PROPS[fallProp] ?? 'down', isMove: false })
    }
    if (!movers.length) break

    const step = moveItemsBatch(current, runtime, movers)
    if (!step.moved) break
    current = step.items
    moved = true
  }

  return { items: current, moved }
}

// `x is back` restores the entity's pre-step position — the official
// undo-buffer restore (`back_init` rewind) approximated per turn. It is a
// state restore, so it ignores blockers entirely.
export const applyBack = (
  items: Item[],
  width: number,
  height: number,
): { items: Item[]; moved: boolean } => {
  let moved = false
  const next = items.map((item) => {
    if (!hasProp(item, 'back')) return item
    const { prevX, prevY } = item
    if (prevX === undefined || prevY === undefined) return item
    if (prevX === item.x && prevY === item.y) return item
    if (prevX < 0 || prevY < 0 || prevX >= width || prevY >= height)
      return item
    moved = true
    return { ...item, x: prevX, y: prevY }
  })
  return moved ? { items: next, moved } : { items, moved: false }
}

export const applyShift = (
  items: Item[],
  runtime: RuleRuntime,
  levelDir?: Direction,
): { items: Item[]; moved: boolean } => {
  const { width, height } = runtime
  // `level is shift` shoves every unit along the room's facing
  // (official: all units take a `mapdir` step each turn).
  const levelShift =
    levelDir !== undefined &&
    resolveLevelPropsGlobal(
      runtime.buckets.level,
      runtime.context,
      width,
      height,
    ).has('shift')
  if (!levelShift && !items.some((item) => hasProp(item, 'shift')))
    return { items, moved: false }

  const shiftedItems = items.map((item) => ({ ...item }))
  const byCell = buildGrid(shiftedItems, width)
  const byId = new Map<number, Item>()
  for (const item of shiftedItems) byId.set(item.id, item)

  const movers: Array<{ id: number; dir: Direction; isMove: boolean }> = []
  let facingChanged = false

  // Row-major cell order, matching the predecessor's `select` iteration;
  // shift only affects items in the same float layer (e.g. a grounded belt
  // does not move floating text).
  const cellKeys = Array.from(byCell.keys()).sort((a, b) => a - b)
  for (const cellKey of cellKeys) {
    const cellItems = byCell.get(cellKey) ?? []
    for (const layer of splitByFloatLayer(cellItems)) {
      const shifts = layer.filter((item) => hasProp(item, 'shift'))
      const firstShift = shifts[0]
      if (!firstShift) continue

      for (let n = 0; n < shifts.length; n += 1) {
        const shift = shifts[n]
        if (!shift) continue

        const shiftLive = byId.get(shift.id)
        if (!shiftLive) continue
        const direction = shiftLive.dir ?? 'right'

        for (const item of layer) {
          if (item.id === shift.id) continue
          if (n > 0 && item.id !== firstShift.id) continue

          const live = byId.get(item.id)
          if (!live) continue
          if (hasProp(live, 'sleep') || hasProp(live, 'still')) continue

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
  }

  if (levelShift && levelDir) {
    const queued = new Set(movers.map((mover) => mover.id))
    for (const item of shiftedItems) {
      if (queued.has(item.id)) continue
      if (hasProp(item, 'sleep') || hasProp(item, 'still')) continue
      if (item.dir !== levelDir) {
        item.dir = levelDir
        facingChanged = true
      }
      movers.push({ id: item.id, dir: levelDir, isMove: false })
    }
  }

  if (!movers.length) return { items, moved: facingChanged }

  const shiftedResult = moveItemsBatch(shiftedItems, runtime, movers)
  return {
    items: shiftedResult.items,
    moved: shiftedResult.moved || facingChanged,
  }
}
