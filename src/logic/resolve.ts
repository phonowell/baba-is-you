import { matchesRuleSubject } from './rule-match.js'
import { isPropertyRule } from './types.js'

import type { RuleRuntime } from './rule-runtime.js'
import type { Item, LevelItem, Property, Rule } from './types.js'
export { applyTransforms } from './resolve-transforms.js'

const sameProps = (a: readonly Property[], b: readonly Property[]): boolean =>
  a.length === b.length && a.every((prop, index) => prop === b[index])

const NO_RULES: Rule[] = []

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

  return items.map((item) => {
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
    if (!item.isText) for (const rule of propertyWildcard) applyRule(item, rule, yes, no)

    const props = (
      no.length ? yes.filter((value) => !no.includes(value)) : yes
    ).sort() as Property[]

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
