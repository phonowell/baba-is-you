import { resolveRuleTargets } from './resolve-targets.js'
import { matchesRuleSubject } from './rule-match.js'
import { PROPERTY_WORDS } from './types.js'

import type { RuleRuntime } from './rule-runtime.js'
import type { Item, LevelItem, Property, Rule } from './types.js'

const toTransformed = (item: LevelItem, target: string): LevelItem | null => {
  if (target === 'empty') return null

  if (target === 'text') {
    return {
      ...item,
      name: item.isText ? 'text' : item.name,
      isText: true,
    }
  }

  return {
    ...item,
    name: target,
    isText: false,
  }
}

const transformVariants = (
  item: LevelItem,
  target: string,
  allTargets: string[],
): LevelItem[] => {
  if (target === 'all') {
    return allTargets
      .map((name) => toTransformed(item, name))
      .filter((value): value is LevelItem => value !== null)
  }

  const transformed = toTransformed(item, target)
  if (!transformed) return []
  return [transformed]
}

const createFromEmpty = (
  id: number,
  x: number,
  y: number,
  target: string,
): LevelItem | null => {
  if (target === 'empty') return null
  if (target === 'text') {
    return {
      id,
      name: 'empty',
      x,
      y,
      isText: true,
    }
  }

  return {
    id,
    name: target,
    x,
    y,
    isText: false,
  }
}

const resolveEmptyTargets = (rules: Rule[]): string[] => {
  const yes = new Set<string>()
  const no = new Set<string>()
  for (const rule of rules) {
    if (rule.kind !== 'transform') continue
    if (rule.subject !== 'empty') continue
    if (rule.subjectNegated) continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }
  return Array.from(yes).filter((target) => !no.has(target))
}

export const applyTransforms = (
  items: LevelItem[],
  runtime: RuleRuntime,
): {
  items: LevelItem[]
  changed: boolean
} => {
  const { context, height, width } = runtime
  const transformRules = runtime.buckets.transform
  if (!transformRules.length) return { items, changed: false }
  const allTargets = Array.from(
    new Set(items.filter((item) => !item.isText).map((item) => item.name)),
  )

  const next: LevelItem[] = []
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  let changed = false

  for (const item of items) {
    const targets = resolveRuleTargets(
      item,
      transformRules,
      (candidate, rule) => matchesRuleSubject(candidate, rule, context),
    )
    if (!targets.length) {
      next.push(item)
      continue
    }

    const transformedByKey = new Map<string, LevelItem>()
    for (const target of targets) {
      const variants = transformVariants(item, target, allTargets)
      for (const variant of variants) {
        transformedByKey.set(
          `${variant.isText ? '1' : '0'}:${variant.name}`,
          variant,
        )
      }
    }
    const transformed = Array.from(transformedByKey.values())
    if (!transformed.length) {
      changed = true
      continue
    }

    const nonIdentity = transformed.filter(
      (value) => value.name !== item.name || value.isText !== item.isText,
    )
    if (!nonIdentity.length) {
      next.push(item)
      continue
    }

    changed = true
    const hasIdentity = transformed.length !== nonIdentity.length
    if (hasIdentity) {
      next.push(item)
      for (const extra of nonIdentity) next.push({ ...extra, id: nextId++ })
      continue
    }

    const first = nonIdentity[0]
    if (!first) continue
    next.push({ ...first, id: item.id })
    for (const rest of nonIdentity.slice(1))
      next.push({ ...rest, id: nextId++ })
  }

  const emptyTargets = resolveEmptyTargets(transformRules)
  if (emptyTargets.length) {
    const occupied = new Set<number>()
    for (const item of next) occupied.add(item.y * width + item.x)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellKey = y * width + x
        if (occupied.has(cellKey)) continue

        for (const target of emptyTargets) {
          const spawned = createFromEmpty(nextId, x, y, target)
          if (!spawned) continue
          next.push(spawned)
          nextId += 1
          changed = true
        }
      }
    }
  }

  return { items: next, changed }
}

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
