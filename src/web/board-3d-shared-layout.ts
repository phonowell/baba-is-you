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
  // `level is you/move/…` scrolls the room (official `MF_scrollroom`):
  // render positions shift by the accumulated cell offset and wrap at
  // the edges, so the torus seam lands inside the static board frame.
  const offsetX = state.levelOffset?.x ?? 0
  const offsetY = state.levelOffset?.y ?? 0
  const cellX =
    (((item.x + offsetX) % state.width) + state.width) % state.width
  const cellY =
    (((item.y + offsetY) % state.height) + state.height) % state.height
  const x = cellX - (state.width - 1) / 2 + spread.x
  const y = (state.height - 1) / 2 - cellY + spread.y
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
    // Single-card cells dominate the board — emit the view directly
    // instead of paying for two filtered sorts and their index maps.
    if (stack.length === 1) {
      const item = stack[0]
      if (!item) continue
      views.push({
        item,
        stackIndex: 0,
        stackCount: 1,
        displayStackIndex: 0,
        displayStackCount: 1,
        layerPriority: isGroundHugItem(item)
          ? STACK_LAYER_PRIORITY.other
          : stackLayerPriorityForItem(item),
      })
      continue
    }

    const uprightStack = sortUprightStack(stack)
    const groundStack = sortGroundStack(stack)
    const stackCount = uprightStack.length + groundStack.length

    // Upright cards stack above ground-hugging tiles; `displayStackIndex`
    // counts within the item's own sub-stack.
    let stackIndex = 0
    for (const [index, item] of uprightStack.entries()) {
      views.push({
        item,
        stackIndex: stackIndex++,
        stackCount,
        displayStackIndex: index,
        displayStackCount: uprightStack.length,
        layerPriority: stackLayerPriorityForItem(item),
      })
    }
    for (const [index, item] of groundStack.entries()) {
      views.push({
        item,
        stackIndex: stackIndex++,
        stackCount,
        displayStackIndex: index,
        displayStackCount: groundStack.length,
        layerPriority: STACK_LAYER_PRIORITY.other,
      })
    }
  }
  return views
}
