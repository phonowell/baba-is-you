import { createRuleMatchContext } from './rule-match.js'
import { collectRuleInstances } from './rules.js'
import {
  partitionRuleInstances,
  textRuleMarksFromPartition,
} from './rules-override.js'
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
  // `isProperty` re-indexed for per-item evaluation in `applyProperties`:
  // concrete non-negated subjects keyed by name, non-negated `text`
  // subject rules (only text entities can match), and everything else —
  // special subjects `all`/`group` plus every negated subject —
  // in `propertyWildcard`. Evaluation order across buckets is irrelevant:
  // the yes/no sets dedupe and vetoes apply afterwards.
  propertyBySubject: Map<string, Rule[]>
  propertyText: Rule[]
  propertyWildcard: Rule[]
}

export type RuleRuntime = {
  buckets: RuleBuckets
  context: ReturnType<typeof createRuleMatchContext>
  height: number
  // Text ids in overridden rules and no active one — computed alongside
  // the instance partition so renderers can strike those cards without
  // reparsing rules. Rebound runtimes carry the previous value forward;
  // any position-affecting change re-collects before the step ends.
  overriddenTextIds: ReadonlySet<number>
  rules: Rule[]
  width: number
}

// Subject words matching more than a single entity name. `level` and
// `empty` stay in the by-name index: `level` only matches items literally
// named `level`, and `empty` never matches an item at all.
const WILDCARD_SUBJECT_WORDS = new Set(['all', 'group'])

export const createRuleBuckets = (rules: Rule[]): RuleBuckets => {
  const buckets: RuleBuckets = {
    eat: [],
    has: [],
    isProperty: [],
    isTransform: [],
    make: [],
    write: [],
    propertyBySubject: new Map(),
    propertyText: [],
    propertyWildcard: [],
  }

  for (const rule of rules) {
    if (rule.kind === 'is-property') {
      buckets.isProperty.push(rule)
      if (rule.subjectNegated || WILDCARD_SUBJECT_WORDS.has(rule.subject))
        buckets.propertyWildcard.push(rule)
      else if (rule.subject === 'text') buckets.propertyText.push(rule)
      else {
        const list = buckets.propertyBySubject.get(rule.subject) ?? []
        list.push(rule)
        buckets.propertyBySubject.set(rule.subject, list)
      }
    } else if (rule.kind === 'is-transform') buckets.isTransform.push(rule)
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
  overriddenTextIds: ReadonlySet<number>,
): RuleRuntime => ({
  buckets: createRuleBuckets(rules),
  context: createRuleMatchContext(items, rules, width, height),
  height,
  overriddenTextIds,
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
  const partition = partitionRuleInstances(
    collectRuleInstances(items, width, height),
  )
  const rules: Rule[] = []
  const seen = new Set<string>()
  for (const { rule } of partition.active) {
    const key = `${rule.subjectNegated ? '!' : ''}${rule.subject}:${stringifyCondition(
      rule.condition,
    )}:${rule.kind}:${rule.objectNegated ? '!' : ''}${rule.object}`
    if (seen.has(key)) continue
    seen.add(key)
    rules.push(rule)
  }
  return createRuleRuntime(
    items,
    rules,
    width,
    height,
    textRuleMarksFromPartition(partition).overridden,
  )
}
