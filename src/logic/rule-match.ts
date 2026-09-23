import {
  fnvChar,
  fnvInt,
  fnvText,
  forEachDelta,
  keyFor,
  MOVE_DELTAS,
  NEIGHBOR_DELTAS,
  ORTHOGONAL_DELTAS,
} from './helpers.js'
import { isPropertyRule } from './types.js'

import type { Item, LevelItem, Property, Rule } from './types.js'

type MatchItem = LevelItem | Item

// `group`/`group2`/`group3` each collect the subject names carrying that
// membership prop; the map key is the noun as it appears in rules.
export type GroupMembers = ReadonlyMap<string, ReadonlySet<string>>

export type RuleMatchContext = {
  byCell: Map<number, MatchItem[]>
  groupMembers: GroupMembers
  height: number
  items: MatchItem[]
  // `poweredstatus` analogue: the `X IS POWER*` verdict is board-global
  // (officially cached per turn, cleared by smallclear — for us the
  // context lifetime is one rule pass, which is shorter).
  poweredStatus: Map<string, boolean>
  // `without` verdicts only differ per item when exactly one unit matches
  // the object test (the matcher itself sees "no other"), so the matcher
  // id set is a per-context constant — computed once on first use instead
  // of rescanning `items` for every (item, rule) pair.
  withoutMatchers: Map<string, ReadonlySet<number>>
  rules: Rule[]
  width: number
  // Turn-level extras for postfix conditions: `idle` is the official
  // `last_key == 4` (no directional input this turn); `turn` seeds the
  // deterministic `often`/`seldom` rolls.
  idle?: boolean
  turn?: number
}

export const GROUP_NOUNS = new Set(['group', 'group2', 'group3'])

// `level` units (the map-icon object, reachable only via `x is level`)
// are nameless officially: `getmetadata` skips `level`/`path`/
// `specialobject`, so `getname` returns "" and the unit sits in
// `unitlists[""]` — it matches no subject or object word, not even
// `all` or `not x`. The display name stays 'level'; rule matching must
// see through it. The `id: -1` pseudo-item in `resolveLevelProps` is the
// level ENTITY evaluating `level is x <cond>` — exempt from this.
const isLevelIcon = (item: MatchItem): boolean =>
  !item.isText && item.name === 'level' && item.id !== -1

export const matchesRuleObjectWord = (
  item: MatchItem,
  word: string,
  groupMembers: GroupMembers,
): boolean => {
  if (isLevelIcon(item)) return false
  if (word === 'text') return item.isText
  if (word === 'empty') return false
  if (word === 'all') return !item.isText
  if (GROUP_NOUNS.has(word))
    return !item.isText && (groupMembers.get(word)?.has(item.name) ?? false)
  // Only the level-entity pseudo-item reaches this branch — real `level`
  // units already early-returned via isLevelIcon.
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
        if (item.isText || item.name === 'level') continue
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
    poweredStatus: new Map(),
    withoutMatchers: new Map(),
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
  const [dx, dy] = MOVE_DELTAS[direction]
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
  let matched = false
  forEachDelta(context, item.x, item.y, ORTHOGONAL_DELTAS, (x, y, dx, dy) => {
    if (matched) return
    for (const candidate of cellItems(context, x, y)) {
      if (candidate.id === item.id) continue
      const dir = candidate.dir ?? 'right'
      const [cdx, cdy] = MOVE_DELTAS[dir]
      if (cdx !== -dx || cdy !== -dy) continue
      if (
        matchesRuleObjectWord(candidate, object, context.groupMembers) !==
        objectNegated
      ) {
        matched = true
        return
      }
    }
  })
  return matched
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
  const cacheKey = `${object}:${objectNegated ? '1' : '0'}`
  let matchers = context.withoutMatchers.get(cacheKey)
  if (matchers === undefined) {
    const collected = new Set<number>()
    for (const candidate of context.items)
      if (
        matchesRuleObjectWord(candidate, object, context.groupMembers) !==
        objectNegated
      )
        collected.add(candidate.id)
    matchers = collected
    context.withoutMatchers.set(cacheKey, matchers)
  }
  // No other unit satisfies the object test: true when no matcher exists,
  // or when the sole matcher is this item itself (it is not its own
  // "other"). Two or more matchers make the check fail for every item.
  return (
    matchers.size === 0 || (matchers.size === 1 && matchers.has(item.id))
  )
}

