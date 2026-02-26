import { PROPERTY_WORDS } from './types.js'

import type { Item, LevelItem, Property, Rule } from './types.js'

const matchesSubject = (item: LevelItem, rule: Rule): boolean => {
  const subjectNegated = rule.subjectNegated ?? false

  if (rule.subject === 'text')
    return subjectNegated ? !item.isText : item.isText
  if (rule.subject === 'empty') return false
  if (item.isText) return false
  return subjectNegated
    ? item.name !== rule.subject
    : item.name === rule.subject
}

const resolveTargets = (
  item: LevelItem,
  rules: Rule[],
  kind: Rule['kind'],
): string[] => {
  const yes = new Set<string>()
  const no = new Set<string>()

  for (const rule of rules) {
    if (rule.kind !== kind) continue
    if (!matchesSubject(item, rule)) continue

    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  return Array.from(yes).filter((target) => !no.has(target))
}

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
  rules: Rule[],
  width: number,
  height: number,
): {
  items: LevelItem[]
  changed: boolean
} => {
  const transformRules = rules.filter((rule) => rule.kind === 'transform')
  if (!transformRules.length) return { items, changed: false }

  const next: LevelItem[] = []
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  let changed = false

  for (const item of items) {
    const targets = resolveTargets(item, transformRules, 'transform')
    if (!targets.length) {
      next.push(item)
      continue
    }

    const transformed = targets
      .map((target) => toTransformed(item, target))
      .filter((value): value is LevelItem => value !== null)

    const hasIdentity = transformed.some(
      (value) => value.name === item.name && value.isText === item.isText,
    )
    if (hasIdentity) {
      next.push(item)
      continue
    }

    if (!transformed.length) {
      changed = true
      continue
    }

    changed = true
    const first = transformed[0]
    if (!first) continue
    next.push({ ...first, id: item.id })
    for (const rest of transformed.slice(1))
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

export const applyProperties = (items: LevelItem[], rules: Rule[]): Item[] =>
  items.map((item) => {
    const yes = new Set<string>()
    const no = new Set<string>()

    if (item.isText) yes.add('push')

    for (const rule of rules) {
      if (rule.kind !== 'property') continue
      if (!PROPERTY_WORDS.has(rule.object)) continue
      if (!matchesSubject(item, rule)) continue

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
