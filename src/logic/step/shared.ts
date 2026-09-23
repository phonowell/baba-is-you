import {
  keyFor as gridKeyFor,
  MOVE_DELTAS,
  resolveRuleTargets,
} from '../helpers.js'
import {
  createRuleMatchContext,
  matchesRuleSubject,
  subjectRuleCandidates,
} from '../rule-match.js'

import type { RuleMatchContext } from '../rule-match.js'

import { DIRECTIONS } from '../types.js'

import type { Direction, Item, Property, Rule } from '../types.js'

export { MOVE_DELTAS }

export const keyFor = (x: number, y: number, width: number): number =>
  gridKeyFor(x, y, width)

export const hasProp = (item: Item, prop: Item['props'][number]): boolean =>
  item.props.includes(prop)

// Official `unit.values[FLOAT]` — the per-unit float LATCH `floating()`
// reads instead of live rules: `statusblock()` samples it once at
// `movecommand` entry (blocks.lua:373-384), so a float rule formed
// mid-turn doesn't change layer checks until the next step. Use this for
// unit-vs-unit (and unit-vs-empty/level) layer parity; `empty`/`level`
// pseudo-units have no latch — their float stays a fresh rule read.
export const hasLatchedFloat = (item: Item): boolean =>
  item.floatLatch === true

// `you`/`you2`/`3d` are the official control layers — all respond to input
// and count for win/defeat/lose checks.
const YOU_LIKE_PROPS = new Set(['you', 'you2', '3d'])

export const isYouLike = (item: Item): boolean =>
  item.props.some((prop) => YOU_LIKE_PROPS.has(prop))

// Same you-layer check on a resolved prop set (empty cells, the level
// entity) — those carry no Item, so they can't go through isYouLike.
export const hasYouLikeProp = (props: ReadonlySet<string>): boolean =>
  props.has('you') || props.has('you2') || props.has('3d')

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

// `level is <prop>`: the level entity is the map frame — its props apply
// to units touching a border cell (official `hasfeature("level",…,1,i,j)`).
// `level is float` lifts the contact onto the float layer. Conditional
// rules (`level is weak without x`) evaluate at the contact cell — pass a
// position plus the rule context; without one only unconditional rules
// count (plus conditions that don't need a position, like `without`).
export const resolveLevelProps = (
  levelRules: Rule[],
  context?: RuleMatchContext,
  x?: number,
  y?: number,
): Set<Property> => {
  const yes = new Set<string>()
  const no = new Set<string>()
  const hasPosition = context !== undefined && x !== undefined && y !== undefined
  const levelItem = hasPosition
    ? { id: -1, name: 'level', x: x ?? 0, y: y ?? 0, isText: false }
    : undefined
  // `levelRules` is the runtime bucket: `is-property` rules with a positive
  // `level` subject — exactly the rules this loop's filters would keep.
  for (const rule of levelRules) {
    if (rule.condition) {
      if (!levelItem || !context) continue
      if (!matchesRuleSubject(levelItem, rule, context)) continue
    }
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }
  const active = new Set<Property>()
  for (const prop of yes)
    if (!no.has(prop)) active.add(prop as Property)
  return active
}

// Global level-prop evaluation (official `testcond(conds,1)` on the
// virtual level entity): each rule's condition is OR'd across every
// border cell — the level entity spans the whole map frame, so a rule
// whose condition holds at any edge applies to it. Verdicts accumulate
// per rule into one yes-set and one no-set, then `yes − no` decides the
// props — a matched negation vetoes the prop outright, wherever its
// positive counterpart matched.
//
// Two prune passes keep the border sweep proportional to what can still
// change the verdicts:
// - Conditions that never read the pseudo-item's position (`idle`,
//   `powered*`, `without`, direction-only `facing`) produce the same
//   verdict at every cell, so they resolve once against the (0,0)
//   pseudo-item instead of per cell.
// - Once a rule's verdict is recorded (`yes` for positives, `no` for
//   negatives), later cells can't undo it — OR only ever adds verdicts —
//   so decided rules skip further evaluation entirely. A positive is
//   also moot once its object is buried in `no`.
const POSITION_INDEPENDENT_CONDITIONS = new Set([
  'idle',
  'powered',
  'powered2',
  'powered3',
  'without',
])

// A level-rule condition that returns the same verdict at every contact
// cell — callers holding many border positions can then resolve the
// rule set once instead of per cell.
export const isLevelConditionPositionFree = (
  condition: NonNullable<Rule['condition']>,
): boolean =>
  'direction' in condition ||
  POSITION_INDEPENDENT_CONDITIONS.has(condition.kind)