// `feeling` takes a property parameter and asks whether the subject's own
// `X IS <prop>` rule currently holds — the official implementation walks
// featureindex for a matching rule and re-tests its conditions. Rules
// already under test in this chain (`visited`) are skipped, so
// `X FEELING WIN IS WIN` self-references terminate — the official
// `checkedconds` guard.
const matchesFeeling = (
  item: MatchItem,
  object: string,
  objectNegated: boolean,
  context: RuleMatchContext,
  visited: Set<Rule>,
): boolean => {
  for (const rule of context.rules) {
    if (rule.kind !== 'is-property') continue
    if (rule.object !== object || (rule.objectNegated ?? false) !== objectNegated)
      continue
    if (visited.has(rule)) continue
    if (matchesRuleSubject(item, rule, context, visited)) return true
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
  // Hashes the same `${turn}:${id}:${x},${y}:${kind}` byte sequence the
  // original string seed produced — kept allocation-free because this
  // runs per (item, conditional rule) in the property pass.
  let hash = 2166136261
  hash = fnvInt(hash, context.turn ?? 0)
  hash = fnvChar(hash, 58)
  hash = fnvInt(hash, item.id)
  hash = fnvChar(hash, 58)
  hash = fnvInt(hash, item.x)
  hash = fnvChar(hash, 44)
  hash = fnvInt(hash, item.y)
  hash = fnvChar(hash, 58)
  hash = fnvText(hash, kind)
  return hash >>> 0 === 0 ? true : (hash >>> 0) % sides < hits
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
  visited: Set<Rule>,
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
      // `checkedconds` parity: candidates already under test in this
      // chain are skipped (`x powered is power` self-references end
      // instead of recursing), and negated subjects never source power.
      // The verdict is board-global, so the `poweredstatus` cache is
      // written only from a top-level eval — a chain-truncated verdict
      // must not leak into the memo.
      const prop = POWERED_PROPS[condition.kind]
      const cached = prop === undefined
        ? undefined
        : context.poweredStatus.get(prop)
      if (cached !== undefined) {
        matched = cached
      } else if (prop !== undefined) {
        const topLevel = visited.size === 1
        matched = context.rules.some(
          (candidate) =>
            candidate.kind === 'is-property' &&
            candidate.object === prop &&
            !candidate.objectNegated &&
            !candidate.subjectNegated &&
            !visited.has(candidate) &&
            context.items.some((unit) =>
              matchesRuleSubject(unit, candidate, context, visited),
            ),
        )
        if (topLevel) context.poweredStatus.set(prop, matched)
      }
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
    forEachDelta(context, item.x, item.y, ORTHOGONAL_DELTAS, (x, y) => {
      if (matched) return
      const cell = cellItems(context, x, y)
      if (condition.object === 'empty') {
        if (emptyMatches(!cell.length)) matched = true
      } else if (cell.some((candidate) => termMatches(candidate)))
        matched = true
    })
    return condition.negated ? !matched : matched
  }

  if (condition.kind === 'near') {
    let matched = false
    forEachDelta(context, item.x, item.y, NEIGHBOR_DELTAS, (nx, ny, dx, dy) => {
      if (matched) return
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
    })
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
      visited,
    )
    return condition.negated ? !matched : matched
  }

  if ('direction' in condition) {
    const matched = (item.dir ?? 'right') === condition.direction
    return condition.negated ? !matched : matched
  }

  const direction = item.dir ?? 'right'
  const delta = MOVE_DELTAS[direction]
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

// Subject pre-index for per-item evaluation over a fixed rule set — the
// same partition `matchesRuleSubject` implies: a non-text item can only
// satisfy same-name concrete subjects plus the wildcard rules (`all`,
// `group*`, every negated subject), and a text item only `text`
// subjects. Candidates merge back in source order once per name, so
// consumers that rely on rule order (transform's first variant, target
// lists) keep it while skipping rules that can never match.
type SubjectRuleIndex = {
  byName: Map<string, Rule[]>
  text: Rule[]
  wildcard: Set<Rule>
  source: readonly Rule[]
  merged: Map<string, Rule[]>
}

const subjectRuleIndexes = new WeakMap<readonly Rule[], SubjectRuleIndex>()

export const subjectRuleCandidates = (
  rules: readonly Rule[],
  item: { name: string; isText: boolean },
): readonly Rule[] => {
  let index = subjectRuleIndexes.get(rules)
  if (index === undefined) {
    index = {
      byName: new Map(),
      text: [],
      wildcard: new Set(),
      source: rules,
      merged: new Map(),
    }
    for (const rule of rules) {
      if (
        rule.subjectNegated === true ||
        rule.subject === 'all' ||
        GROUP_NOUNS.has(rule.subject)
      )
        index.wildcard.add(rule)
      else if (rule.subject === 'text') index.text.push(rule)
      else {
        const list = index.byName.get(rule.subject) ?? []
        list.push(rule)
        index.byName.set(rule.subject, list)
      }
    }
    subjectRuleIndexes.set(rules, index)
  }
  if (item.isText) return index.text
  let merged = index.merged.get(item.name)
  if (merged === undefined) {
    const named = new Set(index.byName.get(item.name) ?? [])
    merged = index.source.filter(
      (rule) => index.wildcard.has(rule) || named.has(rule),
    )
    index.merged.set(item.name, merged)
  }
  return merged
}

export const matchesRuleSubject = (
  item: MatchItem,
  rule: Rule,
  context: RuleMatchContext,
  visiting?: Set<Rule>,
): boolean => {
  const subjectNegated = rule.subjectNegated ?? false

  let matched = false
  if (isLevelIcon(item)) matched = false
  else if (rule.subject === 'text') matched = item.isText
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
  // Unconditional rules match on the subject test alone — skip the
  // chain-set allocation entirely (the common case).
  if (!rule.condition) return true
  // `testcond` marks the evaluated rule's conds at entry: within one
  // condition chain a rule is tested at most once, which is what makes
  // powered/feeling re-entry terminate.
  const visited = visiting ?? new Set<Rule>()
  visited.add(rule)
  return matchesCondition(item, rule, context, visited)
}
