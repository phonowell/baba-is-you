import { appendEmptyHasSpawns, resolveEmptyPropsByCell } from '../empty.js'
import {
  matchesRuleObjectWord,
  matchesRuleSubject,
  subjectRuleCandidates,
} from '../rule-match.js'
import {
  appendHasSpawns,
  hasLatchedFloat,
  hasProp,
  isLevelConditionPositionFree,
  keyFor,
  LOCKED_PROPS,
  MOVE_DELTAS,
  resolveLevelProps,
} from './shared.js'

import type { RuleMatchContext } from '../rule-match.js'
import type { Direction, Item, Rule } from '../types.js'

export type MoveCoreContext = {
  byId: Map<number, Item>
  // Frozen-board bookkeeping for the single-move engine. The official
  // engine resolves a whole take iteration against the board as it was —
  // queued moves apply only when the iteration's movelist drains — so a
  // unit displaced during this pass still occupies its origin cell for
  // every later check, while the cell it lands in does not count it yet.
  // `movePass` is the current fixpoint iteration (≈ official take
  // iteration); `passMoved`/`passDeparted` reset each pass, matching the
  // per-iteration movelist drain.
  movePass: number
  passMoved: Set<number>
  passDeparted: Map<number, Item[]>
  // First-departure origin per unit this pass (id → origin cell key) —
  // the frozen-board position a re-queued push/pull applies its delta
  // from (officially every movelist entry teleports the unit to its
  // queued origin + direction, so a unit pushed by two chains in one
  // drain moves twice).
  passOrigins: Map<number, number>
  // Official `pushedunits` dedup — `${pusher cell key}:${unit id}` — one
  // queued move per (pusher origin, target) pair per pass.
  pushQueued: Set<string>
  // Root movers that deferred a push this pass (official state-0 →
  // state-1 advance) — they produced no movement but are still live, so
  // the fixpoint must run another iteration; a `weak` deferrer is not
  // yet a crash.
  deferredIds: Set<number>
  // `x eat y` resolves at move time (official `eat` specials): the
  // mover consumes a same-float-layer, non-`safe` target on entry —
  // even a `stop` target never blocks an eater. Absent eat rules make
  // this a constant false.
  eats: (mover: Item, target: Item) => boolean
  // `x eat empty` frees the empty cell for the mover — the official
  // empty branch skips the whole estop check once `valid` is false.
  // The empty pseudo-unit's float/safe come from that cell's `empty is
  // float`/`empty is safe` props, so the check is per-cell.
  eatsEmpty: (mover: Item, x: number, y: number) => boolean
  // Cells whose `empty` pseudo-unit was destroyed this pass (official
  // `delete(2, x, y)` — once per cell per turn). After the move pass
  // each dead cell drops its `empty has x` contents.
  deadEmptyCells: Set<number>
  grid: Map<number, Item[]>
  height: number
  openIds: Set<number>
  phantomIds: Set<number>
  pullIds: Set<number>
  pushIds: Set<number>
  removed: Set<number>
  removedItems: Item[]
  shutIds: Set<number>
  stillIds: Set<number>
  stopIds: Set<number>
  weakIds: Set<number>
  width: number
}

export const isLockedFor = (item: Item, direction: Direction): boolean =>
  hasProp(item, LOCKED_PROPS[direction])

// The frozen-board bookkeeping fields both engines seed identically —
// one pass's movelist state (see MoveCoreContext for the semantics).
export const createFrozenPassState = (): Pick<
  MoveCoreContext,
  | 'movePass'
  | 'passMoved'
  | 'passDeparted'
  | 'passOrigins'
  | 'pushQueued'
  | 'deferredIds'
> => ({
  movePass: 0,
  passMoved: new Set(),
  passDeparted: new Map(),
  passOrigins: new Map(),
  pushQueued: new Set(),
  deferredIds: new Set(),
})

