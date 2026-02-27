import { matchesRuleSubject } from './rule-match.js'
import { PROPERTY_WORDS } from './types.js'

import type { RuleRuntime } from './rule-runtime.js'
import type { Item, LevelItem, Property } from './types.js'
export { applyTransforms } from './resolve-transforms.js'

export const applyProperties = (
  items: LevelItem[],
  runtime: RuleRuntime,
): Item[] => {
  const propertyRules = runtime.buckets.property
  if (!propertyRules.length) {
    return items.map((item) => ({
      ...item,
      props: item.isText ? ['push'] : [],
    }))
  }

  const { context } = runtime
  return items.map((item) => {
    const yes = new Set<string>()
    const no = new Set<string>()

    if (item.isText) yes.add('push')

    for (const rule of propertyRules) {
      if (!PROPERTY_WORDS.has(rule.object)) continue
      if (!matchesRuleSubject(item, rule, context)) continue
      if (rule.objectNegated) no.add(rule.object)
      else yes.add(rule.object)
    }

    const props = Array.from(yes)
      .filter((value) => !no.has(value))
      .map((value) => value as Property)
      .sort()

    return {
      ...item,
      props,
    }
  })
}
