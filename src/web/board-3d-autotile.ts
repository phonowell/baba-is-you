import { isGroundHugItem } from '../view/stack-policy.js'
import {
  TILE_DIAG_NE,
  TILE_DIAG_NW,
  TILE_DIAG_SE,
  TILE_DIAG_SW,
  TILE_EDGE_E,
  TILE_EDGE_N,
  TILE_EDGE_S,
  TILE_EDGE_W,
  autotileAppliesTo,
  autotileJoins,
} from './pixel-sprites/autotile.js'

import type { GameState, Item } from '../logic/types.js'

// Cell → item-name lookup for tile masks: every visible object name can act
// as a join anchor (paths run into level icons and doors; region tiles join
// their own kind). Hidden and text items never anchor a join.
export const buildAutotileCells = (state: GameState): Map<number, Set<string>> => {
  const cells = new Map<number, Set<string>>()
  for (const item of state.items) {
    if (item.isText || item.props.includes('hide')) continue
    const key = item.y * state.width + item.x
    const names = cells.get(key)
    if (names) names.add(item.name)
    else cells.set(key, new Set([item.name]))
  }
  return cells
}

const NEIGHBOURS = [
  [0, -1, TILE_EDGE_N],
  [1, 0, TILE_EDGE_E],
  [0, 1, TILE_EDGE_S],
  [-1, 0, TILE_EDGE_W],
  [1, -1, TILE_DIAG_NE],
  [1, 1, TILE_DIAG_SE],
  [-1, 1, TILE_DIAG_SW],
  [-1, -1, TILE_DIAG_NW],
] as const

// 8-bit join mask for one autotiled tile: edge bits for the four orthogonal
// neighbours it joins, diagonal bits for region inner corners. Items without
// edge art (upright cards, belts) keep mask 0 so their visuals stay shared.
export const autotileMaskForItem = (
  item: Item,
  cells: ReadonlyMap<number, Set<string>>,
  width: number,
  height: number,
): number => {
  if (!isGroundHugItem(item) || !autotileAppliesTo(item.name)) return 0
  let mask = 0
  for (const [dx, dy, bit] of NEIGHBOURS) {
    const nx = item.x + dx
    const ny = item.y + dy
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
    const names = cells.get(ny * width + nx)
    if (!names) continue
    for (const name of names) {
      if (autotileJoins(item.name, name)) {
        mask |= bit
        break
      }
    }
  }
  return mask
}