// `x eat y` is evaluated at move time in the official engine: the eater
// consumes each same-float-layer, non-`safe` target it steps onto, and an
// eaten obstacle never blocks (the official `eat` special sets
// `valid=false`, skipping the whole stop/push/pull verdict).
export const createEatsPredicates = (
  eatRules: Rule[],
  context: RuleMatchContext,
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>,
): Pick<MoveCoreContext, 'eats' | 'eatsEmpty'> => {
  if (!eatRules.length) return { eats: () => false, eatsEmpty: () => false }
  const eats = (mover: Item, target: Item): boolean => {
    // Official gates: `issafe` on the target protects it, and `floating`
    // requires matching float layers (latched `values[FLOAT]`, not the
    // live rule set).
    if (hasProp(target, 'safe')) return false
    if (hasLatchedFloat(mover) !== hasLatchedFloat(target)) return false
    // `hasfeature` evaluates the rule's conditions at the destination
    // cell (`x+ox,y+oy`), not the mover's current position.
    const atTarget = { ...mover, x: target.x, y: target.y }
    for (const rule of subjectRuleCandidates(eatRules, mover)) {
      if (rule.subjectNegated) continue
      if (!matchesRuleSubject(atTarget, rule, context)) continue
      const matched = matchesRuleObjectWord(
        target,
        rule.object,
        context.groupMembers,
      )
      if (rule.objectNegated ? !matched : matched) return true
    }
    return false
  }
  const eatsEmpty = (mover: Item, x: number, y: number): boolean => {
    const props = emptyPropsAt(x, y)
    // `issafe(2)`/`floating(unitid,2)`: the cell's own `empty is safe`
    // protects it and `empty is float` sets the pseudo-unit's layer.
    // Unit side is the latched float; the empty side stays a fresh rule
    // read — `floating()` calls `hasfeature` for pseudo-unit 2.
    if (props.has('safe')) return false
    if (hasLatchedFloat(mover) !== props.has('float')) return false
    const atCell = { ...mover, x, y }
    for (const rule of subjectRuleCandidates(eatRules, mover)) {
      if (rule.subjectNegated || rule.objectNegated) continue
      if (rule.object !== 'empty') continue
      if (matchesRuleSubject(atCell, rule, context)) return true
    }
    return false
  }
  return { eats, eatsEmpty }
}

// Official `canmove` empty branch, per cell: `still`/`locked<dir>`
// cancels `swap` first; a cell with no remaining push/swap is enterable
// unless `stop`/`pull` walls it off, while a still `push`/`swap` empty
// can't be displaced and blocks outright.
export const emptyBlocked = (
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>,
  x: number,
  y: number,
  dir: Direction,
): boolean => {
  const props = emptyPropsAt(x, y)
  const estill = props.has('still') || props.has(LOCKED_PROPS[dir])
  const eswap = props.has('swap') && !estill
  if (!props.has('push') && !eswap)
    return props.has('pull') || props.has('stop')
  return estill
}

// A pushable empty forwards the push along `dir` until the chain lands
// on a non-push empty, real units, or the board edge (which blocks).
export const emptyForwardsPush = (
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>,
  x: number,
  y: number,
  dir: Direction,
): boolean => {
  const props = emptyPropsAt(x, y)
  return (
    props.has('push') &&
    !props.has('swap') &&
    !props.has('still') &&
    !props.has(LOCKED_PROPS[dir])
  )
}

export const inBounds = (
  context: MoveCoreContext,
  x: number,
  y: number,
): boolean => x >= 0 && y >= 0 && x < context.width && y < context.height

const isOpenShutPair = (
  context: MoveCoreContext,
  a: Item,
  b: Item,
): boolean =>
  (context.openIds.has(a.id) && context.shutIds.has(b.id)) ||
  (context.shutIds.has(a.id) && context.openIds.has(b.id))

// Official `lock` special: an `open`/`shut` contact annihilates on
// entry only when the pair shares a float layer and at least one side
// is not `safe` — each side then dies only if it is itself unsafe.
export const isLockCollision = (
  context: MoveCoreContext,
  mover: Item,
  target: Item,
): boolean =>
  isOpenShutPair(context, mover, target) &&
  hasLatchedFloat(mover) === hasLatchedFloat(target) &&
  (!hasProp(mover, 'safe') || !hasProp(target, 'safe'))

// Official empty-branch specials (movement.lua ~1131): an open/shut
// mover meeting the cell's opposite `empty is <partner>` prop locks on
// contact — the empty pseudo-unit dies when unsafe, and an unsafe mover
// dies at its own cell instead of landing. A `safe` pair never fires.
export const emptyLockHit = (
  context: MoveCoreContext,
  mover: Item,
  emptyProps: ReadonlySet<string>,
): boolean =>
  ((context.openIds.has(mover.id) && emptyProps.has('shut')) ||
    (context.shutIds.has(mover.id) && emptyProps.has('open'))) &&
  hasLatchedFloat(mover) === emptyProps.has('float') &&
  (!hasProp(mover, 'safe') || !emptyProps.has('safe'))

