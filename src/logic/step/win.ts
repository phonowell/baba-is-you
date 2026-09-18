import { keyForLayer } from '../helpers.js'

import { hasProp } from './shared.js'

import type { Item } from '../types.js'

// Single pass: win iff some (cell, float-layer) holds both `you` and
// `win`. Layer keys mirror `splitByFloatLayer` without building cell
// lists; the EMPTY-subject half is decided by the caller's precomputed
// `emptyProps` (`resolveActiveEmptyProps` already covers the
// no-empty-rules/no-empty-cells early-outs).
export const checkWin = (
  items: Item[],
  width: number,
  emptyProps: ReadonlySet<string>,
): boolean => {
  const youLayers = new Set<number>()
  const winLayers = new Set<number>()
  for (const item of items) {
    if (hasProp(item, 'you'))
      youLayers.add(keyForLayer(item.x, item.y, width, hasProp(item, 'float')))
    if (hasProp(item, 'win'))
      winLayers.add(keyForLayer(item.x, item.y, width, hasProp(item, 'float')))
  }
  for (const key of youLayers) if (winLayers.has(key)) return true

  return emptyProps.has('you') && emptyProps.has('win')
}

export const hasAnyYou = (
  items: Item[],
  emptyProps: ReadonlySet<string>,
): boolean => {
  for (const item of items) if (hasProp(item, 'you')) return true
  return emptyProps.has('you')
}
