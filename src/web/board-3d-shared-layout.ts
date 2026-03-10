import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import {
  STACK_LAYER_PRIORITY,
  isGroundHugItem,
  sortGroundStack,
  sortUprightStack,
  stackLayerPriorityForItem,
} from '../view/stack-policy.js'

import type { GameState, Item } from '../logic/types.js'
import type { EntityView } from './board-3d-shared-types.js'

const {
  CARD_STACK_DEPTH,
  CARD_STACK_LATERAL_SPREAD,
  CARD_STACK_DEPTH_SPREAD,
  CARD_BASE_Z,
  CARD_LAYER_DEPTH,
  GROUND_HUG_BASE_Z,
  GROUND_HUG_STACK_DEPTH,
  FLOAT_ITEM_LIFT_Z,
} = BOARD3D_LAYOUT_CONFIG

const stackSpreadOffsets = (
  displayStackCount: number,
  displayStackIndex: number,
): { x: number; y: number } => {
  const centered = displayStackIndex - (displayStackCount - 1) / 2
  return {
    x: centered * CARD_STACK_LATERAL_SPREAD,
    y: centered * CARD_STACK_DEPTH_SPREAD,
  }
}

export const computeEntityBaseTarget = (
  state: GameState,
  view: EntityView,
): { x: number; y: number; baseZ: number } => {
  const { item, displayStackCount, displayStackIndex, layerPriority } = view
  const spread = stackSpreadOffsets(displayStackCount, displayStackIndex)
  const x = item.x - (state.width - 1) / 2 + spread.x
  const y = (state.height - 1) / 2 - item.y + spread.y
  const hasStack = displayStackCount > 1
  const floatLift = item.props.includes('float') ? FLOAT_ITEM_LIFT_Z : 0
  const baseZ = isGroundHugItem(item)
    ? GROUND_HUG_BASE_Z + (hasStack ? displayStackIndex * GROUND_HUG_STACK_DEPTH : 0) + floatLift
    : CARD_BASE_Z +
      (hasStack
        ? layerPriority * CARD_LAYER_DEPTH + displayStackIndex * CARD_STACK_DEPTH
        : 0) +
      floatLift
  return { x, y, baseZ }
}

export const buildEntityViews = (state: GameState): EntityView[] => {
  const grid = new Map<number, Item[]>()
  for (const item of state.items) {
    if (item.props.includes('hide')) continue

    const cellId = item.y * state.width + item.x
    const list = grid.get(cellId) ?? []
    list.push(item)
    grid.set(cellId, list)
  }

  const views: EntityView[] = []
  for (const stack of grid.values()) {
    const sortedUpright = sortUprightStack(stack)
    const sortedGround = sortGroundStack(stack)
    const uprightStack = sortedUpright
    const groundStack = sortedGround
    const sorted = [...sortedUpright, ...sortedGround]
    const stackCount = sorted.length
    const uprightStackIndexById = new Map<number, number>()
    const groundStackIndexById = new Map<number, number>()
    for (const [index, item] of sortedUpright.entries()) {
      uprightStackIndexById.set(item.id, index)
    }
    for (const [index, item] of sortedGround.entries()) {
      groundStackIndexById.set(item.id, index)
    }

    for (const [stackIndex, item] of sorted.entries()) {
      const groundHug = isGroundHugItem(item)
      const displayStackCount = groundHug ? groundStack.length : uprightStack.length
      const displayStackIndex = groundHug
        ? groundStackIndexById.get(item.id) ?? 0
        : uprightStackIndexById.get(item.id) ?? 0
      views.push({
        item,
        stackIndex,
        stackCount,
        displayStackIndex,
        displayStackCount,
        layerPriority: groundHug
          ? STACK_LAYER_PRIORITY.other
          : stackLayerPriorityForItem(item),
      })
    }
  }
  return views
}
