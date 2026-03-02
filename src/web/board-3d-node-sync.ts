import {
  BOARD3D_LAYOUT_CONFIG,
  BOARD3D_SHADOW_CONFIG,
  BOARD3D_ANIMATION_CONFIG,
} from './board-3d-config.js'
import {
  buildEntityViews,
  cardRollForItemStep,
  cardRotXForItem,
  computeEntityBaseTarget,
  emojiPhaseOffsetMsForItem,
  emojiStretchEnabledForItem,
  isEmojiItem,
} from './board-3d-shared.js'

import type { Group } from 'three'
import type { GameState } from '../logic/types.js'
import type {
  EntityBaseTarget,
  EntityNode,
  SyncEntityNodesDeps,
} from './board-3d-node-types.js'

const {
  ENTITY_IDLE_SHADOW_SCALE,
  POSITION_EPSILON,
} = BOARD3D_LAYOUT_CONFIG

const {
  SHADOW_BASE_Z,
  ENTITY_SHADOW_OPACITY,
} = BOARD3D_SHADOW_CONFIG

const {
  MOVE_ANIM_MS,
} = BOARD3D_ANIMATION_CONFIG

const setNodeIdlePose = (node: EntityNode, target: EntityBaseTarget, roll: number): void => {
  node.mesh.position.set(target.x, target.y, target.baseZ)
  node.mesh.rotation.set(node.rotX, 0, roll)
  node.mesh.scale.set(1, 1, 1)
  node.shadow.position.set(target.x, target.y, SHADOW_BASE_Z)
  node.shadow.scale.set(
    ENTITY_IDLE_SHADOW_SCALE,
    ENTITY_IDLE_SHADOW_SCALE,
    1,
  )
  node.shadowMaterial.opacity = ENTITY_SHADOW_OPACITY
}

const setNodeTarget = (node: EntityNode, target: EntityBaseTarget): void => {
  node.toX = target.x
  node.toY = target.y
  node.toBaseZ = target.baseZ
}

const initializeNodeAtTarget = (node: EntityNode, target: EntityBaseTarget): void => {
  setNodeTarget(node, target)
  node.fromX = node.toX
  node.fromY = node.toY
  node.fromBaseZ = node.toBaseZ
  node.fromRoll = node.rotRoll
  node.toRoll = node.rotRoll
  setNodeIdlePose(node, target, node.rotRoll)
}

export const removeEntityNode = (
  nodes: Map<number, EntityNode>,
  entityGroup: Group,
  id: number,
): void => {
  const node = nodes.get(id)
  if (!node) return
  entityGroup.remove(node.mesh)
  entityGroup.remove(node.shadow)
  node.shadowMaterial.dispose()
  nodes.delete(id)
}

export const syncEntityNodes = (state: GameState, deps: SyncEntityNodesDeps): void => {
  const { nodes, createNode, getMaterial } = deps
  const nowMs = performance.now()
  const seen = new Set<number>()
  const views = buildEntityViews(state)

  for (const view of views) {
    const item = view.item
    seen.add(item.id)

    let node = nodes.get(item.id)
    const nodeCreated = !node
    if (!node) {
      node = createNode(item, nowMs)
      nodes.set(item.id, node)
    } else if (node.despawnStartMs !== null) {
      node.despawnStartMs = null
      node.spawnStartMs = nowMs
    }

    const target = computeEntityBaseTarget(state, view)
    const material = getMaterial(item)
    if (node.mesh.material !== material) node.mesh.material = material
    const emoji = isEmojiItem(item)
    node.isEmoji = emojiStretchEnabledForItem(item)
    node.emojiPhaseOffsetMs = emojiPhaseOffsetMsForItem(item)
    node.mesh.castShadow = true
    node.mesh.receiveShadow = !emoji
    node.rotX = cardRotXForItem(item)
    const stableRoll = cardRollForItemStep(item, node.rollStep)
    if (!node.moving && Math.abs(node.rotRoll - stableRoll) > POSITION_EPSILON) {
      node.rotRoll = stableRoll
      node.fromRoll = stableRoll
      node.toRoll = stableRoll
    }

    if (nodeCreated) {
      initializeNodeAtTarget(node, target)
      continue
    }

    const positionChanged =
      Math.abs(node.toX - target.x) > POSITION_EPSILON ||
      Math.abs(node.toY - target.y) > POSITION_EPSILON ||
      Math.abs(node.toBaseZ - target.baseZ) > POSITION_EPSILON

    if (positionChanged) {
      node.fromX = node.mesh.position.x
      node.fromY = node.mesh.position.y
      node.fromBaseZ = node.mesh.position.z
      node.fromRoll = node.mesh.rotation.z
      node.rollStep += 1
      node.rotRoll = cardRollForItemStep(item, node.rollStep)
      setNodeTarget(node, target)
      node.toRoll = node.rotRoll
      node.animStartMs = nowMs
      node.animDurationMs = MOVE_ANIM_MS
      node.moving = true
    } else {
      setNodeTarget(node, target)
      node.toRoll = node.rotRoll
      if (!node.moving && node.landStartMs === null) {
        setNodeIdlePose(node, target, node.toRoll)
      }
    }
  }

  for (const [id, node] of nodes) {
    if (!seen.has(id) && node.despawnStartMs === null) {
      node.despawnStartMs = nowMs
      node.spawnStartMs = null
      node.moving = false
      node.landStartMs = null
    }
  }
}
