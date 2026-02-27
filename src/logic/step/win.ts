import { emptyHasProp } from '../empty.js'
import { hasProp, keyFor, splitByFloatLayer } from './shared.js'

import type { Item, Rule } from '../types.js'

const buildCellMap = (items: Item[], width: number): Map<number, Item[]> => {
  const byCell = new Map<number, Item[]>()
  for (const item of items) {
    const key = keyFor(item.x, item.y, width)
    const list = byCell.get(key) ?? []
    list.push(item)
    byCell.set(key, list)
  }
  return byCell
}

export const checkWin = (
  items: Item[],
  width: number,
  rules: Rule[] = [],
  height = 0,
): boolean => {
  const byCell = buildCellMap(items, width)
  for (const list of byCell.values()) {
    for (const layer of splitByFloatLayer(list)) {
      const hasYou = layer.some((item) => hasProp(item, 'you'))
      if (!hasYou) continue
      if (layer.some((item) => hasProp(item, 'win'))) return true
    }
  }

  if (!height || !rules.length) return false
  if (!emptyHasProp(rules, 'you', items, width, height)) return false
  if (!emptyHasProp(rules, 'win', items, width, height)) return false
  return true
}

export const hasAnyYou = (
  items: Item[],
  rules: Rule[] = [],
  width = 0,
  height = 0,
): boolean => {
  for (const item of items) if (hasProp(item, 'you')) return true

  if (width > 0 && height > 0 && rules.length)
    return emptyHasProp(rules, 'you', items, width, height)
  return false
}
