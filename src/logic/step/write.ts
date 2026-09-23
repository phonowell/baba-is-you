import { spawnByRules, spawnedItem } from './spawn-by-rule.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item } from '../types.js'

export const applyWrite = (
  items: Item[],
  runtime: RuleRuntime,
): {
  items: Item[]
  changed: boolean
} => {
  const signatureFor = (name: string): string => `1:${name}`

  return spawnByRules(items, runtime.buckets.write, runtime, {
    existingSignature: (item) => (item.isText ? signatureFor(item.name) : null),
    spawn: (source, target, id) => {
      if (target === 'empty') return null
      return spawnedItem(source, target, true, id)
    },
    spawnedSignature: (item) => signatureFor(item.name),
  })
}
