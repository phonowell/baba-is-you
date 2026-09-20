import { keyFor } from './helpers.js'
import { createRuleMatchContext, matchesRuleObjectWord } from './rule-match.js'
import { isPropertyRule } from './types.js'

import type { GroupMembers, RuleMatchContext } from './rule-match.js'

import type { Item } from './game-types.js'
import type { Direction, Property, Rule, RuleCondition } from './types.js'

type EmptyMatchItem = {
  id: number
  name: string
  x: number
  y: number
  isText: boolean
  dir?: Direction
}

type EmptyMatchContext = {
  byCell: Map<number, EmptyMatchItem[]>
  groupMembers: GroupMembers
  height: number
  width: number
  idle?: boolean
  turn?: number
}

const itemsAt = (
  context: EmptyMatchContext,
  x: number,
  y: number,
): EmptyMatchItem[] => context.byCell.get(keyFor(x, y, context.width)) ?? []

const emptyItemHasProp = (item: EmptyMatchItem, prop: string): boolean =>
  'props' in item &&
  Array.isArray(item.props) &&
  (item.props as Property[]).includes(prop as Property)

const matchesObjectAtCell = (
  context: EmptyMatchContext,
  x: number,
  y: number,
  object: string,
): boolean => {
  const cellItems = itemsAt(context, x, y)
  if (object === 'empty') return cellItems.length === 0
  return cellItems.some((item) =>
    matchesRuleObjectWord(item, object, context.groupMembers),
  )
}

const EMPTY_LINE_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

const scanEmptyLine = (
  context: EmptyMatchContext,
  x: number,
  y: number,
  object: string,
  dx: number,
  dy: number,
): boolean => {
  let nx = x + dx
  let ny = y + dy
  while (nx >= 0 && ny >= 0 && nx < context.width && ny < context.height) {
    if (matchesObjectAtCell(context, nx, ny, object)) return true
    nx += dx
    ny += dy
  }
  return false
}

