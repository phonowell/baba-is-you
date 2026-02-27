import { matchesRuleObjectWord, matchesRuleSubject } from '../rule-match.js'

import {
  appendHasSpawns,
  hasProp,
  keyFor,
  splitByFloatLayer,
} from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item } from '../types.js'

const applyOpenShut = (items: Item[], removed: Set<number>): boolean => {
  const opens = items.filter((item) => hasProp(item, 'open'))
  const shuts = items.filter((item) => hasProp(item, 'shut'))
  const pairCount = Math.min(opens.length, shuts.length)
  if (!pairCount) return false

  let changed = false
  for (let i = 0; i < pairCount; i += 1) {
    const open = opens[i]
    const shut = shuts[i]
    if (open) {
      removed.add(open.id)
      changed = true
    }
    if (shut) {
      removed.add(shut.id)
      changed = true
    }
  }

  return changed
}

export const applyInteractions = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; changed: boolean } => {
  const { height, width } = runtime
  const byCell = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    list.push(item)
    byCell.set(key, list)
  }

  const removed = new Set<number>()
  let changed = false
  const eatRules = runtime.buckets.eat
  const ruleContext = runtime.context

  for (const list of byCell.values()) {
    for (const layer of splitByFloatLayer(list)) {
      if (!layer.length) continue
      const occupied = layer.length > 1

      if (occupied) {
        const hasSink = layer.some((item) => hasProp(item, 'sink'))
        if (hasSink) {
          for (const item of layer) removed.add(item.id)
          changed = true
        }
      }

      const hasDefeat = layer.some((item) => hasProp(item, 'defeat'))
      if (hasDefeat) {
        for (const item of layer) {
          if (hasProp(item, 'you')) {
            removed.add(item.id)
            changed = true
          }
        }
      }

      const hasHot = layer.some((item) => hasProp(item, 'hot'))
      if (hasHot) {
        for (const item of layer) {
          if (hasProp(item, 'melt')) {
            removed.add(item.id)
            changed = true
          }
        }
      }

      const openShutChanged = applyOpenShut(layer, removed)
      if (openShutChanged) changed = true

      if (eatRules.length) {
        for (const eater of layer) {
          if (removed.has(eater.id)) continue
          for (const rule of eatRules) {
            if (!matchesRuleSubject(eater, rule, ruleContext)) continue

            for (const target of layer) {
              if (target.id === eater.id) continue
              if (removed.has(target.id)) continue

              const targetMatched = matchesRuleObjectWord(
                target,
                rule.object,
                ruleContext.groupMembers,
              )
              const shouldEat = rule.objectNegated
                ? !targetMatched
                : targetMatched
              if (!shouldEat) continue
              removed.add(target.id)
              changed = true
            }
          }
        }
      }

      if (occupied) {
        for (const item of layer) {
          if (hasProp(item, 'weak')) {
            removed.add(item.id)
            changed = true
          }
        }
      }
    }
  }

  if (!removed.size) return { items, changed }

  const survivors = items.filter((item) => !removed.has(item.id))
  const removedItems = items.filter((item) => removed.has(item.id))
  const spawned = appendHasSpawns(
    survivors,
    removedItems,
    runtime.buckets.has,
    false,
    width,
    height,
    items,
  )

  return {
    items: spawned.items,
    changed: changed || spawned.changed,
  }
}
