import { createRuleMatchContext } from './rule-match.js'
import { collectRuleInstances } from './rules.js'
import { partitionRuleInstances } from './rules-override.js'
import { stringifyCondition } from './rules-subjects.js'

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
  // Overridden rules (`x is push` vetoed by `not x is push`, or transforms
  // suppressed by `x is x`) never take effect — mirror the predecessor by
  // feeding only active rules into the runtime.
  const { active } = partitionRuleInstances(
    collectRuleInstances(items, width, height),
  )
  const rules: Rule[] = []
  const seen = new Set<string>()
  for (const { rule } of active) {
    const key = `${rule.subjectNegated ? '!' : ''}${rule.subject}:${stringifyCondition(
      rule.condition,
    )}:${rule.kind}:${rule.objectNegated ? '!' : ''}${rule.object}`
    if (seen.has(key)) continue
    seen.add(key)
    rules.push(rule)
  }
  return createRuleRuntime(items, rules, width, height)
}
