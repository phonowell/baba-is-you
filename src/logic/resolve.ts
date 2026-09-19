import { GROUP_NOUNS, matchesRuleSubject } from './rule-match.js'
import { isPropertyRule } from './types.js'

import type { RuleRuntime } from './rule-runtime.js'
import type { Item, LevelItem, Property, Rule } from './types.js'
export { applyTransforms } from './resolve-transforms.js'

const sameProps = (a: readonly Property[], b: readonly Property[]): boolean =>
  a.length === b.length && a.every((prop, index) => prop === b[index])

const NO_RULES: Rule[] = []

// When no is-property rule carries a condition and no unconditional
// `all is group*` rule derives membership from the live item set, every
// rule match is a pure function of (isText, name): props resolve to one
// shared array per entity kind. Cached per rules array — rebinds and the
// next step all pass the same `rules` reference, so the memo survives
// them. `null` marks rulesets that are not name-only.
const staticPropCaches = new WeakMap<Rule[], Map<string, Property[]> | null>()

const staticPropCacheFor = (rules: Rule[]): Map<string, Property[]> | null => {
  const cached = staticPropCaches.get(rules)
  if (cached !== undefined) return cached
  const nameOnly = !rules.some(
    (rule) =>
      isPropertyRule(rule) &&
      // `empty` rules never match an entity — their conditions can't
      // disturb item props, so they don't disqualify the memo.
      rule.subject !== 'empty' &&
      (rule.condition !== undefined ||
        (rule.subject === 'all' &&
          !rule.subjectNegated &&
          !rule.objectNegated &&
          GROUP_NOUNS.has(rule.object))),
  )
  const cache = nameOnly ? new Map<string, Property[]>() : null
  staticPropCaches.set(rules, cache)
  return cache
}

export const applyProperties = (
  items: LevelItem[],
  runtime: RuleRuntime,
): Item[] => {
  const { propertyBySubject, propertyText, propertyWildcard } =
    runtime.buckets
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

  const staticCache = staticPropCacheFor(runtime.rules)
  const propsFor = (item: LevelItem): Property[] => {
    const yes: string[] = []
    const no: string[] = []

    if (item.isText) yes.push('push')

    // Subject-indexed buckets: a text entity can only satisfy `text`
    // subjects; a named entity only its own bucket plus wildcards. Same
    // (item, rule) evaluations as scanning `isProperty` in order.
    const candidates = item.isText
      ? propertyText
      : (propertyBySubject.get(item.name) ?? NO_RULES)
    for (const rule of candidates) applyRule(item, rule, yes, no)
    if (!item.isText)
      for (const rule of propertyWildcard) applyRule(item, rule, yes, no)

    return (
      no.length ? yes.filter((value) => !no.includes(value)) : yes
    ).sort() as Property[]
  }

  return items.map((item) => {
    let props: Property[]
    if (staticCache) {
      // All text entities resolve identically (`text` subject + implicit
      // `push`); units key by name. `\0` can't appear in a word name.
      const key = item.isText ? '\u0000' : item.name
      const cached = staticCache.get(key)
      if (cached !== undefined) {
        props = cached
      } else {
        props = propsFor(item)
        staticCache.set(key, props)
      }
    } else {
      props = propsFor(item)
    }

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
