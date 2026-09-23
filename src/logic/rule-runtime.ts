import { createRuleMatchContext, matchesRuleSubject } from './rule-match.js'
import {
  collectRuleInstances,
  expandMimicRules,
  ruleDedupeKey,
} from './rules.js'
import {
  partitionRuleInstances,
  textRuleMarksFromPartition,
} from './rules-override.js'

import { isSpecialNounWord } from './types.js'

import type { Item, LevelItem, Rule } from './types.js'

export type MatchItem = LevelItem | Item

export type RuleBuckets = {
  eat: Rule[]
  has: Rule[]
  isProperty: Rule[]
  isTransform: Rule[]
  make: Rule[]
  write: Rule[]
  fear: Rule[]
  follow: Rule[]
  mimic: Rule[]
  play: Rule[]
  // `isProperty` re-indexed for per-item evaluation in `applyProperties`:
  // concrete non-negated subjects keyed by name, non-negated `text`
  // subject rules (only text entities can match), and everything else —
  // special subjects `all`/`group` plus every negated subject —
  // in `propertyWildcard`. Evaluation order across buckets is irrelevant:
  // the yes/no sets dedupe and vetoes apply afterwards.
  propertyBySubject: Map<string, Rule[]>
  propertyText: Rule[]
  propertyWildcard: Rule[]
  // `level is …` property rules (positive subject only — the level entity
  // can never be negated into existence). Movement, interactions, win and
  // scroll checks all resolve level props; keeping them in a bucket turns
  // the per-call full-rule scan into a (usually empty) tiny loop.
  level: Rule[]
}

export type RuleRuntime = {
  buckets: RuleBuckets
  context: ReturnType<typeof createRuleMatchContext>
  // Active rule-instance multiplicity keyed by dedupe key — the official
  // `features` list keeps one entry per text formation, so two identical
  // `wall is move` rules both count (each listing bumps the mover's
  // `moves` via `been_seen`). Mimic-copied rules aren't in the map and
  // count once.
  ruleCounts: ReadonlyMap<string, number>
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
const WILDCARD_SUBJECT_WORDS = new Set(['all', 'group', 'group2', 'group3'])

export const createRuleBuckets = (rules: Rule[]): RuleBuckets => {
  const buckets: RuleBuckets = {
    eat: [],
    has: [],
    isProperty: [],
    isTransform: [],
    make: [],
    write: [],
    fear: [],
    follow: [],
    mimic: [],
    play: [],
    propertyBySubject: new Map(),
    propertyText: [],
    propertyWildcard: [],
    level: [],
  }

  for (const rule of rules) {
    if (rule.kind === 'is-property') {
      if (
        rule.subject === 'level' &&
        !rule.subjectNegated
      )
        buckets.level.push(rule)
      buckets.isProperty.push(rule)
      if (rule.subjectNegated || WILDCARD_SUBJECT_WORDS.has(rule.subject))
        buckets.propertyWildcard.push(rule)
      else if (rule.subject === 'text') buckets.propertyText.push(rule)
      else {
        const list = buckets.propertyBySubject.get(rule.subject) ?? []
        list.push(rule)
        buckets.propertyBySubject.set(rule.subject, list)
      }
    } else if (rule.kind === 'is-transform' || rule.kind === 'become')
      buckets.isTransform.push(rule)
    else if (rule.kind === 'has') buckets.has.push(rule)
    else if (rule.kind === 'make') buckets.make.push(rule)
    else if (rule.kind === 'eat') buckets.eat.push(rule)
    else if (rule.kind === 'fear') buckets.fear.push(rule)
    else if (rule.kind === 'follow') buckets.follow.push(rule)
    else if (rule.kind === 'mimic') buckets.mimic.push(rule)
    else if (rule.kind === 'play') buckets.play.push(rule)
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
  extras?: { idle?: boolean; turn?: number },
  ruleCounts?: ReadonlyMap<string, number>,
): RuleRuntime => ({
  buckets: createRuleBuckets(rules),
  context: createRuleMatchContext(items, rules, width, height, extras),
  height,
  overriddenTextIds,
  ruleCounts: ruleCounts ?? new Map(),
  rules,
  width,
})

export const collectRuleRuntime = (
  items: MatchItem[],
  width: number,
  height: number,
  extras?: { idle?: boolean; turn?: number },
): RuleRuntime => {
  // Official `code()` re-parses until the `x is word` set stabilizes:
  // each pass reads the previous featureindex's word units, and a changed
  // wordidentifier reruns the whole parse — so a `rock is word` formed
  // this turn still lets the same parse read `rock is flag`.
  let parsedItems = items
  for (let pass = 0; ; pass += 1) {
    // Overridden rules (`x is push` vetoed by `not x is push`, or
    // transforms suppressed by `x is x`) never take effect — mirror the
    // predecessor by feeding only active rules into the runtime.
    const partition = partitionRuleInstances(
      collectRuleInstances(parsedItems, width, height),
    )
    const rules: Rule[] = []
    const seen = new Set<string>()
    const ruleCounts = new Map<string, number>()
    for (const { rule } of partition.active) {
      const key = ruleDedupeKey(rule)
      ruleCounts.set(key, (ruleCounts.get(key) ?? 0) + 1)
      if (seen.has(key)) continue
      seen.add(key)
      rules.push(rule)
    }
    const runtime = createRuleRuntime(
      items,
      expandMimicRules(rules),
      width,
      height,
      textRuleMarksFromPartition(partition).overridden,
      extras,
      ruleCounts,
    )

    // `findwordunits`: units a positive `x is word` rule marks — plain
    // object-noun subjects only (the official check is `objectlist[name]`
    // plus `name ~= "text"`), with conditions gated per unit.
    const wordIds = new Set<number>()
    for (const rule of runtime.buckets.isProperty) {
      if (
        rule.object !== 'word' ||
        rule.objectNegated ||
        rule.subjectNegated ||
        isSpecialNounWord(rule.subject)
      )
        continue
      for (const item of items) {
        if (item.isText || wordIds.has(item.id)) continue
        if (matchesRuleSubject(item, rule, runtime.context))
          wordIds.add(item.id)
      }
    }
    const parsedWordIds = new Set<number>()
    for (const item of parsedItems)
      if (
        !item.isText &&
        'props' in item &&
        Array.isArray(item.props) &&
        (item.props as string[]).includes('word')
      )
        parsedWordIds.add(item.id)
    if (
      (wordIds.size === parsedWordIds.size &&
        [...wordIds].every((id) => parsedWordIds.has(id))) ||
      pass >= 50
    )
      return runtime
    parsedItems = items.map((item) => {
      if (item.isText) return item
      const marked =
        'props' in item &&
        Array.isArray(item.props) &&
        (item.props as string[]).includes('word')
      const wanted = wordIds.has(item.id)
      if (marked === wanted) return item
      const props = (('props' in item && Array.isArray(item.props)
        ? item.props
        : []) as string[]).filter((prop) => prop !== 'word')
      return {
        ...item,
        props: wanted ? [...props, 'word'] : props,
      }
    })
  }
}