export const resolveLevelPropsGlobal = (
  levelRules: Rule[],
  context: RuleMatchContext,
  width: number,
  height: number,
): Set<Property> => {
  const yes = new Set<string>()
  const no = new Set<string>()
  const pending: Rule[] = []
  const levelItem = { id: -1, name: 'level', x: 0, y: 0, isText: false }
  // Whether this rule's verdict can no longer change the outcome: a
  // positive is moot once its object sits in either set (yes is
  // idempotent; no already buries the prop), while a negative must keep
  // evaluating until its object lands in `no` — `yes` alone does not
  // seal it, since the veto is exactly what could still flip the prop.
  const decided = (rule: Rule): boolean =>
    rule.objectNegated
      ? no.has(rule.object)
      : yes.has(rule.object) || no.has(rule.object)

  // Unconditional rules always apply; position-free conditionals get
  // their one verdict here — matched or not, they contribute nothing
  // further at other cells.
  for (const rule of levelRules) {
    if (rule.condition && !isLevelConditionPositionFree(rule.condition)) {
      pending.push(rule)
      continue
    }
    if (rule.condition && !matchesRuleSubject(levelItem, rule, context))
      continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  for (let y = 0; y < height && pending.length; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1)
        continue
      if (pending.every(decided)) {
        y = height
        break
      }
      levelItem.x = x
      levelItem.y = y
      for (const rule of pending) {
        if (decided(rule)) continue
        if (!matchesRuleSubject(levelItem, rule, context)) continue
        if (rule.objectNegated) no.add(rule.object)
        else yes.add(rule.object)
      }
    }
  }

  const props = new Set<Property>()
  for (const prop of yes) if (!no.has(prop)) props.add(prop as Property)
  return props
}

// `locked*` blocks any move in that direction — self-propelled or pushed.
export const LOCKED_PROPS: Record<Direction, Property> = {
  right: 'lockedright',
  up: 'lockedup',
  left: 'lockedleft',
  down: 'lockeddown',
}

// `nudge*` props are self-movement in a fixed direction — the official
// `findallfeature(is nudge*)` feeds them into `moving_units` like `move`.
export const NUDGE_DIRS: Record<string, Direction> = {
  nudgeright: 'right',
  nudgeup: 'up',
  nudgeleft: 'left',
  nudgedown: 'down',
}

const LEVEL_NUDGE_DIRS = Object.entries(NUDGE_DIRS)

