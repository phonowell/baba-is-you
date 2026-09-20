import { keyFor } from './helpers.js'
import { isPropertyRule } from './types.js'

import type { Direction, Item, LevelItem, Property, Rule } from './types.js'

type MatchItem = LevelItem | Item

// `group`/`group2`/`group3` each collect the subject names carrying that
// membership prop; the map key is the noun as it appears in rules.
export type GroupMembers = ReadonlyMap<string, ReadonlySet<string>>

export type RuleMatchContext = {
  byCell: Map<number, MatchItem[]>
  groupMembers: GroupMembers
  height: number
  items: MatchItem[]
  rules: Rule[]
  width: number
  // Turn-level extras for postfix conditions: `idle` is the official
  // `last_key == 4` (no directional input this turn); `turn` seeds the
  // deterministic `often`/`seldom` rolls.
  idle?: boolean
  turn?: number
}

export const GROUP_NOUNS = new Set(['group', 'group2', 'group3'])

export const matchesRuleObjectWord = (
  item: MatchItem,
  word: string,
  groupMembers: GroupMembers,
): boolean => {
  if (word === 'text') return item.isText
  if (word === 'empty') return false
  if (word === 'all') return !item.isText
  if (GROUP_NOUNS.has(word))
    return !item.isText && (groupMembers.get(word)?.has(item.name) ?? false)
  if (word === 'level') return !item.isText && item.name === 'level'
  if (item.isText) return false
  return item.name === word
}

const resolveGroupMembers = (
  items: MatchItem[],
  rules: Rule[],
): Map<string, Set<string>> => {
  const members = new Map<string, Set<string>>()
  const memberSet = (word: string): Set<string> => {
    const existing = members.get(word)
    if (existing) return existing
    const created = new Set<string>()
    members.set(word, created)
    return created
  }

  for (const rule of rules) {
    if (!isPropertyRule(rule)) continue
    if (!GROUP_NOUNS.has(rule.object)) continue
    if (rule.objectNegated) continue
    if (rule.condition) continue
    if (rule.subjectNegated) continue

    const set = memberSet(rule.object)
    if (rule.subject === 'all') {
      for (const item of items) {
        if (item.isText) continue
        set.add(item.name)
      }
      continue
    }

    if (rule.subject === 'text' || rule.subject === 'empty') continue
    set.add(rule.subject)
  }

  return members
}

export const createRuleMatchContext = (
  items: MatchItem[],
  rules: Rule[],
  width: number,
  height: number,
  extras?: { idle?: boolean; turn?: number },
): RuleMatchContext => {
  const byCell = new Map<number, MatchItem[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    list.push(item)
    byCell.set(key, list)
  }

  return {
    byCell,
    groupMembers: resolveGroupMembers(items, rules),
    height,
    items,
    rules,
    width,
    ...(extras?.idle !== undefined ? { idle: extras.idle } : {}),
    ...(extras?.turn !== undefined ? { turn: extras.turn } : {}),
  }
}

const itemHasProp = (item: MatchItem, prop: string): boolean =>
  'props' in item &&
  Array.isArray(item.props) &&
  (item.props as Property[]).includes(prop as Property)

const cellItems = (
  context: RuleMatchContext,
  x: number,
  y: number,
): MatchItem[] => context.byCell.get(keyFor(x, y, context.width)) ?? []

