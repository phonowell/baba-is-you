import { PROPERTY_WORDS } from './types.js'

import type { Item, LevelItem, Property, Rule } from './types.js'

const appliesToSubject = (item: LevelItem, subject: string): boolean => {
  if (subject === 'text') return item.isText

  if (item.isText) return false

  return item.name === subject
}

const transformTarget = (
  subject: string,
  target: string,
  item: LevelItem,
): LevelItem => {
  if (target === 'text') {
    return {
      ...item,
      name: subject,
      isText: true,
    }
  }

  return {
    ...item,
    name: target,
    isText: false,
  }
}

export const applyTransforms = (
  items: LevelItem[],
  rules: Rule[],
): {
  items: LevelItem[]
  changed: boolean
} => {
  const transforms = new Map<string, string[]>()
  for (const rule of rules) {
    if (rule.kind !== 'transform') continue

    const list = transforms.get(rule.subject) ?? []
    list.push(rule.object)
    transforms.set(rule.subject, list)
  }

  if (!transforms.size) return { items, changed: false }

  const next: LevelItem[] = []
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  let changed = false

  for (const item of items) {
    let subject = ''
    let targets: string[] | undefined

    if (item.isText && transforms.has('text')) {
      subject = 'text'
      targets = transforms.get('text')
    } else if (!item.isText && transforms.has(item.name)) {
      subject = item.name
      targets = transforms.get(item.name)
    }

    if (!targets?.length || !appliesToSubject(item, subject)) {
      next.push(item)
      continue
    }

    changed = true

    const [firstTarget, ...restTargets] = targets
    if (!firstTarget) {
      next.push(item)
      continue
    }

    if (restTargets.length === 0) {
      next.push(transformTarget(subject, firstTarget, item))
      continue
    }

    next.push(transformTarget(subject, firstTarget, item))
    for (const target of restTargets) {
      const base = transformTarget(subject, target, item)
      next.push({ ...base, id: nextId++ })
    }
  }

  return { items: next, changed }
}

export const applyProperties = (items: LevelItem[], rules: Rule[]): Item[] =>
  items.map((item) => {
    const props = new Set<Property>()

    if (item.isText) props.add('push')

    for (const rule of rules) {
      if (rule.kind !== 'property') continue

      if (rule.subject === 'text') {
        if (item.isText) {
          if (PROPERTY_WORDS.has(rule.object))
            props.add(rule.object as Property)
        }
        continue
      }

      if (!item.isText && item.name === rule.subject)
        if (PROPERTY_WORDS.has(rule.object)) props.add(rule.object as Property)
    }

    return {
      ...item,
      props: Array.from(props).sort(),
    }
  })