// `level is you/move/…` scrolls the whole room — official `MF_scrollroom`
// only shifts the render offset (`Xoffset`/`Yoffset`), so logical
// positions and rule adjacency never change. We accumulate the same
// offset in `state.levelOffset` (wrapping at the edges) for the renderer.
// `mapdir` is the level's own facing, driven by `level is <dir>` rules and
// updated by `level is you` scrolls; it steers `move`/`auto`/`fall*`.
// `still` blocks every scroll, `locked<dir>` blocks that direction,
// `sleep` blocks the autonomous ones, `reverse` flips directions.
export const advanceLevelRoom = (
  levelRules: Rule[],
  context: RuleMatchContext,
  direction: Direction | null,
  levelDir: Direction,
  offset: { x: number; y: number },
  width: number,
  height: number,
  turn: number,
): { offset: { x: number; y: number }; dir: Direction; changed: boolean } => {
  // Scroll/rotation gating evaluates at the level entity's nominal cell —
  // global conditions (`without`, `powered`) work there; positional ones
  // bind to the corner, matching the official contact-cell convention.
  const levelProps = resolveLevelProps(levelRules, context, 0, 0)
  if (!levelProps.size) return { offset, dir: levelDir, changed: false }

  const still = levelProps.has('still')
  const reverse = levelProps.has('reverse')
  const sleep = levelProps.has('sleep')
  let dir = levelDir

  // `level is <dir>` rotates the room to face that direction — applied
  // during rule processing, before any scroll this turn. The last
  // matching rule wins, like the official featureindex iteration.
  for (const rule of levelRules) {
    if (
      !rule.condition &&
      !rule.objectNegated &&
      (rule.object === 'right' ||
        rule.object === 'up' ||
        rule.object === 'left' ||
        rule.object === 'down')
    )
      dir = rule.object as Direction
  }
  let dx = 0
  let dy = 0
  let changed = false
  const scroll = (scrollDir: Direction, amount: number): boolean => {
    if (still || levelProps.has(LOCKED_PROPS[scrollDir]))
      return false
    const [ox, oy] = MOVE_DELTAS[scrollDir]
    dx += ox * amount
    dy += oy * amount
    changed = true
    return true
  }

  // `level is you`/`you2` scrolls with the player input and turns the
  // room to face that way (official `mapdir = levelmovedir`). A blocked
  // scroll keeps the old facing — `cantmove` failure skips the update.
  // Note: `level is sleep` does not block the you-scroll — the official
  // levelmove path only checks `cantmove` (still/locked), not sleep.
  if (direction && (levelProps.has('you') || levelProps.has('you2'))) {
    const moveDir = reverse ? reverseDirection(direction) : direction
    if (scroll(moveDir, 1)) dir = moveDir
  }

  if (!sleep) {
    if (levelProps.has('move') || levelProps.has('auto')) {
      scroll(reverse ? reverseDirection(dir) : dir, 1)
    }
    if (levelProps.has('chill')) {
      // Officially `fixedrandom` — a deterministic per-turn pick.
      const chillDir = DIRECTIONS[(turn * 2654435761) % 4] ?? 'down'
      dir = chillDir
      scroll(reverse ? reverseDirection(chillDir) : chillDir, 1)
    }
    for (const [prop, nudgeDir] of LEVEL_NUDGE_DIRS) {
      if (!levelProps.has(prop as Property)) continue
      scroll(reverse ? reverseDirection(nudgeDir) : nudgeDir, 1)
    }
    // `fall` drops the room a large fixed distance (official 20/35 cells).
    const FALL_DROP: Record<string, number> = {
      fall: 20,
      fallup: 20,
      fallleft: 35,
      fallright: 35,
    }
    for (const [prop, fallDir] of [
      ['fall', 'down'],
      ['fallup', 'up'],
      ['fallleft', 'left'],
      ['fallright', 'right'],
    ] as const) {
      if (!levelProps.has(prop)) continue
      const fallMove = reverse ? reverseDirection(fallDir) : fallDir
      scroll(fallMove, FALL_DROP[prop] ?? 20)
    }
  }

  if (!changed && dir === levelDir) return { offset, dir, changed: false }
  const wrap = (value: number, size: number): number =>
    ((value % size) + size) % size
  return {
    offset: {
      x: wrap(offset.x + dx, width),
      y: wrap(offset.y + dy, height),
    },
    dir,
    changed: true,
  }
}

// `level is push`/`pull`: the map frame is pushed/pulled by units
// working against it (official `obs == -1` level-push / pull check).
// Push: a `you` unit pressed outward at the border that couldn't move
// transfers the push to the room — it scrolls in the input direction.
// Pull: a `you` unit leaving a border cell pulls the room along — it
// scrolls with the unit. Blocked by `level is still`/`locked<dir>` via
// the same `scroll` gating as autonomous scrolls.
export const levelPushPullDelta = (
  before: Item[],
  after: Item[],
  levelRules: Rule[],
  context: RuleMatchContext,
  direction: Direction,
  width: number,
  height: number,
): { dx: number; dy: number } | null => {
  // No `level is push/pull` rule (of either polarity — conditional rules
  // still evaluate per contact cell) means the scan can never produce a
  // delta: skip the position diff entirely.
  if (
    !levelRules.some(
      (rule) => rule.object === 'push' || rule.object === 'pull',
    )
  )
    return null
  const still = resolveLevelProps(levelRules, context, 0, 0)
  if (still.has('still') || still.has('sleep')) return null

  const beforeById = new Map<number, Item>()
  for (const item of before) beforeById.set(item.id, item)
  const [dx, dy] = MOVE_DELTAS[direction]
  const lockedProp = LOCKED_PROPS[direction]
  let outX = 0
  let outY = 0

  for (const item of after) {
    if (!isYouLike(item)) continue
    if (
      hasProp(item, 'sleep') ||
      hasProp(item, 'broken') ||
      hasProp(item, 'still') ||
      (lockedProp ? hasProp(item, lockedProp) : false)
    )
      continue
    const prev = beforeById.get(item.id)
    if (!prev) continue

    // Push: unmoved unit pressed against the outward edge.
    const pushEdge =
      (dx > 0 && item.x === width - 1) ||
      (dx < 0 && item.x === 0) ||
      (dy > 0 && item.y === height - 1) ||
      (dy < 0 && item.y === 0)
    if (
      pushEdge &&
      item.x === prev.x &&
      item.y === prev.y
    ) {
      const contact = resolveLevelProps(levelRules, context, item.x, item.y)
      // A `level is hold`-pinned unit never attempts the move, so it
      // can't transfer a push to the frame either.
      if (contact.has('push') && !contact.has('hold')) {
        outX += dx
        outY += dy
      }
      continue
    }

    // Pull: unit left a border cell facing away — the frame follows.
    const pulled =
      item.x === prev.x + dx &&
      item.y === prev.y + dy &&
      ((dx > 0 && prev.x === 0) ||
        (dx < 0 && prev.x === width - 1) ||
        (dy > 0 && prev.y === 0) ||
        (dy < 0 && prev.y === height - 1))
    if (
      pulled &&
      resolveLevelProps(levelRules, context, prev.x, prev.y).has('pull')
    ) {
      outX += dx
      outY += dy
    }
  }

  if (!outX && !outY) return null
  return { dx: outX, dy: outY }
}

