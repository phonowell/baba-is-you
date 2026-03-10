import { createRuleMatchContext } from './rule-match.js'
import { collectRules } from './rules.js'

import type { Item, LevelItem, Rule } from './types.js'

export type MatchItem = LevelItem | Item

export type RuleBuckets = {
  eat: Rule[]
  has: Rule[]
  isProperty: Rule[]
  isTransform: Rule[]
  make: Rule[]
  write: Rule[]
}

export type RuleRuntime = {
  buckets: RuleBuckets
  context: ReturnType<typeof createRuleMatchContext>
  height: number
  rules: Rule[]
  width: number
}

export const createRuleBuckets = (rules: Rule[]): RuleBuckets => {
  const buckets: RuleBuckets = {
    eat: [],
    has: [],
    isProperty: [],
    isTransform: [],
    make: [],
    write: [],
  }

  for (const rule of rules) {
    if (rule.kind === 'is-property') buckets.isProperty.push(rule)
    else if (rule.kind === 'is-transform') buckets.isTransform.push(rule)
    else if (rule.kind === 'has') buckets.has.push(rule)
    else if (rule.kind === 'make') buckets.make.push(rule)
    else if (rule.kind === 'eat') buckets.eat.push(rule)
    else buckets.write.push(rule)
  }

  return buckets
}

export const createRuleRuntime = (
  items: MatchItem[],
  rules: Rule[],
  width: number,
  height: number,
): RuleRuntime => ({
  buckets: createRuleBuckets(rules),
  context: createRuleMatchContext(items, rules, width, height),
  height,
  rules,
  width,
})

export const collectRuleRuntime = (
  items: MatchItem[],
  width: number,
  height: number,
): RuleRuntime => {
  const rules = collectRules(items, width, height)
  return createRuleRuntime(items, rules, width, height)
}
