import { GROUP_NOUNS, matchesRuleSubject } from './rule-match.js'
import { isPropertyRule } from './types.js'

import type { RuleRuntime } from './rule-runtime.js'
import type { Item, LevelItem, Property, Rule } from './types.js'
export { applyTransforms } from './resolve-transforms.js'

const sameProps = (a: readonly Property[], b: readonly Property[]): boolean =>
  a.length === b.length && a.every((prop, index) => prop === b[index])

const NO_RULES: Rule[] = []

// Per-rules-array index over the is-property set, partitioned the same
// way `createRuleBuckets` splits subjects. Unconditional rules are
// name-static — their verdict depends only on (isText, name) plus the
// rules-derived group membership — so they resolve once per name and
// feed every item's baseline; conditional rules stay per-item. An
// unconditional `all is group*` rule derives membership from the live
// item set, which blocks the base memo (`base: null`). `empty`-subject
// positives never match an entity and drop out of both sides.
type PropRuleBuckets = {
  byName: Map<string, Rule[]>
  text: Rule[]
  wildcard: Rule[]
}
type PropRuleIndex = {
  base: Map<string, { yes: string[]; no: string[] }> | null
  conditional: PropRuleBuckets
  // With no conditional rules the resolved props themselves are
  // name-static — memoize the final array, skipping even the baseline
  // merge per item.
  final: Map<string, Property[]> | null
  unconditional: PropRuleBuckets
}

const propRuleIndexes = new WeakMap<Rule[], PropRuleIndex>()

const propRuleIndexFor = (rules: Rule[]): PropRuleIndex => {
  const cached = propRuleIndexes.get(rules)
  if (cached) return cached
  const index: PropRuleIndex = {
    base: new Map(),
    conditional: { byName: new Map(), text: [], wildcard: [] },
    final: new Map(),
    unconditional: { byName: new Map(), text: [], wildcard: [] },
  }
  const insert = (buckets: PropRuleBuckets, rule: Rule): void => {
    if (
      rule.subjectNegated === true ||
      rule.subject === 'all' ||
      GROUP_NOUNS.has(rule.subject)
    )
      buckets.wildcard.push(rule)
    else if (rule.subject === 'text') buckets.text.push(rule)
    else {
      const list = buckets.byName.get(rule.subject) ?? []
      list.push(rule)
      buckets.byName.set(rule.subject, list)
    }
  }
  for (const rule of rules) {
    if (!isPropertyRule(rule)) continue
    if (rule.subject === 'empty' && !rule.subjectNegated) continue
    if (rule.condition) {
      insert(index.conditional, rule)
      continue
    }
    insert(index.unconditional, rule)
    // `all is group*` unconditional: membership is items-derived.
    if (
      rule.subject === 'all' &&
      !rule.subjectNegated &&
      !rule.objectNegated &&
      GROUP_NOUNS.has(rule.object)
    )
      index.base = null
  }
  if (index.base === null) index.final = null
  else if (
    index.conditional.byName.size > 0 ||
    index.conditional.text.length > 0 ||
    index.conditional.wildcard.length > 0
  )
    index.final = null
  propRuleIndexes.set(rules, index)
  return index
}

export const applyProperties = (
  items: LevelItem[],
  runtime: RuleRuntime,
): Item[] => {
  if (!runtime.buckets.isProperty.length) {
    return items.map((item) => {
      const prev = (item as Item).props
      if (item.isText) {
        if (prev && prev.length === 1 && prev[0] === 'push') return item as Item
        return { ...item, props: ['push'] }
      }
      if (prev && prev.length === 0) return item as Item
      return { ...item, props: [] }
    })
  }

  const { context } = runtime
  const applyRule = (
    item: LevelItem,
    rule: Rule,
    yes: string[],
    no: string[],
  ): void => {
    if (!isPropertyRule(rule)) return
    if (!matchesRuleSubject(item, rule, context)) return
    const list = rule.objectNegated ? no : yes
    if (!list.includes(rule.object)) list.push(rule.object)
  }

  const index = propRuleIndexFor(runtime.rules)
  const candidatesFor = (
    buckets: PropRuleBuckets,
    item: LevelItem,
  ): readonly Rule[] =>
    item.isText ? buckets.text : (buckets.byName.get(item.name) ?? NO_RULES)

  const propsFor = (item: LevelItem): Property[] => {
    const yes: string[] = []
    const no: string[] = []

    const applyBucket = (buckets: PropRuleBuckets): void => {
      for (const rule of candidatesFor(buckets, item))
        applyRule(item, rule, yes, no)
      if (!item.isText)
        for (const rule of buckets.wildcard)
          applyRule(item, rule, yes, no)
    }

    if (index.base) {
      // All text entities resolve identically (`text` subject + implicit
      // `push`); units key by name. `\0` can't appear in a word name.
      const key = item.isText ? '\u0000' : item.name
      const cached = index.base.get(key)
      if (cached) {
        yes.push(...cached.yes)
        no.push(...cached.no)
      } else {
        if (item.isText) yes.push('push')
        applyBucket(index.unconditional)
        index.base.set(key, {
          yes: [...yes],
          no: [...no],
        })
      }
    } else {
      if (item.isText) yes.push('push')
      applyBucket(index.unconditional)
    }

    applyBucket(index.conditional)

    return (
      no.length ? yes.filter((value) => !no.includes(value)) : yes
    ).sort() as Property[]
  }

  return items.map((item) => {
    let props: Property[] | undefined
    if (index.final) {
      const key = item.isText ? '\u0000' : item.name
      const cached = index.final.get(key)
      if (cached !== undefined) props = cached
      else {
        props = propsFor(item)
        index.final.set(key, props)
      }
    }
    if (props === undefined) props = propsFor(item)

    // Reapply pipelines rebuild the frame repeatedly; an item whose props
    // came out identical keeps its object, which the callers' clones and
    // the pairwise `sameItems` check both absorb for free.
    const prev = (item as Item).props
    if (prev && sameProps(prev, props)) return item as Item
    return {
      ...item,
      props,
    }
  })
}
