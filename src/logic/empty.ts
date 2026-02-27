import { keyFor } from './helpers.js'
import { PROPERTY_WORDS } from './types.js'

import type { Property, Rule } from './types.js'

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
    if (rule.kind !== 'property') continue
    if (rule.subject !== 'empty') continue
    if (rule.subjectNegated) continue
    if (rule.condition) continue
    if (!PROPERTY_WORDS.has(rule.object)) continue

    const prop = rule.object as Property
    if (rule.objectNegated) no.add(prop)
    else yes.add(prop)
  }

  const result = new Set<Property>()
  for (const prop of yes) if (!no.has(prop)) result.add(prop)
  return result
}

export const emptyHasProp = (
  rules: Rule[],
  prop: Property,
  items: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): boolean => {
  if (!hasAnyEmptyCell(items, width, height)) return false
  return resolveEmptyProperties(rules).has(prop)
}
