import {
  BOARD3D_LAYOUT_CONFIG,
} from './board-3d-config-layout.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
import {
  applyCardOrientation,
  applyVolumeOrientation,
} from './board-3d-card-facing.js'
import { nodeRollAtMs } from './board-3d-node-pose.js'
import {
  cardFacesCamera,
  cardRollForItemStep,
  idleFloatEnabledForItem,
  idleFrameOffsetForItem,
  idlePhaseOffsetMsForItem,
  idleStretchEnabledForItem,
} from './board-3d-shared-item.js'
import {
  buildEntityViews,
  computeEntityBaseTarget,
} from './board-3d-shared-layout.js'
import { collectOverriddenTextIds } from '../logic/rules-override.js'
import { isGroundHugItem } from '../view/stack-policy.js'

import type { Camera, Group } from 'three'
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

const {
  SPAWN_STAGGER_MS_PER_CELL,
} = BOARD3D_EFFECTS_CONFIG

const setNodeIdlePose = (
  node: EntityNode,
  target: EntityBaseTarget,
  roll: number,
  camera: Camera,
): void => {
  node.mesh.position.set(target.x, target.y, target.baseZ)
  if (node.facingYaw === undefined) {
    applyCardOrientation(node.mesh, roll, camera, node.facesCamera)
  } else {
    applyVolumeOrientation(node.mesh, roll, node.facingYaw)
  }
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

const initializeNodeAtTarget = (
  node: EntityNode,
  target: EntityBaseTarget,
  camera: Camera,
): void => {
  setNodeTarget(node, target)
  node.fromX = node.toX
  node.fromY = node.toY
  node.fromBaseZ = node.toBaseZ
  node.fromRoll = node.rotRoll
  node.toRoll = node.rotRoll
  setNodeIdlePose(node, target, node.rotRoll, camera)
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
  const { nodes, createNode, getVisual, camera } = deps
  const nowMs = performance.now()
  const seen = new Set<number>()
  const views = buildEntityViews(state)
  const overriddenTextIds = collectOverriddenTextIds(
    state.items,
    state.width,
    state.height,
  )
  // Board entry (nothing synced yet) staggers each spawn on a diagonal
  // sweep; mid-game appearances pop immediately.
  const boardEntry = nodes.size === 0

  for (const view of views) {
    const item = view.item
    seen.add(item.id)

    let node = nodes.get(item.id)
    const nodeCreated = !node
    if (!node) {
      node = createNode(
        item,
        nowMs,
        boardEntry ? (item.x + item.y) * SPAWN_STAGGER_MS_PER_CELL : 0,
      )
      nodes.set(item.id, node)
    } else if (node.despawnStartMs !== null) {
      node.despawnStartMs = null
      node.spawnStartMs = nowMs
      node.spawnFxDone = false
      node.despawnFxDone = true
    }

    const target = computeEntityBaseTarget(state, view)
    const itemOverridden = item.isText && overriddenTextIds.has(item.id)
    const visual = getVisual(item, itemOverridden)
    if (deps.fxColorsForItem) {
      node.fxColors = deps.fxColorsForItem(item, itemOverridden)
    }
    const visualChanged = node.specKey !== visual.key
    if (visualChanged) {
      node.specKey = visual.key
      node.mesh.material = visual.material
      node.mesh.geometry = visual.geometry
      node.frameGeometries = visual.frameGeometries
    }
    const groundHug = isGroundHugItem(item)
    node.idleStretch = idleStretchEnabledForItem(item)
    node.idleFloat = idleFloatEnabledForItem(item)
    node.idlePhaseOffsetMs = idlePhaseOffsetMsForItem(item)
    node.idleFrameOffset = idleFrameOffsetForItem(item)
    // Ground-hug tiles lie on the shadow receiver: their cast shadow lands
    // under themselves, and the blob shadow quad darkens the tile's own
    // surface — both invisible work, so both are skipped.
    node.mesh.castShadow = !groundHug
    node.mesh.receiveShadow = true
    node.shadow.visible = !groundHug
    const facesCamera = cardFacesCamera(item)
    const facingYaw = visual.facingYaw
    const facingChanged =
      node.facesCamera !== facesCamera || node.facingYaw !== facingYaw
    node.facesCamera = facesCamera
    node.facingYaw = facingYaw
    const stableRoll = cardRollForItemStep(item, node.rollStep)
    const rollChanged =
      !node.moving && Math.abs(node.rotRoll - stableRoll) > POSITION_EPSILON
    if (rollChanged) {
      node.rotRoll = stableRoll
      node.fromRoll = stableRoll
      node.toRoll = stableRoll
    }

    if (nodeCreated) {
      initializeNodeAtTarget(node, target, camera)
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
      node.fromRoll = nodeRollAtMs(node, nowMs)
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
      // Idle re-pose only when something the pose reads has changed —
      // position/roll/visual/facing/camera — or the node carries an idle
      // motion (its frozen stretch scale / bob height needs the reset).
      // Unchanged inputs would produce byte-identical writes, so skipping
      // is lossless.
      const poseStale =
        deps.cameraChanged === true ||
        visualChanged ||
        facingChanged ||
        rollChanged ||
        node.idleStretch ||
        node.idleFloat
      if (
        !node.moving &&
        node.landStartMs === null &&
        node.spawnStartMs === null &&
        node.pulseStartMs === null &&
        poseStale
      ) {
        setNodeIdlePose(node, target, node.toRoll, camera)
      }
    }
  }

  for (const [id, node] of nodes) {
    if (!seen.has(id) && node.despawnStartMs === null) {
      node.despawnStartMs = nowMs
      node.despawnFxDone = false
      node.spawnStartMs = null
      node.moving = false
      node.landStartMs = null
      node.pulseStartMs = null
      node.pulseKind = null
    }
  }
}