const inBounds = (context: RuleMatchContext, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < context.width && y < context.height

// Scan a straight line of cells (row or column) starting at `x`,`y` and
// stepping `dx`,`dy` until the board edge. Used by `above`/`below` and
// `beside*` — the official implementations scan the whole line for the
// parameter object, not just the adjacent cell.
const scanLine = (
  context: RuleMatchContext,
  item: MatchItem,
  object: string,
  objectNegated: boolean,
  dx: number,
  dy: number,
): boolean => {
  let x = item.x + dx
  let y = item.y + dy
  while (inBounds(context, x, y)) {
    const cell = cellItems(context, x, y)
    if (object === 'empty') {
      if (!cell.length !== objectNegated) return true
    } else if (
      cell.some(
        (candidate) =>
          candidate.id !== item.id &&
          matchesRuleObjectWord(candidate, object, context.groupMembers) !==
            objectNegated,
      )
    )
      return true
    x += dx
    y += dy
  }
  return false
}

// `seeing`: walk the facing ray; non-`hide` units are visible targets,
// and the scan stops after the first cell holding a non-hidden,
// non-phantom stop/push/pull unit (the official `simplecheck`).
const matchesSeeing = (
  item: MatchItem,
  object: string,
  objectNegated: boolean,
  context: RuleMatchContext,
): boolean => {
  if ((object === 'empty' || object === 'level') && !objectNegated)
    return false
  const direction = item.dir ?? 'right'
  const [dx, dy] = DIRECTION_DELTAS[direction]
  let x = item.x
  let y = item.y
  while (true) {
    x += dx
    y += dy
    if (!inBounds(context, x, y)) return false
    const cell = cellItems(context, x, y)
    const visible = cell.filter((candidate) => !itemHasProp(candidate, 'hide'))
    for (const candidate of visible) {
      if (candidate.id === item.id) continue
      if (
        matchesRuleObjectWord(candidate, object, context.groupMembers) !==
        objectNegated
      )
        return true
    }
    const sightBlocked = visible.some(
      (candidate) =>
        !itemHasProp(candidate, 'phantom') &&
        (itemHasProp(candidate, 'stop') ||
          itemHasProp(candidate, 'push') ||
          itemHasProp(candidate, 'pull')),
    )
    if (sightBlocked) return false
  }
}

// `facedby`: an orthogonally adjacent unit whose own facing points back
// at the subject's cell.
const matchesFacedBy = (
  item: MatchItem,
  object: string,
  objectNegated: boolean,
  context: RuleMatchContext,
): boolean => {
  for (const [dx, dy] of ORTHOGONAL_DELTAS) {
    const x = item.x + dx
    const y = item.y + dy
    if (!inBounds(context, x, y)) continue
    for (const candidate of cellItems(context, x, y)) {
      if (candidate.id === item.id) continue
      const dir = candidate.dir ?? 'right'
      const [cdx, cdy] = DIRECTION_DELTAS[dir]
      if (cdx !== -dx || cdy !== -dy) continue
      if (
        matchesRuleObjectWord(candidate, object, context.groupMembers) !==
        objectNegated
      )
        return true
    }
  }
  return false
}

// `without` is a global absence check, not a neighbourhood one: the rule
// fires while no other unit matches the parameter. `empty` means every
// board cell is occupied.
const matchesWithout = (
  item: MatchItem,
  object: string,
  objectNegated: boolean,
  context: RuleMatchContext,
): boolean => {
  if (object === 'empty')
    return objectNegated
      ? context.byCell.size === 0
      : context.byCell.size >= context.width * context.height
  return !context.items.some(
    (candidate) =>
      candidate.id !== item.id &&
      matchesRuleObjectWord(candidate, object, context.groupMembers) !==
        objectNegated,
  )
}

// `feeling` takes a property parameter and asks whether the subject's own
// `X IS <prop>` rule currently holds — the official implementation walks
// featureindex for a matching rule and re-tests its conditions. Depth is
// bounded so `X FEELING WIN IS WIN` self-references terminate.
const matchesFeeling = (
  item: MatchItem,
  object: string,
  objectNegated: boolean,
  context: RuleMatchContext,
  depth: number,
): boolean => {
  if (depth > 3) return false
  for (const rule of context.rules) {
    if (rule.kind !== 'is-property') continue
    if (rule.object !== object || (rule.objectNegated ?? false) !== objectNegated)
      continue
    if (matchesRuleSubject(item, rule, context, depth + 1)) return true
  }
  return false
}

// Deterministic per-(turn, item, condition) roll standing in for the
// official `fixedrandom` cache: `often` hits 3/4 of the time, `seldom`
// 1/6. The roll is stable for a turn because the context carries it.
const rollCondition = (
  context: RuleMatchContext,
  item: MatchItem,
  kind: string,
  sides: number,
  hits: number,
): boolean => {
  const turn = context.turn ?? 0
  let hash = 2166136261
  const seed = `${turn}:${item.id}:${item.x},${item.y}:${kind}`
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0 === 0 ? true : (hash >>> 0) % sides < hits
}

const ORTHOGONAL_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

const DIRECTION_DELTAS: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

const POWERED_PROPS: Record<string, string> = {
  powered: 'power',
  powered2: 'power2',
  powered3: 'power3',
}

const matchesCondition = (
  item: MatchItem,
  rule: Rule,
  context: RuleMatchContext,
  depth: number,
): boolean => {
  const { condition } = rule
  if (!condition) return true

  // `x <cond> not y`: `objectNegated` inverts the object test — `on not
  // skull` needs a non-skull under the unit, `on not empty` needs any
  // occupied cell. `negated` still inverts the whole condition.
  const objectNegated =
    'object' in condition && (condition.objectNegated ?? false)
  const termMatches = (candidate: MatchItem): boolean =>
    'object' in condition
      ? matchesRuleObjectWord(
          candidate,
          condition.object,
          context.groupMembers,
        ) !== objectNegated
      : false
  const emptyMatches = (isEmpty: boolean): boolean => isEmpty !== objectNegated

  // Postfix conditions carry neither `object` nor `direction` — `lonely`
  // keeps its dedicated cell check below.
  if (
    !('object' in condition) &&
    !('direction' in condition) &&
    condition.kind !== 'lonely'
  ) {
    let matched = false
    if (condition.kind === 'idle') matched = context.idle === true
    else if (condition.kind === 'often')
      matched = rollCondition(context, item, 'often', 4, 3)
    else if (condition.kind === 'seldom')
      matched = rollCondition(context, item, 'seldom', 6, 1)
    else {
      // `powered*` asks whether a matching `X IS POWER*` rule is active
      // for some unit — the official featureindex lookup. Checking props
      // would miss sources whose props resolve in the same pass.
      const prop = POWERED_PROPS[condition.kind]
      matched =
        prop !== undefined &&
        context.rules.some(
          (candidate) =>
            candidate.kind === 'is-property' &&
            candidate.object === prop &&
            !candidate.objectNegated &&
            context.items.some((unit) =>
              matchesRuleSubject(unit, candidate, context, depth + 1),
            ),
        )
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'lonely' || condition.kind === 'on') {
    const cell = cellItems(context, item.x, item.y)

    if (condition.kind === 'lonely') {
      const lonely = !cell.some(
        (candidate) => candidate.id !== item.id,
      )
      return condition.negated ? !lonely : lonely
    }

    const matched =
      condition.object === 'empty'
        ? emptyMatches(!cell.some((candidate) => candidate.id !== item.id))
        : cell.some(
            (candidate) =>
              candidate.id !== item.id && termMatches(candidate),
          )
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'nextto') {
    let matched = false
    for (const [dx, dy] of ORTHOGONAL_DELTAS) {
      if (matched) break
      const x = item.x + dx
      const y = item.y + dy
      if (!inBounds(context, x, y)) continue
      const cell = cellItems(context, x, y)
      if (condition.object === 'empty') {
        if (emptyMatches(!cell.length)) matched = true
      } else if (cell.some((candidate) => termMatches(candidate)))
        matched = true
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'near') {
    let matched = false
    for (let dy = -1; dy <= 1 && !matched; dy += 1) {
      for (let dx = -1; dx <= 1 && !matched; dx += 1) {
        const nx = item.x + dx
        const ny = item.y + dy
        if (!inBounds(context, nx, ny))
          continue

        const neighbors = cellItems(context, nx, ny)
        const self = dx === 0 && dy === 0
        if (condition.object === 'empty') {
          const occupied = self
            ? neighbors.some((candidate) => candidate.id !== item.id)
            : neighbors.length > 0
          if (emptyMatches(!occupied)) matched = true
        } else if (
          neighbors.some(
            (candidate) =>
              (!self || candidate.id !== item.id) && termMatches(candidate),
          )
        )
          matched = true
      }
    }
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'without') {
    const matched = matchesWithout(item, condition.object, objectNegated, context)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'above' || condition.kind === 'below') {
    // `X ABOVE Y` means X sits above Y, so the scan runs downward.
    const dy = condition.kind === 'above' ? 1 : -1
    const matched = scanLine(context, item, condition.object, objectNegated, 0, dy)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'besideleft' || condition.kind === 'besideright') {
    // `X BESIDELEFT Y` means X sits left of Y — scan the row rightward.
    const dx = condition.kind === 'besideleft' ? 1 : -1
    const matched = scanLine(context, item, condition.object, objectNegated, dx, 0)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'facedby') {
    const matched = matchesFacedBy(item, condition.object, objectNegated, context)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'seeing') {
    const matched = matchesSeeing(item, condition.object, objectNegated, context)
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'feeling') {
    const matched = matchesFeeling(
      item,
      condition.object,
      objectNegated,
      context,
      depth,
    )
    return condition.negated ? !matched : matched
  }

  if ('direction' in condition) {
    const matched = (item.dir ?? 'right') === condition.direction
    return condition.negated ? !matched : matched
  }

  const direction = item.dir ?? 'right'
  const delta = DIRECTION_DELTAS[direction]
  const x = item.x + delta[0]
  const y = item.y + delta[1]
  if (!inBounds(context, x, y))
    return condition.negated ?? false
  const inFront = cellItems(context, x, y)
  const matched =
    condition.object === 'empty'
      ? emptyMatches(inFront.length === 0)
      : inFront.some((candidate) => termMatches(candidate))
  return condition.negated ? !matched : matched
}

export const matchesRuleSubject = (
  item: MatchItem,
  rule: Rule,
  context: RuleMatchContext,
  depth = 0,
): boolean => {
  const subjectNegated = rule.subjectNegated ?? false

  let matched = false
  if (rule.subject === 'text') matched = item.isText
  else if (rule.subject === 'empty') matched = false
  else if (rule.subject === 'all') matched = !item.isText
  else if (GROUP_NOUNS.has(rule.subject))
    matched =
      !item.isText && (context.groupMembers.get(rule.subject)?.has(item.name) ?? false)
  else if (rule.subject === 'level')
    matched = !item.isText && item.name === 'level'
  else matched = !item.isText && item.name === rule.subject

  // A negated subject never matches text entities — the predecessor's
  // `subject_match` maps text to `TextOrNoun::Text`, which `No(_)` rejects,
  // so `not baba is you` does not make text into `you`.
  if (subjectNegated) matched = !matched && !item.isText
  if (!matched) return false
  return matchesCondition(item, rule, context, depth)
}
