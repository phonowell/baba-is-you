import { resolveRuleTargets } from '../helpers.js'
import { matchesRuleSubject, subjectRuleCandidates } from '../rule-match.js'

import { keyFor } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item, Rule } from '../types.js'

type SpawnByRuleOptions = {
  existingSignature: (item: Item) => string | null
  spawn: (source: Item, target: string, id: number) => Item | null
  spawnedSignature: (item: Item) => string
}

// The converted-card record make/write both emit — a fresh id on the
// source's cell carrying its facing.
export const spawnedItem = (
  source: Item,
  name: string,
  isText: boolean,
  id: number,
): Item => ({
  id,
  name,
  x: source.x,
  y: source.y,
  isText,
  props: [],
  converted: true,
  spawned: true,
  ...(source.dir ? { dir: source.dir } : {}),
})

export const spawnByRules = (
  items: Item[],
  rules: Rule[],
  runtime: RuleRuntime,
  options: SpawnByRuleOptions,
): {
  items: Item[]
  changed: boolean
} => {
  if (!rules.length) return { items, changed: false }

  const existingByCell = new Map<number, Set<string>>()
  const addExisting = (cellKey: number, signature: string): void => {
    const signatures = existingByCell.get(cellKey) ?? new Set<string>()
    signatures.add(signature)
    existingByCell.set(cellKey, signatures)
  }

  for (const item of items) {
    const signature = options.existingSignature(item)
    if (!signature) continue
    const cellKey = keyFor(item.x, item.y, runtime.width)
    addExisting(cellKey, signature)
  }

  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const spawned: Item[] = []

  for (const item of items) {
    const targets = resolveRuleTargets(
      item,
      subjectRuleCandidates(rules, item),
      (candidate, rule) => matchesRuleSubject(candidate, rule, runtime.context),
    )
    if (!targets.length) continue

    const cellKey = keyFor(item.x, item.y, runtime.width)
    for (const target of targets) {
      const created = options.spawn(item, target, nextId)
      if (!created) continue

      const signature = options.spawnedSignature(created)
      if (existingByCell.get(cellKey)?.has(signature)) continue
      addExisting(cellKey, signature)
      spawned.push(created)
      nextId += 1
    }
  }

  if (!spawned.length) return { items, changed: false }
  return { items: [...items, ...spawned], changed: true }
}
