import { spawnByRules } from './spawn-by-rule.js'

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
      return {
        id,
        name: target,
        x: source.x,
        y: source.y,
        isText: true,
        props: [],
        ...(source.dir ? { dir: source.dir } : {}),
      }
    },
    spawnedSignature: (item) => signatureFor(item.name),
  })
}
