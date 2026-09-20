import { resolveEmptyPropsByCell } from '../empty.js'
import { keyFor } from '../helpers.js'
import { matchesRuleSubject } from '../rule-match.js'

import { moveItemsBatch } from './move-batch.js'
import { moveItems } from './move-single.js'
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
// `all` any entity, negated objects everything but the word. Other nouns
// resolve to the object type only — `follow baba` must not chase the
// `baba` word card (officially text units are `text_*` objects). `empty`
// and group subjects are unsupported (officially rare — empty cells can't
// be resolved through the item matcher).
const matchesVerbTarget = (
  item: Item,
  word: string,
  negated: boolean,
): boolean => {
  const match =
    word === 'all' ||
    (word === 'text' ? item.isText : item.name === word && !item.isText)
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

// Official `x follow y` is aim-only: `moveblock` calls `updatedir` and the
// unit never moves under follow alone — movement still needs `move`,
// `auto` & co., which then travel in the freshly aimed direction.
// Target pick: nearest unit (vertical axis wins ties); an adjacent target
// outranks distance — the previously locked target (`item.followed`)
// keeps it, else facing > left-turn > right-turn > last found, and the
// pick becomes the new lock. With no target the lock clears and the unit
// keeps its facing.
const followAim = (
  item: Item,
  items: Item[],
  rules: Rule[],
  context: RuleRuntime['context'],
): { dir: Direction; followed: number } | null => {
  const words = rules
    .filter((rule) => matchesRuleSubject(item, rule, context))
    .map((rule) => ({
      word: rule.object,
      negated: rule.objectNegated === true,
    }))
  if (!words.length) return null

  const facing = OFFICIAL_DIR_INDEX[item.dir ?? 'right'] ?? 0
  const offsets = [0, 1, 3].map(
    (turn) => MOVE_DELTAS[OFFICIAL_DIRS[(facing + turn) % 4]!]!,
  )

  let nearest: { dist: number; dir: Direction } | null = null
  let lockedDir: Direction | null = null
  let adjacentFacing: { id: number; dir: Direction } | null = null
  let adjacentTurn: { id: number; dir: Direction } | null = null
  let adjacentAny: { id: number; dir: Direction } | null = null

  for (const candidate of items) {
    if (candidate.id === item.id) continue
    if (!words.some((w) => matchesVerbTarget(candidate, w.word, w.negated)))
      continue
    const dx = candidate.x - item.x
    const dy = candidate.y - item.y
    const dist = Math.abs(dx) + Math.abs(dy)
    if (dist === 0) continue
    const dir: Direction =
      Math.abs(dx) <= Math.abs(dy)
        ? dy >= 0
          ? 'down'
          : 'up'
        : dx > 0
          ? 'right'
          : 'left'
    if (!nearest || dist <= nearest.dist) nearest = { dist, dir }
    if (dist === 1) {
      if (item.followed === candidate.id) {
        lockedDir = dir
        break
      }
      const entry = { id: candidate.id, dir }
      adjacentAny = entry
      if (
        item.x + offsets[0]![0] === candidate.x &&
        item.y + offsets[0]![1] === candidate.y
      )
        adjacentFacing = entry
      else if (
        !adjacentFacing &&
        item.x + offsets[1]![0] === candidate.x &&
        item.y + offsets[1]![1] === candidate.y
      )
        adjacentTurn = entry
      else if (
        !adjacentFacing &&
        !adjacentTurn &&
        item.x + offsets[2]![0] === candidate.x &&
        item.y + offsets[2]![1] === candidate.y
      )
        adjacentTurn = entry
    }
  }

  if (lockedDir) return { dir: lockedDir, followed: item.followed ?? -1 }
  const pick = adjacentFacing ?? adjacentTurn ?? adjacentAny
  if (pick) return { dir: pick.dir, followed: pick.id }
  return nearest ? { dir: nearest.dir, followed: -1 } : null
}

// Official `findfears` (tools.lua): each adjacent cell is scored by how
// many feared WORDS are present there (not unit count — `diramount`
// increments once per matching target word), scanning directions starting
// opposite the facing. Only maximum-scoring directions stay feared; a
// single one flees straight opposite, ties pick the first unobstructed,
// unfearful candidate rotating [facing, left, right, behind]. The unit
// then moves `amount = maxfear` cells — multiple feared words means a
// multi-cell flee.
const fearDirection = (
  item: Item,
  items: Item[],
  rules: Rule[],
  context: RuleRuntime['context'],
  width: number,
  height: number,
): { dir: Direction; amount: number } | null => {
  const words = rules
    .filter((rule) => matchesRuleSubject(item, rule, context))
    .map((rule) => ({ word: rule.object, negated: rule.objectNegated === true }))
  if (!words.length) return null

  const cellItems = new Map<number, Item[]>()
  for (const candidate of items) {
    if (candidate.id === item.id) continue
    const key = keyFor(candidate.x, candidate.y, width)
    const list = cellItems.get(key) ?? []
    list.push(candidate)
    cellItems.set(key, list)
  }

  const facing = OFFICIAL_DIR_INDEX[item.dir ?? 'right'] ?? 0
  const feardirs = new Array<number>(4).fill(0)
  let maxfear = 0
  let lastFound = -1
  for (let j = 0; j < 4; j += 1) {
    const dirIndex = (facing + 2 + j) % 4
    const direction = OFFICIAL_DIRS[dirIndex]
    if (!direction) continue
    const [dx, dy] = MOVE_DELTAS[direction]
    const cx = item.x + dx
    const cy = item.y + dy
    const cell = cellItems.get(keyFor(cx, cy, width)) ?? []
    let diramount = 0
    for (const w of words) {
      if (w.word === 'empty' && !w.negated) {
        if (!cell.length) diramount += 1
        continue
      }
      if (cell.some((c) => matchesVerbTarget(c, w.word, w.negated)))
        diramount += 1
    }
    if (diramount > 0) {
      feardirs[dirIndex] = diramount
      if (diramount > maxfear) maxfear = diramount
      lastFound = dirIndex
    }
  }
  if (!maxfear || lastFound < 0) return null

  let totalfeardirs = 0
  for (let i = 0; i < 4; i += 1) {
    if (feardirs[i]! >= maxfear) totalfeardirs += 1
    else feardirs[i] = 0
  }

  // Single maximum: flee opposite the last feared direction in scan order
  // (the official loop overwrites resultdir on every found direction).
  if (totalfeardirs === 1) {
    const flee = OFFICIAL_DIRS[(lastFound + 2) % 4]
    return flee ? { dir: flee, amount: maxfear } : null
  }

  // Ties: rotate through [facing, left, right, behind] — the official
  // candidate order produced by the successive ±1/±2 rotations. A
  // candidate is skipped when it still holds fear (`feardirs == 1` is a
  // literal comparison upstream — with maxfear > 1 tied cells never
  // disqualify a direction) or when the cell blocks entry.
  const obstructed = (dirIndex: number): boolean => {
    const direction = OFFICIAL_DIRS[dirIndex]
    if (!direction) return true
    const [dx, dy] = MOVE_DELTAS[direction]
    const cx = item.x + dx
    const cy = item.y + dy
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) return true
    const cell = cellItems.get(keyFor(cx, cy, width)) ?? []
    return cell.some(
      (c) => hasProp(c, 'stop') || hasProp(c, 'still'),
    )
  }

  let resultdir = facing
  for (let tests = 0; tests < 4; tests += 1) {
    const problems = feardirs[resultdir] === 1 || obstructed(resultdir)
    if (!problems) {
      const flee = OFFICIAL_DIRS[resultdir]
      return flee ? { dir: flee, amount: maxfear } : null
    }
    if (tests === 0) resultdir = (resultdir + 3) % 4
    else if (tests === 1) resultdir = (resultdir + 2) % 4
    else if (tests === 2) resultdir = (resultdir + 1) % 4
    else if (tests === 3) resultdir = (resultdir + 2) % 4
  }
  return null
}

