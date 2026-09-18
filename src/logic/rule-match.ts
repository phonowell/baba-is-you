import { keyFor } from './helpers.js'
import { isPropertyRule } from './types.js'

import type { Item, LevelItem, Rule } from './types.js'

type MatchItem = LevelItem | Item

export type RuleMatchContext = {
  byCell: Map<number, MatchItem[]>
  groupMembers: Set<string>
  height: number
  items: MatchItem[]
  width: number
}

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
    if (!isPropertyRule(rule)) continue
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

  const termMatches = (candidate: MatchItem): boolean =>
    'object' in condition
      ? matchesRuleObjectWord(candidate, condition.object, context.groupMembers)
      : false

  if (condition.kind === 'lonely' || condition.kind === 'on') {
    const cellItems =
      context.byCell.get(keyFor(item.x, item.y, context.width)) ?? []

    if (condition.kind === 'lonely') {
      const lonely = !cellItems.some(
        (candidate) => candidate.id !== item.id,
      )
      return condition.negated ? !lonely : lonely
    }

    const matched =
      condition.object === 'empty'
        ? !cellItems.some((candidate) => candidate.id !== item.id)
        : cellItems.some(
            (candidate) =>
              candidate.id !== item.id && termMatches(candidate),
          )
    return condition.negated ? !matched : matched
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
        const self = dx === 0 && dy === 0
        if (condition.object === 'empty') {
          const occupied = self
            ? neighbors.some((candidate) => candidate.id !== item.id)
            : neighbors.length > 0
          if (!occupied) matched = true
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

  if ('direction' in condition) {
    const matched = (item.dir ?? 'right') === condition.direction
    return condition.negated ? !matched : matched
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
    return condition.negated ?? false
  const inFront = context.byCell.get(keyFor(x, y, context.width)) ?? []
  const matched =
    condition.object === 'empty'
      ? inFront.length === 0
      : inFront.some((candidate) => termMatches(candidate))
  return condition.negated ? !matched : matched
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

  // A negated subject never matches text entities — the predecessor's
  // `subject_match` maps text to `TextOrNoun::Text`, which `No(_)` rejects,
  // so `not baba is you` does not make text into `you`.
  if (subjectNegated) matched = !matched && !item.isText
  if (!matched) return false
  return matchesCondition(item, rule, context)
}