const matchesEmptyCondition = (
  context: EmptyMatchContext,
  x: number,
  y: number,
  condition?: RuleCondition,
): boolean => {
  if (!condition) return true

  // Parameterless conditions on EMPTY cells: `idle`/`often`/`seldom`
  // behave exactly as for units (global input flag, deterministic roll);
  // `powered*` needs unit props, which empty cells never carry. `facing`
  // with a direction and `lonely` keep their dedicated branches below.
  if (
    !('object' in condition) &&
    !('direction' in condition) &&
    condition.kind !== 'lonely'
  ) {
    let matched = false
    if (condition.kind === 'idle') matched = context.idle === true
    else if (condition.kind === 'often' || condition.kind === 'seldom') {
      const sides = condition.kind === 'often' ? 4 : 6
      const hits = condition.kind === 'often' ? 3 : 1
      let hash = 2166136261
      const seed = `${context.turn ?? 0}:empty:${x},${y}:${condition.kind}`
      for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      matched = (hash >>> 0) % sides < hits
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'lonely') {
    const lonely = itemsAt(context, x, y).length === 0
    if (condition.negated) return !lonely
    return lonely
  }

  if (condition.kind === 'on') {
    const matched = matchesObjectAtCell(context, x, y, condition.object)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'nextto') {
    let matched = false
    for (const [dx, dy] of EMPTY_LINE_DELTAS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
        continue
      if (matchesObjectAtCell(context, nx, ny, condition.object))
        matched = true
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'near') {
    let matched = false
    for (let dy = -1; dy <= 1 && !matched; dy += 1) {
      for (let dx = -1; dx <= 1 && !matched; dx += 1) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
          continue
        if (matchesObjectAtCell(context, nx, ny, condition.object))
          matched = true
      }
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'above' || condition.kind === 'below') {
    const dy = condition.kind === 'above' ? 1 : -1
    const matched = scanEmptyLine(context, x, y, condition.object, 0, dy)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'besideleft' || condition.kind === 'besideright') {
    const dx = condition.kind === 'besideleft' ? 1 : -1
    const matched = scanEmptyLine(context, x, y, condition.object, dx, 0)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'without') {
    let matched = false
    if (condition.object === 'empty') {
      matched = context.byCell.size >= context.width * context.height
    } else {
      matched = true
      for (const list of context.byCell.values()) {
        if (
          list.some((item) =>
            matchesRuleObjectWord(item, condition.object, context.groupMembers),
          )
        ) {
          matched = false
          break
        }
      }
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'facedby') {
    let matched = false
    for (const [dx, dy] of EMPTY_LINE_DELTAS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
        continue
      for (const item of itemsAt(context, nx, ny)) {
        const dir = item.dir ?? 'right'
        const delta =
          dir === 'up'
            ? ([0, -1] as const)
            : dir === 'down'
              ? ([0, 1] as const)
              : dir === 'left'
                ? ([-1, 0] as const)
                : ([1, 0] as const)
        if (delta[0] === -dx && delta[1] === -dy)
          if (matchesRuleObjectWord(item, condition.object, context.groupMembers))
            matched = true
      }
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'seeing') {
    // Empty cells have no facing — treat sight as scanning all four
    // directions, stopping at hidden-free solid cells like the unit path.
    let matched = false
    for (const [dx, dy] of EMPTY_LINE_DELTAS) {
      let nx = x
      let ny = y
      while (true) {
        nx += dx
        ny += dy
        if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
          break
        const cell = itemsAt(context, nx, ny)
        const visible = cell.filter(
          (item) => !emptyItemHasProp(item, 'hide'),
        )
        for (const item of visible) {
          if (
            matchesRuleObjectWord(item, condition.object, context.groupMembers)
          )
            matched = true
        }
        const sightBlocked = visible.some(
          (item) =>
            !emptyItemHasProp(item, 'phantom') &&
            (emptyItemHasProp(item, 'stop') ||
              emptyItemHasProp(item, 'push') ||
              emptyItemHasProp(item, 'pull')),
        )
        if (sightBlocked) break
      }
      if (matched) break
    }
    return condition.negated ? !matched : matched
  }

  // `feeling` reads unit rules — empty cells have no props to feel.
  if (condition.kind === 'feeling')
    return condition.negated ?? false

  if ('direction' in condition) {
    const matched = condition.direction === 'right'
    return condition.negated ? !matched : matched
  }

  const nx = x + 1
  const ny = y
  if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
    return condition.negated ?? false

  const matched = matchesObjectAtCell(context, nx, ny, condition.object)
  return condition.negated ? !matched : matched
}

export const createEmptyMatchContext = (
  items: EmptyMatchItem[],
  rules: Rule[],
  width: number,
  height: number,
  extras?: { idle?: boolean; turn?: number },
): EmptyMatchContext => {
  const context = createRuleMatchContext(items, rules, width, height, extras)
  return {
    byCell: context.byCell as Map<number, EmptyMatchItem[]>,
    groupMembers: context.groupMembers,
    height,
    width,
    ...(context.idle !== undefined ? { idle: context.idle } : {}),
    ...(context.turn !== undefined ? { turn: context.turn } : {}),
  }
}

const collectEmptyRuleTargetsAt = (
  rules: Rule[],
  context: EmptyMatchContext,
  x: number,
  y: number,
  kind: Rule['kind'],
): { yes: Set<string>; no: Set<string> } => {
  const yes = new Set<string>()
  const no = new Set<string>()

  for (const rule of rules) {
    if (rule.kind !== kind) continue
    if (rule.subject !== 'empty') continue
    if (rule.subjectNegated) continue
    if (!matchesEmptyCondition(context, x, y, rule.condition)) continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  return { yes, no }
}

export const resolveEmptyRuleTargetsAt = (
  rules: Rule[],
  context: EmptyMatchContext,
  x: number,
  y: number,
  kind: Rule['kind'],
): string[] => {
  const { yes, no } = collectEmptyRuleTargetsAt(rules, context, x, y, kind)
  return Array.from(yes).filter((target) => !no.has(target))
}

// `empty is not b` objects protect b from an `empty is all` spawn
// (official createall_single consults `empty is not b` rules).
export const resolveEmptyNegatedObjectsAt = (
  rules: Rule[],
  context: EmptyMatchContext,
  x: number,
  y: number,
  kind: Rule['kind'],
): Set<string> =>
  collectEmptyRuleTargetsAt(rules, context, x, y, kind).no


export const hasAnyEmptyCell = (
  items: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): boolean => {
  const occupied = new Set<number>()
  for (const item of items) occupied.add(keyFor(item.x, item.y, width))
  return occupied.size < width * height
}

export const resolveEmptyProperties = (rules: Rule[]): Set<Property> => {
  const yes = new Set<Property>()
  const no = new Set<Property>()

  for (const rule of rules) {
    if (!isPropertyRule(rule)) continue
    if (rule.subject !== 'empty') continue
    if (rule.subjectNegated) continue
    if (rule.condition) continue

    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  const result = new Set<Property>()
  for (const prop of yes) if (!no.has(prop)) result.add(prop)
  return result
}

const hasEmptyPropertyRules = (rules: Rule[]): boolean =>
  rules.some(
    (rule) =>
      rule.kind === 'is-property' &&
      rule.subject === 'empty' &&
      !rule.subjectNegated,
  )

// Per-cell target resolution re-checks kind/subject/negated for every
// rule; hoisting that filter out of the cell loop keeps each cell's work
// proportional to the rules that can actually apply.
const emptySubjectRules = (
  rules: Rule[],
  kind: Rule['kind'],
): Rule[] =>
  rules.filter(
    (rule) =>
      rule.kind === kind &&
      rule.subject === 'empty' &&
      !rule.subjectNegated,
  )

// Empty cells are per-cell pseudo-units (official unitid 2): each cell's
// own `empty is <prop>` rules decide how movers interact with it, so a
// conditional rule like `empty near water is push` only applies where the
// condition holds. This map carries cellKey → that cell's props.
export const resolveEmptyPropsByCell = (
  rules: Rule[],
  items: EmptyMatchItem[],
  width: number,
  height: number,
  context?: RuleMatchContext,
): Map<number, Set<string>> => {
  const byCell = new Map<number, Set<string>>()
  if (!hasEmptyPropertyRules(rules)) return byCell
  // A caller-held match context over the same board saves the O(items)
  // index rebuild; its byCell size doubles as the empty-cell probe. It must
  // describe the same positions as `items` — callers pass their stage
  // runtime context, whose cells predate only prop-only updates.
  const hasEmpty = context
    ? context.byCell.size < width * height
    : hasAnyEmptyCell(items, width, height)
  if (!hasEmpty) return byCell

  const emptyContext: EmptyMatchContext = context
    ? {
        byCell: context.byCell as Map<number, EmptyMatchItem[]>,
        groupMembers: context.groupMembers,
        height,
        width,
        ...(context.idle !== undefined ? { idle: context.idle } : {}),
        ...(context.turn !== undefined ? { turn: context.turn } : {}),
      }
    : createEmptyMatchContext(items, rules, width, height)
  const emptyRules = emptySubjectRules(rules, 'is-property')
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (itemsAt(emptyContext, x, y).length) continue
      const targets = resolveEmptyRuleTargetsAt(
        emptyRules,
        emptyContext,
        x,
        y,
        'is-property',
      )
      if (targets.length) byCell.set(keyFor(x, y, width), new Set(targets))
    }
  }
  return byCell
}

export const resolveActiveEmptyProps = (
  rules: Rule[],
  items: EmptyMatchItem[],
  width: number,
  height: number,
  context?: RuleMatchContext,
): Set<string> => {
  const active = new Set<string>()
  for (const props of resolveEmptyPropsByCell(
    rules,
    items,
    width,
    height,
    context,
  ).values())
    for (const prop of props) active.add(prop)
  return active
}

export const emptyHasProp = (
  rules: Rule[],
  prop: Property,
  items: EmptyMatchItem[],
  width: number,
  height: number,
): boolean => {
  if (!hasEmptyPropertyRules(rules)) return false
  if (!hasAnyEmptyCell(items, width, height)) return false
  const context = createEmptyMatchContext(items, rules, width, height)
  const emptyRules = emptySubjectRules(rules, 'is-property')
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (itemsAt(context, x, y).length) continue
      const targets = resolveEmptyRuleTargetsAt(
        emptyRules,
        context,
        x,
        y,
        'is-property',
      )
      if (targets.includes(prop)) return true
    }
  }
  return false
}

// `empty has x` drops when an empty pseudo-unit is destroyed during
// movement (official delete(2, x, y) → inside("empty", …)): the spawned
// unit lands on the dead cell itself, with `empty is <dir>` setting its
// facing the way `emptydir` does.
export const appendEmptyHasSpawns = (
  items: Item[],
  deadCells: ReadonlySet<number>,
  hasRules: Rule[],
  dirRules: Rule[],
  width: number,
  height: number,
): { items: Item[]; changed: boolean } => {
  const emptyHas = hasRules.filter(
    (rule) => rule.subject === 'empty' && !rule.subjectNegated,
  )
  if (!emptyHas.length || !deadCells.size) return { items, changed: false }

  const context = createEmptyMatchContext(items, emptyHas, width, height)
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const spawned: Item[] = []

  for (const key of deadCells) {
    const x = key % width
    const y = (key - x) / width
    const targets = resolveEmptyRuleTargetsAt(emptyHas, context, x, y, 'has')
    if (!targets.length) continue
    const dirs = dirRules.length
      ? resolveEmptyRuleTargetsAt(dirRules, context, x, y, 'is-property')
      : []
    const dir = dirs.find(
      (d): d is Direction =>
        d === 'up' || d === 'right' || d === 'down' || d === 'left',
    )

    for (const target of targets) {
      if (target === 'empty' || target === 'all' || target === 'level')
        continue
      if (target === 'text') {
        spawned.push({
          id: nextId++,
          name: 'empty',
          x,
          y,
          isText: true,
          props: [],
          ...(dir ? { dir } : {}),
        })
        continue
      }
      spawned.push({
        id: nextId++,
        name: target,
        x,
        y,
        isText: false,
        props: [],
        ...(dir ? { dir } : {}),
      })
    }
  }

  if (!spawned.length) return { items, changed: false }
  return { items: [...items, ...spawned], changed: true }
}
