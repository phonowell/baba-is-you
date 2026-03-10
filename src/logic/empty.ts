import { keyFor } from './helpers.js'
import { createRuleMatchContext, matchesRuleObjectWord } from './rule-match.js'
import { isPropertyRule } from './types.js'

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
  groupMembers: Set<string>
  height: number
  width: number
}

const itemsAt = (
  context: EmptyMatchContext,
  x: number,
  y: number,
): EmptyMatchItem[] => context.byCell.get(keyFor(x, y, context.width)) ?? []

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

const matchesEmptyCondition = (
  context: EmptyMatchContext,
  x: number,
  y: number,
  condition?: RuleCondition,
): boolean => {
  if (!condition) return true

  if (condition.kind === 'lonely') {
    const lonely = itemsAt(context, x, y).length === 0
    if (condition.negated) return !lonely
    return lonely
  }

  if (condition.kind === 'on') {
    const matched = matchesObjectAtCell(context, x, y, condition.object)
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
        if (matchesObjectAtCell(context, nx, ny, condition.object)) matched = true
      }
    }
    return condition.negated ? !matched : matched
  }

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
): EmptyMatchContext => {
  const context = createRuleMatchContext(items, rules, width, height)
  return {
    byCell: context.byCell as Map<number, EmptyMatchItem[]>,
    groupMembers: context.groupMembers,
    height,
    width,
  }
}

export const resolveEmptyRuleTargetsAt = (
  rules: Rule[],
  context: EmptyMatchContext,
  x: number,
  y: number,
  kind: Rule['kind'],
): string[] => {
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

  return Array.from(yes).filter((target) => !no.has(target))
}

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

export const emptyHasProp = (
  rules: Rule[],
  prop: Property,
  items: EmptyMatchItem[],
  width: number,
  height: number,
): boolean => {
  if (!hasAnyEmptyCell(items, width, height)) return false
  const context = createEmptyMatchContext(items, rules, width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (itemsAt(context, x, y).length) continue
      const targets = resolveEmptyRuleTargetsAt(rules, context, x, y, 'is-property')
      if (targets.includes(prop)) return true
    }
  }
  return false
}