// Official empty-branch `weak`: the empty cell crumbles on entry (its
// `empty has x` drops later) and the mover lands — the mover's own
// `safe` does not matter, only `issafe(2)` gates the empty's death.
export const emptyWeakHit = (
  mover: Item,
  emptyProps: ReadonlySet<string>,
): boolean =>
  emptyProps.has('weak') &&
  !emptyProps.has('safe') &&
  hasLatchedFloat(mover) === emptyProps.has('float')

// Official check() empty branch shared by both engines: the landing
// cell's empty pseudo-unit dies for `x eat empty`, an open/shut lock
// pair, or `empty is weak` — returns the lock verdict so the caller can
// kill an unsafe mover at its origin (`gone` skips the position update).
export const markEmptyLandingSpecials = (
  context: MoveCoreContext & {
    emptyPropsAt: (x: number, y: number) => ReadonlySet<string>
  },
  item: Item,
  x: number,
  y: number,
): boolean => {
  const emptyProps = context.emptyPropsAt(x, y)
  const lockHit = emptyLockHit(context, item, emptyProps)
  if (
    context.eatsEmpty(item, x, y) ||
    lockHit ||
    emptyWeakHit(item, emptyProps)
  )
    context.deadEmptyCells.add(keyFor(x, y, context.width))
  return lockHit
}

export type MovementSets = {
  byId: Map<number, Item>
  movers: Array<{ id: number; x: number; y: number }>
  moverIds: Set<number>
  pushIds: Set<number>
  stopIds: Set<number>
  pullIds: Set<number>
  swapIds: Set<number>
  openIds: Set<number>
  shutIds: Set<number>
  weakIds: Set<number>
  stillIds: Set<number>
  phantomIds: Set<number>
  // `level is hold` pins — unlike `still`, a pinned unit can't move under
  // its own power either. Filled by pinLevelHeldUnits.
  pinnedIds: Set<number>
  // `x is hold` carrying needs a pre-move seat snapshot — the flag lets
  // callers skip building it when no unit carries the prop.
  hasHolder: boolean
}

// Bucket the board's movement props into id sets once — every downstream
// check (push/pull verdicts, specials, carry) reads the same sets.
// `word` units stay soft objects — the prop lets them stand in for their
// noun in rules only; it does not grant push. `isMover` additionally
// registers self-driven movers in creation order.
export const collectMovementSets = (
  items: Item[],
  isMover?: (item: Item) => boolean,
): MovementSets => {
  const sets: MovementSets = {
    byId: new Map(),
    movers: [],
    moverIds: new Set(),
    pushIds: new Set(),
    stopIds: new Set(),
    pullIds: new Set(),
    swapIds: new Set(),
    openIds: new Set(),
    shutIds: new Set(),
    weakIds: new Set(),
    stillIds: new Set(),
    phantomIds: new Set(),
    pinnedIds: new Set(),
    hasHolder: false,
  }
  for (const item of items) {
    sets.byId.set(item.id, item)
    if (isMover?.(item)) {
      sets.movers.push({ id: item.id, x: item.x, y: item.y })
      sets.moverIds.add(item.id)
    }
    for (const prop of item.props) {
      if (prop === 'push') sets.pushIds.add(item.id)
      else if (prop === 'stop') sets.stopIds.add(item.id)
      else if (prop === 'pull') sets.pullIds.add(item.id)
      else if (prop === 'swap') sets.swapIds.add(item.id)
      else if (prop === 'open') sets.openIds.add(item.id)
      else if (prop === 'shut') sets.shutIds.add(item.id)
      else if (prop === 'weak') sets.weakIds.add(item.id)
      else if (prop === 'still') sets.stillIds.add(item.id)
      else if (prop === 'phantom') sets.phantomIds.add(item.id)
      else if (prop === 'hold') sets.hasHolder = true
    }
  }
  return sets
}

// `still` units cannot be moved by external forces; `phantom` units
// neither block nor get carried — both strip the affected ids from the
// movement-prop sets so every downstream check sees it uniformly. `swap`
// is stripped too: a blocked mover must not trade places either.
export const stripBlockedMoveProps = (sets: MovementSets): void => {
  for (const id of sets.stillIds) {
    sets.pushIds.delete(id)
    sets.pullIds.delete(id)
    sets.swapIds.delete(id)
  }
  for (const id of sets.phantomIds) {
    sets.pushIds.delete(id)
    sets.pullIds.delete(id)
    sets.swapIds.delete(id)
    sets.stopIds.delete(id)
    sets.openIds.delete(id)
    sets.shutIds.delete(id)
    sets.weakIds.delete(id)
  }
}

