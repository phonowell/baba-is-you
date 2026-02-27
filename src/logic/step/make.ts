import { spawnByRules } from './spawn-by-rule.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item } from '../types.js'

export const applyMake = (
  items: Item[],
  runtime: RuleRuntime,
): {
  items: Item[]
  changed: boolean
} => {
  const signatureFor = (name: string, isText: boolean): string =>
    `${isText ? '1' : '0'}:${name}`

  return spawnByRules(items, runtime.buckets.make, runtime, {
    existingSignature: (item) => signatureFor(item.name, item.isText),
    spawn: (source, target, id) => {
      if (target === 'empty') return null
      if (target === 'text') {
        return {
          id,
          name: source.isText ? 'text' : source.name,
          x: source.x,
          y: source.y,
          isText: true,
          props: [],
          ...(source.dir ? { dir: source.dir } : {}),
        }
      }

      return {
        id,
        name: target,
        x: source.x,
        y: source.y,
        isText: false,
        props: [],
        ...(source.dir ? { dir: source.dir } : {}),
      }
    },
    spawnedSignature: (item) => signatureFor(item.name, item.isText),
  })
}
