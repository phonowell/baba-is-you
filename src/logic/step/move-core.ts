import { matchesRuleObjectWord, matchesRuleSubject } from '../rule-match.js'
import { hasProp, keyFor } from './shared.js'

import type { RuleMatchContext } from '../rule-match.js'
import type { Direction, Item, Rule } from '../types.js'

export type MoveCoreContext = {
  byId: Map<number, Item>
  // Push-wave bookkeeping for the single-move engine. The official engine
  // resolves a whole push chain against the frozen board — queued updates
  // apply only when the mover's movelist drains — so a companion displaced
  // out of the pusher's own cell is not yet at the target cell when the
  // next stacked unit evaluates it. `moveWave` tags the current root push;
  // `movedWave` records which wave last displaced each unit, letting
  // forward-target lookups skip this wave's arrivals.
  moveWave: number
  movedWave: Map<number, number>
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

// `locked*` blocks any move in that direction — self-propelled or pushed.
export const LOCKED_PROPS: Record<Direction, Item['props'][number]> = {
  up: 'lockedup',
  right: 'lockedright',
  down: 'lockeddown',
  left: 'lockedleft',
}

export const isLockedFor = (item: Item, direction: Direction): boolean =>
  hasProp(item, LOCKED_PROPS[direction])

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
    // requires matching float layers.
    if (hasProp(target, 'safe')) return false
    if (hasProp(mover, 'float') !== hasProp(target, 'float')) return false
    // `hasfeature` evaluates the rule's conditions at the destination
    // cell (`x+ox,y+oy`), not the mover's current position.
    const atTarget = { ...mover, x: target.x, y: target.y }
    for (const rule of eatRules) {
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
    if (props.has('safe')) return false
    if (hasProp(mover, 'float') !== props.has('float')) return false
    const atCell = { ...mover, x, y }
    for (const rule of eatRules) {
      if (rule.subjectNegated || rule.objectNegated) continue
      if (rule.object !== 'empty') continue
      if (matchesRuleSubject(atCell, rule, context)) return true
    }
    return false
  }
  return { eats, eatsEmpty }
}

export const inBounds = (
  context: MoveCoreContext,
  x: number,
  y: number,
): boolean => x >= 0 && y >= 0 && x < context.width && y < context.height

export const isOpenShutPair = (
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
  hasProp(mover, 'float') === hasProp(target, 'float') &&
  (!hasProp(mover, 'safe') || !hasProp(target, 'safe'))

export const removeOne = (context: MoveCoreContext, item: Item): boolean => {
  if (context.removed.has(item.id)) return false
  // `safe` units survive every removal path that routes through the move
  // engines (weak crumble, open/shut pairs).
  if (hasProp(item, 'safe')) return false
  context.removed.add(item.id)
  context.removedItems.push(item)
  context.byId.delete(item.id)

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

  item.x = nx
  item.y = ny

  const newKey = keyFor(nx, ny, context.width)
  const newList = context.grid.get(newKey) ?? []
  newList.push(item)
  context.grid.set(newKey, newList)
  context.movedWave.set(item.id, context.moveWave)
  return true
}

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