export const splitByFloatLayer = (items: Item[]): Item[][] => {
  const floating = items.filter((item) => hasLatchedFloat(item))
  const grounded = items.filter((item) => !hasLatchedFloat(item))
  const result: Item[][] = []
  if (floating.length) result.push(floating)
  if (grounded.length) result.push(grounded)
  return result
}

// `x is hold` riders: items sharing a holder's tile (same float layer)
// get carried along when the holder moves — the official `unit.holder`
// link in blocks.lua. Riders that moved under their own power keep their
// new position; only ones still sitting on the vacated cell are carried.
// `still` and `level is hold`-pinned riders can't be carried — carry is
// an external force, so the caller passes the set that blocks it.
export const carryHeldRiders = (
  before: ReadonlyMap<number, { x: number; y: number }>,
  items: Item[],
  removed: ReadonlySet<number>,
  width: number,
  height: number,
  uncarryable: ReadonlySet<number>,
): boolean => {
  let carried = false
  for (const holder of items) {
    if (removed.has(holder.id) || !hasProp(holder, 'hold')) continue
    const origin = before.get(holder.id)
    if (!origin) continue
    const dx = holder.x - origin.x
    const dy = holder.y - origin.y
    if (dx === 0 && dy === 0) continue
    const holderFloat = hasLatchedFloat(holder)
    for (const rider of items) {
      if (rider.id === holder.id || removed.has(rider.id)) continue
      if (uncarryable.has(rider.id)) continue
      const seat = before.get(rider.id)
      if (!seat || seat.x !== origin.x || seat.y !== origin.y) continue
      if (rider.x !== seat.x || rider.y !== seat.y) continue
      if (hasLatchedFloat(rider) !== holderFloat) continue
      const nx = rider.x + dx
      const ny = rider.y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      rider.x = nx
      rider.y = ny
      carried = true
    }
  }
  return carried
}

export const appendHasSpawns = (
  survivors: Item[],
  removedItems: Item[],
  hasRules: Rule[],
  width: number,
  height: number,
  sourceItems: Item[],
): { items: Item[]; changed: boolean } => {
  if (!hasRules.length || !removedItems.length)
    return { items: survivors, changed: false }
  const context = createRuleMatchContext(sourceItems, hasRules, width, height)

  let nextId =
    Math.max(
      survivors.reduce((max, item) => Math.max(max, item.id), 0),
      removedItems.reduce((max, item) => Math.max(max, item.id), 0),
    ) + 1
  const spawned: Item[] = []

  for (const item of removedItems) {
    const targets = resolveRuleTargets(
      item,
      subjectRuleCandidates(hasRules, item),
      (candidate, rule) => matchesRuleSubject(candidate, rule, context),
    )
    if (!targets.length) continue

    for (const target of targets) {
      if (target === 'empty') continue
      if (target === 'text') {
        // spawns inherit the removed entity's direction, matching the
        // predecessor's `dir: e.dir` on has-spawned entities
        spawned.push({
          id: nextId++,
          name: item.isText ? 'text' : item.name,
          x: item.x,
          y: item.y,
          isText: true,
          props: [],
          converted: true,
          spawned: true,
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
        converted: true,
        spawned: true,
        ...(item.dir ? { dir: item.dir } : {}),
      })
    }
  }

  if (!spawned.length) return { items: survivors, changed: false }
  return { items: [...survivors, ...spawned], changed: true }
}