export const applyMoveAdjective = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; moved: boolean } => {
  const { context } = runtime

  // `follow` only re-aims units (official `updatedir` in moveblock) — it
  // runs before the movers are collected so `follow`+`move`/`auto` units
  // travel in the aimed direction this same turn. An applied aim counts
  // as a real change: `dir`/`followed` are state fields, and reporting
  // `changed` false would drop them at the stage boundary.
  let aimed = false
  if (runtime.buckets.follow.length) {
    const candidates = items
      .filter((item) => !hasProp(item, 'sleep') && !hasProp(item, 'broken'))
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    const aims = new Map<number, { dir: Direction; followed: number }>()
    for (const item of candidates) {
      const aim = followAim(item, items, runtime.buckets.follow, context)
      if (aim) aims.set(item.id, aim)
    }
    if (aims.size) {
      items = items.map((item) => {
        const aim = aims.get(item.id)
        if (!aim) return item
        const followed = aim.followed >= 0 ? aim.followed : undefined
        if (item.dir === aim.dir && item.followed === followed) return item
        aimed = true
        const next = { ...item, dir: aim.dir }
        if (followed === undefined) delete next.followed
        else next.followed = followed
        return next
      })
    }
  }

  // Movers are collected row-major (y,x) like the predecessor's cell
  // iteration: resolution order decides which direction a contested pushed
  // item is pushed in. `auto`/`chill`/`nudge*` move unprompted like
  // `move`; `broken`/`sleep`/`still` units never move under their own
  // power (official `cantmove` in `add_moving_units`). `reverse` flips
  // every self-move direction (official `reversecheck`). `isMove` marks
  // the move/chill reasons — only they bounce off obstacles; `auto`,
  // `nudge*` and `fear` just stop (and die if `weak`).
  const turn = runtime.context.turn ?? 0
  const selfMovers = items
    .filter(
      (item) =>
        (hasProp(item, 'move') ||
          hasProp(item, 'auto') ||
          hasProp(item, 'chill') ||
          item.props.some((prop) => prop in NUDGE_PROPS)) &&
        !hasProp(item, 'sleep') &&
        !hasProp(item, 'broken') &&
        !hasProp(item, 'still'),
    )
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    .map((item) => {
      const nudge = item.props.find((prop) => prop in NUDGE_PROPS)
      const isMove = hasProp(item, 'move') || hasProp(item, 'chill')
      const dir = hasProp(item, 'chill')
        ? chillDirection(turn, item.id)
        : nudge
          ? (NUDGE_PROPS[nudge] ?? 'right')
          : (item.dir ?? 'right')
      return {
        id: item.id,
        dir: hasProp(item, 'reverse') ? reverseDirection(dir) : dir,
        isMove,
      }
    })

  const verbMovers: Array<{
    id: number
    dir: Direction
    isMove: boolean
    moves: number
  }> = []
  if (runtime.buckets.fear.length) {
    const candidates = items
      .filter((item) => !hasProp(item, 'sleep') && !hasProp(item, 'broken'))
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    const fearDirs = new Map<number, Direction>()
    for (const item of candidates) {
      const fear = fearDirection(
        item,
        items,
        runtime.buckets.fear,
        context,
        runtime.width,
        runtime.height,
      )
      if (!fear) continue
      const dir = hasProp(item, 'reverse')
        ? reverseDirection(fear.dir)
        : fear.dir
      if (hasProp(item, 'still')) {
        // Officially a still unit can't move but still turns to face the
        // flee direction (`cantmove` → `updatedir` without a queue entry).
        fearDirs.set(item.id, dir)
        continue
      }
      verbMovers.push({ id: item.id, dir, isMove: false, moves: fear.amount })
    }
    if (fearDirs.size) {
      items = items.map((item) => {
        const dir = fearDirs.get(item.id)
        if (!dir || item.dir === dir) return item
        aimed = true
        return { ...item, dir }
      })
    }
  }

  const movers = [...selfMovers, ...verbMovers]

  // `empty is move`/`auto`: empty pseudo-units (official unitid 2) move
  // in the direction their `empty is <dir>` rules set (`emptydir`) and
  // push whatever stands in the target cell — or swap under
  // `empty is swap`. `empty is reverse` flips the direction.
  const emptyPropsByCell = resolveEmptyPropsByCell(
    runtime.rules,
    items,
    runtime.width,
    runtime.height,
    runtime.context,
  )
  const emptySwaps: Array<{ id: number; x: number; y: number }> = []
  // Per-cell like the official unitid 2: `still`/`sleep`/`reverse` and
  // the move/auto prop itself only apply where their conditions hold.
  const emptyMovesCell = (props: ReadonlySet<string>): boolean =>
    (props.has('move') || props.has('auto')) &&
    !props.has('still') &&
    !props.has('sleep')
  const emptyMoves = Array.from(emptyPropsByCell.values()).some(
    emptyMovesCell,
  )
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
    const queued = new Set(movers.map((mover) => mover.id))
    for (const [key, props] of emptyPropsByCell) {
      if (!emptyMovesCell(props)) continue
      const x = key % runtime.width
      const y = (key - x) / runtime.width
      const cellDir = dirAt(x, y)
      if (!cellDir) continue
      const dir = props.has('reverse')
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
        if (props.has('swap')) {
          if (!hasProp(target, 'still'))
            emptySwaps.push({ id: target.id, x, y })
        } else if (
          hasProp(target, 'push') &&
          !hasProp(target, 'still') &&
          !hasProp(target, 'phantom') &&
          !queued.has(target.id)
        ) {
          movers.push({ id: target.id, dir, isMove: false })
          queued.add(target.id)
        }
      }
    }
  }

  if (!movers.length && !emptySwaps.length)
    return { items, moved: aimed }
  const moved = moveItemsBatch(items, runtime, movers)

  // Fear movers carry `moves = maxfear`: the official take loop moves the
  // unit that many cells, each a full collision resolution — replay the
  // extra steps as fresh one-mover batches against the moved board.
  let fearItems = moved.items
  let fearMoved = false
  for (const mover of verbMovers) {
    for (let stepIndex = 1; stepIndex < mover.moves; stepIndex += 1) {
      const extra = moveItemsBatch(fearItems, runtime, [
        { id: mover.id, dir: mover.dir, isMove: false },
      ])
      fearItems = extra.items
      fearMoved = fearMoved || extra.moved
    }
  }

  if (!emptySwaps.length)
    return { items: fearItems, moved: moved.moved || fearMoved || aimed }

  const byId = new Map<number, Item>()
  const next = fearItems.map((item) => {
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
  return {
    items: swapped ? next : fearItems,
    moved: moved.moved || fearMoved || swapped || aimed,
  }
}

// `fall` slides downward; `fallup`/`fallleft`/`fallright` are the
// directional variants the official prop set adds. The official
// `fallblock` resolves each cell of a fall through the regular move
// `check`, but lands on ANY nonzero obstacle verdict — pushable,
// pullable and swap units are ground, not pushed — and only passes
// through soft objects plus consumed specials (lock/eat/same-layer
// `weak`, which die mid-fall).
//
// Check entries are grouped by direction in the official list order
// (down, right, up, left); a unit's `reverse` remaps each direction and
// opposite-direction instances cancel pairwise (fd↔fu, fr↔fl). A unit
// listed under several directions falls in every one during the first
// pass — `objectdata.fallen` is only written when `fallblock` returns —
// while later passes restrict it to its first listed direction.
const FALL_PROPS: Record<string, Direction> = {
  fall: 'down',
  fallright: 'right',
  fallup: 'up',
  fallleft: 'left',
}
const FALL_GROUP_ORDER: Direction[] = ['down', 'right', 'up', 'left']

const MAX_FALL_PASSES = 64

export const applyFall = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; moved: boolean } => {
  // Per-unit direction counts — props are deduped, so this stays at
  // prop granularity (two same-prop rules can't double-count, unlike the
  // official per-rule-instance list).
  const counts = new Map<number, Map<Direction, number>>()
  for (const item of items) {
    if (hasProp(item, 'sleep') || hasProp(item, 'broken')) continue
    const dirs = new Map<Direction, number>()
    const reversed = hasProp(item, 'reverse')
    for (const prop of item.props) {
      const dir = FALL_PROPS[prop]
      if (dir === undefined) continue
      const remapped = reversed ? reverseDirection(dir) : dir
      dirs.set(remapped, (dirs.get(remapped) ?? 0) + 1)
    }
    for (const [a, b] of [
      ['down', 'up'],
      ['left', 'right'],
    ] as const) {
      const cancel = Math.min(dirs.get(a) ?? 0, dirs.get(b) ?? 0)
      if (cancel > 0) {
        dirs.set(a, (dirs.get(a) ?? 0) - cancel)
        dirs.set(b, (dirs.get(b) ?? 0) - cancel)
      }
    }
    if ([...dirs.values()].some((count) => count > 0))
      counts.set(item.id, dirs)
  }
  if (counts.size === 0) return { items, moved: false }

  // Official check-list order: the whole `fall` group first, then
  // fallright, fallup, fallleft — each direction listed once per
  // surviving count.
  const checks: Array<{ id: number; dir: Direction }> = []
  for (const dir of FALL_GROUP_ORDER)
    for (const [id, dirs] of counts)
      for (let i = 0; i < (dirs.get(dir) ?? 0); i += 1)
        checks.push({ id, dir })

  const fallen = new Map<number, Direction>()
  let current = items
  let moved = false

  for (let pass = 0; pass < MAX_FALL_PASSES; pass += 1) {
    let passMoved = false
    for (const { id, dir } of checks) {
      if (pass === 0) {
        // `fallen` latches the first listed direction — recorded whether
        // or not the unit actually moves there.
        if (!fallen.has(id)) fallen.set(id, dir)
      } else if (fallen.get(id) !== dir) {
        continue
      }

      // Each entry falls its unit to ground before the next entry runs.
      for (;;) {
        const before = current.find((item) => item.id === id)
        if (!before) break
        const { x, y } = before
        const step = moveItems(
          current,
          dir,
          runtime,
          (item) => item.id === id,
          false,
          false,
          true,
        )
        const after = step.items.find((item) => item.id === id)
        if (!after || after.x !== x || after.y !== y) {
          current = step.items
          moved = true
          passMoved = true
          if (!after) break
          continue
        }
        // The unit stayed put — keep any side effects (dir aim, removals)
        // but the descent is over.
        if (step.moved) {
          current = step.items
          moved = true
          passMoved = true
        }
        break
      }
    }
    if (!passMoved) break
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