// `level is hold` pins every unit touching the map frame (the official
// `cantmove` levelhold check) — held units can't move or be carried.
// Conditions evaluate at each unit's contact cell.
export const pinLevelHeldUnits = (
  levelRules: Rule[],
  context: RuleMatchContext,
  items: Item[],
  width: number,
  height: number,
  sets: MovementSets,
): void => {
  const hasLevelHoldRule = levelRules.some(
    (rule) => !rule.objectNegated && rule.object === 'hold',
  )
  if (!hasLevelHoldRule) return
  // Position-independent level rules resolve identically at every
  // contact cell — one resolve serves all border units.
  const sharedLevelProps = levelRules.every(
    (rule) =>
      !rule.condition || isLevelConditionPositionFree(rule.condition),
  )
    ? resolveLevelProps(levelRules, context, 0, 0)
    : undefined
  for (const item of items) {
    const atBorder =
      item.x === 0 ||
      item.y === 0 ||
      item.x === width - 1 ||
      item.y === height - 1
    if (!atBorder) continue
    const levelProps =
      sharedLevelProps ??
      resolveLevelProps(levelRules, context, item.x, item.y)
    if (hasLatchedFloat(item) !== levelProps.has('float')) continue
    if (!levelProps.has('hold')) continue
    sets.pinnedIds.add(item.id)
    sets.stillIds.add(item.id)
    sets.pushIds.delete(item.id)
    sets.pullIds.delete(item.id)
    sets.swapIds.delete(item.id)
  }
}

// Shared opening of a movement pass: collect the per-cell prop sets for
// the working items, strip props whose carriers can no longer move,
// then pin units the level still holds. Both engines start here before
// their orchestration diverges.
export const openMovementSets = (
  levelRules: Rule[],
  context: RuleMatchContext,
  items: Item[],
  width: number,
  height: number,
  isMover?: (item: Item) => boolean,
): MovementSets => {
  const sets = collectMovementSets(items, isMover)
  stripBlockedMoveProps(sets)
  pinLevelHeldUnits(levelRules, context, items, width, height, sets)
  return sets
}

// Per-cell `empty is <prop>` resolution for the move engines plus the
// shared board-edge fallback for cell queries.
export const createEmptyPropLookup = (
  rules: Rule[],
  items: Item[],
  width: number,
  height: number,
  context: RuleMatchContext,
): {
  emptyPropsByCell: ReadonlyMap<number, ReadonlySet<string>>
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>
} => {
  const emptyPropsByCell = resolveEmptyPropsByCell(
    rules,
    items,
    width,
    height,
    context,
  )
  const EMPTY_PROPS: ReadonlySet<string> = new Set()
  return {
    emptyPropsByCell,
    emptyPropsAt: (x, y) =>
      emptyPropsByCell.get(keyFor(x, y, width)) ?? EMPTY_PROPS,
  }
}

// Post-move drops: removed units release their `x has y` contents, and
// each empty cell destroyed by an entry special drops its `empty has x`
// contents on the vacated cell.
export const appendMovementSpawns = (
  survivors: Item[],
  removedItems: Item[],
  deadEmptyCells: Set<number>,
  buckets: { has: Rule[]; isProperty: Rule[] },
  width: number,
  height: number,
  sourceItems: Item[],
): { items: Item[]; changed: boolean } => {
  const spawned = appendHasSpawns(
    survivors,
    removedItems,
    buckets.has,
    width,
    height,
    sourceItems,
  )
  if (!deadEmptyCells.size) return spawned
  const dropped = appendEmptyHasSpawns(
    spawned.items,
    deadEmptyCells,
    buckets.has,
    buckets.isProperty,
    width,
    height,
  )
  return { items: dropped.items, changed: spawned.changed || dropped.changed }
}

export const removeOne = (context: MoveCoreContext, item: Item): boolean => {
  if (context.removed.has(item.id)) return false
  // `safe` units survive every removal path that routes through the move
  // engines (weak crumble, open/shut pairs).
  if (hasProp(item, 'safe')) return false
  context.removed.add(item.id)
  context.removedItems.push(item)
  // Dead units stay queryable by id — like the official `mmf` object —
  // because a killed mover's `moving_units` entry keeps processing its
  // state machine (its push side-effects still apply). Grid removal is
  // what makes it stop blocking.

  const cellKey = keyFor(item.x, item.y, context.width)
  const cellItems = context.grid.get(cellKey) ?? []
  context.grid.set(
    cellKey,
    cellItems.filter((other) => other.id !== item.id),
  )
  return true
}

