import { keyFor } from './helpers.js'

import type { Item, LevelItem, Rule } from './types.js'

type MatchItem = LevelItem | Item

export type RuleMatchContext = {
  byCell: Map<number, MatchItem[]>
  groupMembers: Set<string>
  height: number
  items: MatchItem[]
  width: number
}

const DIRECTION_WORDS = new Set(['up', 'right', 'down', 'left'])

export const matchesRuleObjectWord = (
  item: MatchItem,
  word: string,
  groupMembers: Set<string>,
): boolean => {
  if (word === 'text') return item.isText
  if (word === 'empty') return false
  if (word === 'all') return !item.isText
  if (word === 'group') return !item.isText && groupMembers.has(item.name)
  if (word === 'level') return !item.isText && item.name === 'level'
  if (item.isText) return false
  return item.name === word
}

const resolveGroupMembers = (
  items: MatchItem[],
  rules: Rule[],
): Set<string> => {
  const members = new Set<string>()

  for (const rule of rules) {
    if (rule.kind !== 'property') continue
    if (rule.object !== 'group' || rule.objectNegated) continue
    if (rule.condition) continue
    if (rule.subjectNegated) continue

    if (rule.subject === 'all') {
      for (const item of items) {
        if (item.isText) continue
        members.add(item.name)
      }
      continue
    }

    if (rule.subject === 'text' || rule.subject === 'empty') continue
    members.add(rule.subject)
  }

  return members
}

export const createRuleMatchContext = (
  items: MatchItem[],
  rules: Rule[],
  width: number,
  height: number,
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
    width,
  }
}

const matchesCondition = (
  item: MatchItem,
  rule: Rule,
  context: RuleMatchContext,
): boolean => {
  const { condition } = rule
  if (!condition) return true

  const cellItems =
    context.byCell.get(keyFor(item.x, item.y, context.width)) ?? []
  const otherCellItems = cellItems.filter(
    (candidate) => candidate.id !== item.id,
  )

  if (condition.kind === 'lonely') {
    const lonely = otherCellItems.length === 0
    if (condition.negated) return !lonely
    return lonely
  }

  const termMatches = (candidate: MatchItem): boolean =>
    matchesRuleObjectWord(candidate, condition.object, context.groupMembers)

  if (condition.kind === 'on') {
    const matched =
      condition.object === 'empty'
        ? otherCellItems.length === 0
        : otherCellItems.some((candidate) => termMatches(candidate))
    return condition.objectNegated ? !matched : matched
  }

  if (condition.kind === 'near') {
    let matched = false
    for (let dy = -1; dy <= 1 && !matched; dy += 1) {
      for (let dx = -1; dx <= 1 && !matched; dx += 1) {
        const nx = item.x + dx
        const ny = item.y + dy
        if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height)
          continue

        const neighbors =
          context.byCell.get(keyFor(nx, ny, context.width)) ?? []
        const candidateItems =
          dx === 0 && dy === 0
            ? neighbors.filter((candidate) => candidate.id !== item.id)
            : neighbors
        if (condition.object === 'empty') {
          if (!candidateItems.length) matched = true
        } else if (candidateItems.some((candidate) => termMatches(candidate)))
          matched = true
      }
    }
    return condition.objectNegated ? !matched : matched
  }

  if (DIRECTION_WORDS.has(condition.object)) {
    const matched = (item.dir ?? 'right') === condition.object
    return condition.objectNegated ? !matched : matched
  }

  const direction = item.dir ?? 'right'
  const delta: [number, number] =
    direction === 'up'
      ? [0, -1]
      : direction === 'down'
        ? [0, 1]
        : direction === 'left'
          ? [-1, 0]
          : [1, 0]
  const x = item.x + delta[0]
  const y = item.y + delta[1]
  if (x < 0 || y < 0 || x >= context.width || y >= context.height)
    return condition.objectNegated ?? false
  const inFront = context.byCell.get(keyFor(x, y, context.width)) ?? []
  const matched =
    condition.object === 'empty'
      ? inFront.length === 0
      : inFront.some((candidate) => termMatches(candidate))
  return condition.objectNegated ? !matched : matched
}

export const matchesRuleSubject = (
  item: MatchItem,
  rule: Rule,
  context: RuleMatchContext,
): boolean => {
  const subjectNegated = rule.subjectNegated ?? false

  let matched = false
  if (rule.subject === 'text') matched = item.isText
  else if (rule.subject === 'empty') matched = false
  else if (rule.subject === 'all') matched = !item.isText
  else if (rule.subject === 'group')
    matched = !item.isText && context.groupMembers.has(item.name)
  else if (rule.subject === 'level')
    matched = !item.isText && item.name === 'level'
  else matched = !item.isText && item.name === rule.subject

  if (subjectNegated) matched = !matched
  if (!matched) return false
  return matchesCondition(item, rule, context)
}