export const moveOne = (
  context: MoveCoreContext,
  item: Item,
  nx: number,
  ny: number,
): boolean => {
  if (item.x === nx && item.y === ny) return false

  const oldKey = keyFor(item.x, item.y, context.width)
  const oldList = context.grid.get(oldKey) ?? []
  context.grid.set(
    oldKey,
    oldList.filter((other) => other.id !== item.id),
  )

  // First departure this pass: record the unit at its origin cell so
  // forward lookups keep seeing it (officially it stays there until the
  // iteration's movelist drains), and remember the origin for re-queued
  // push deltas.
  if (!context.passMoved.has(item.id)) {
    context.passOrigins.set(item.id, oldKey)
    const departed = context.passDeparted.get(oldKey)
    if (departed === undefined) context.passDeparted.set(oldKey, [item])
    else departed.push(item)
  }

  item.x = nx
  item.y = ny

  const newKey = keyFor(nx, ny, context.width)
  const newList = context.grid.get(newKey) ?? []
  newList.push(item)
  context.grid.set(newKey, newList)
  context.passMoved.add(item.id)
  return true
}

type EmptyPullContext = MoveCoreContext & {
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>
  swapIds: Set<number>
  pinnedIds?: Set<number>
}

// Official `empty is pull` (movement.lua check(): the pull scan on a
// unit-free cell returns pseudo-unit 2 when `empty` is pullable there).
// The dragged empty pulls the cell behind IT, so the pull propagates
// through consecutive pull-empties until it reaches real pullable
// cargo — which lands on the last vacated pull-empty cell. `still`/
// `locked<dir>` empties refuse (official `estop`) and end the chain, as
// does a unit-free non-pull cell or the board edge.
export const traceEmptyPullCargo = (
  context: EmptyPullContext,
  occupants: (x: number, y: number) => readonly Item[],
  x: number,
  y: number,
  dir: Direction,
): Item[] => {
  const [dx, dy] = MOVE_DELTAS[dir]
  const pullable = (cx: number, cy: number): boolean => {
    const props = context.emptyPropsAt(cx, cy)
    return (
      props.has('pull') &&
      !props.has('still') &&
      !props.has(LOCKED_PROPS[dir])
    )
  }
  if (!inBounds(context, x, y) || occupants(x, y).length || !pullable(x, y))
    return []
  let cx = x - dx
  let cy = y - dy
  while (inBounds(context, cx, cy)) {
    const cell = occupants(cx, cy)
    if (cell.length)
      return cell.filter((unit) => context.pullIds.has(unit.id))
    if (!pullable(cx, cy)) return []
    cx -= dx
    cy -= dy
  }
  return []
}

// The root empty pull is validated officially (trypush on the
// pseudo-unit): its landing cell is the mover's own — still physically
// occupied until the movelist drains — where the puller itself is
// exempt (`hms[i] ~= pusherid`) but any other solid occupant vetoes the
// pull. Pushable or prop-free co-occupants don't veto; the push
// side-effect itself is unmodelled.
export const emptyPullRootBlocked = (
  context: EmptyPullContext,
  occupants: (x: number, y: number) => readonly Item[],
  mover: Item,
  dir: Direction,
): boolean =>
  occupants(mover.x, mover.y).some((unit) => {
    if (unit.id === mover.id || context.phantomIds.has(unit.id))
      return false
    const cantMove =
      context.stillIds.has(unit.id) ||
      isLockedFor(unit, dir) ||
      (context.pinnedIds?.has(unit.id) ?? false)
    if (context.swapIds.has(unit.id) && !cantMove) return false
    if (
      context.weakIds.has(unit.id) &&
      hasLatchedFloat(unit) === hasLatchedFloat(mover)
    )
      return false
    if (context.pushIds.has(unit.id) && !cantMove) return false
    return context.stopIds.has(unit.id) || context.pullIds.has(unit.id) || cantMove
  })

const NO_ITEMS: Item[] = []

export const getLiveCellItems = (
  context: MoveCoreContext,
  x: number,
  y: number,
): Item[] => {
  if (!inBounds(context, x, y)) return NO_ITEMS
  const list = context.grid.get(keyFor(x, y, context.width)) ?? NO_ITEMS
  // Callers only read the result, so the live list can be shared whenever
  // nothing has been removed yet — which is most queries.
  if (!context.removed.size) return list
  return list.filter((target) => !context.removed.has(target.id))
}
