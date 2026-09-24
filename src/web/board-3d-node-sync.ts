import {
  BOARD3D_LAYOUT_CONFIG,
} from './board-3d-config-layout.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
import {
  applyCardOrientation,
  applyVolumeOrientation,
  cardFacingForParent,
} from './board-3d-card-facing.js'
import { nodeRollAtMs, nodeYawAtMs } from './board-3d-node-pose.js'
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
import { collectTextRuleMarks } from '../logic/rules-override.js'
import { isYouLike } from '../logic/step/shared.js'
import { isGroundHugItem } from '../view/stack-policy.js'
import { autotileMaskForItem, buildAutotileCells } from './board-3d-autotile.js'

import type { Camera, Group, Object3D } from 'three'
import type { CardFacing } from './board-3d-card-facing.js'
import type { GameState, Item } from '../logic/types.js'
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
  TURN_ANIM_MS,
} = BOARD3D_ANIMATION_CONFIG

const {
  SPAWN_STAGGER_MS_PER_CELL,
  RULE_PULSE_STAGGER_MS,
  RULE_PULSE_STAGGER_MAX_INDEX,
} = BOARD3D_EFFECTS_CONFIG

const setNodeIdlePose = (
  node: EntityNode,
  target: EntityBaseTarget,
  roll: number,
  camera: Camera,
  nowMs: number,
  facing: CardFacing,
): void => {
  node.mesh.position.set(target.x, target.y, target.baseZ)
  const yaw = nodeYawAtMs(node, nowMs)
  if (yaw === undefined) {
    applyCardOrientation(node.mesh, roll, camera, node.facesCamera, facing)
  } else {
    applyVolumeOrientation(node.mesh, roll, yaw)
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
  nowMs: number,
  facing: CardFacing,
): void => {
  setNodeTarget(node, target)
  node.fromX = node.toX
  node.fromY = node.toY
  node.fromBaseZ = node.toBaseZ
  node.fromRoll = node.rotRoll
  node.toRoll = node.rotRoll
  setNodeIdlePose(node, target, node.rotRoll, camera, nowMs, facing)
}

export const removeEntityNode = (
  nodes: Map<number, EntityNode>,
  entityGroup: Group,
  id: number,
): void => {
  const node = nodes.get(id)
  if (!node) return
  // Mesh/shadow are off-scene carriers — freeing means releasing their
  // instanced slots (zeroed) and unhooking the rim anchor.
  node.cardSlot?.release()
  node.cardSlot = null
  node.shadowSlot?.release()
  node.shadowSlot = null
  if (node.outlineAnchor?.parent) entityGroup.remove(node.outlineAnchor)
  node.shadowMaterial.dispose()
  nodes.delete(id)
}

// Items are immutable between steps — the sorted prop signature is a pure
// function of the item object, so repeat syncs reuse it by identity.
const propSigCache = new WeakMap<Item, string>()

const propSignature = (item: Item): string => {
  const cached = propSigCache.get(item)
  if (cached !== undefined) return cached
  const sig = [...item.props].sort().join('|')
  propSigCache.set(item, sig)
  return sig
}

export const syncEntityNodes = (state: GameState, deps: SyncEntityNodesDeps): void => {
  const { nodes, createNode, getVisual, camera } = deps
  const nowMs = performance.now()
  const seen = new Set<number>()
  const views = buildEntityViews(state)
  const autotileCells = buildAutotileCells(state)
  // `step` already partitions rules and carries both text marks on the
  // state; fixture-built states without them fall back to one reparse.
  const textMarks =
    state.overriddenTextIds && state.activeTextIds
      ? { active: state.activeTextIds, overridden: state.overriddenTextIds }
      : collectTextRuleMarks(state.items, state.width, state.height)
  const overriddenTextIds = textMarks.overridden
  const activeTextIds = textMarks.active
  // Board entry (nothing synced yet) staggers each spawn on a diagonal
  // sweep; mid-game appearances pop immediately.
  const boardEntry = nodes.size === 0
  // Every card shares the camera-facing basis: one per parent per sync.
  const cardFacings = new Map<Object3D | null, CardFacing>()
  const cardFacingFor = (node: EntityNode): CardFacing => {
    const parent = node.mesh.parent
    let facing = cardFacings.get(parent)
    if (!facing) {
      facing = cardFacingForParent(camera, parent)
      cardFacings.set(parent, facing)
    }
    return facing
  }
  // Rule transitions stagger in view order: a freshly formed rule sweeps
  // card to card instead of blinking all at once.
  let rulePulseIndex = 0

  for (const view of views) {
    const item = view.item
    seen.add(item.id)
    const tileMask = autotileMaskForItem(
      item,
      autotileCells,
      state.width,
      state.height,
    )

    const target = computeEntityBaseTarget(state, view)
    const itemOverridden = item.isText && overriddenTextIds.has(item.id)
    const ruleActive = item.isText && activeTextIds.has(item.id)

    let node = nodes.get(item.id)
    const nodeCreated = !node
    if (!node) {
      node = createNode(
        item,
        nowMs,
        boardEntry ? (item.x + item.y) * SPAWN_STAGGER_MS_PER_CELL : 0,
        tileMask,
        itemOverridden,
        ruleActive,
      )
      nodes.set(item.id, node)
    } else if (node.despawnStartMs !== null) {
      node.despawnStartMs = null
      node.spawnStartMs = nowMs
      node.spawnFxDone = false
      node.despawnFxDone = true
    }
    // Sorted so a reordered-but-identical prop list never diffs — only a
    // real nature change (a wall gaining or losing `stop`) counts.
    const propSig = propSignature(item)
    const visual = getVisual(item, itemOverridden, tileMask, ruleActive)
    // Burst colours ride the cached visual — same spec, same palette.
    node.fxColors = visual.fxColors
    const visualChanged = node.specKey !== visual.key
    if (visualChanged) {
      node.specKey = visual.key
      node.mesh.material = visual.material
      node.mesh.geometry = visual.geometry
      node.frameGeometries = visual.frameGeometries
      // The merged instanced geometry keeps every frame; the rim needs the
      // real geometry of the node's current frame — clamp in case the new
      // spec runs shorter.
      node.frameIndex =
        visual.frameGeometries.length > 0
          ? node.frameIndex % visual.frameGeometries.length
          : 0
      node.outline.geometry =
        visual.frameGeometries[node.frameIndex] ?? visual.geometry
      node.outline.material = visual.outlineMaterial
      node.outlineTint = visual.outlineTint
      node.plate = visual.plate ?? null
    }
    const groundHug = isGroundHugItem(item)
    node.outline.visible = isYouLike(item)
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
    const facingYawChanged = node.facingYaw !== facingYaw
    if (facingYawChanged) {
      // Turning eases through the shortest arc instead of snapping: the
      // tween starts at the currently displayed yaw so chained turns and
      // mid-move redirects stay continuous.
      const displayedYaw = nodeYawAtMs(node, nowMs)
      if (facingYaw !== undefined && displayedYaw !== undefined) {
        node.fromYaw = displayedYaw
        node.yawStartMs = nowMs
        node.yawDurationMs = TURN_ANIM_MS
      } else {
        // Card↔volume swaps share no angle to tween between — align to the
        // target directly (fromYaw === facingYaw makes the tween a no-op).
        node.fromYaw = facingYaw ?? 0
      }
    }
    const facingChanged =
      node.facesCamera !== facesCamera || facingYawChanged
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
      // First sight of the card records its rule state silently — board
      // entry already carries a spawn sweep; a rule-pulse storm on top
      // would read as noise, not as "these words are live".
      node.ruleActive = ruleActive
      node.ruleOverridden = itemOverridden
      node.propSig = propSig
      initializeNodeAtTarget(node, target, camera, nowMs, cardFacingFor(node))
      continue
    }

    // Rule-state crossings announce themselves on the card: joining an
    // active rule pops it ('rule-on', golden sparkle), leaving one or
    // being struck overridden sags it ('rule-off', grey motes), and a
    // card freed from the strike pops back up. Object entities ride the
    // same channel through their prop set — every wall ripples when
    // `wall is stop` forms or breaks. Despawning cards skip the
    // farewell — the poof covers it.
    if (node.despawnStartMs === null) {
      let pulseKind: 'rule-on' | 'rule-off' | null = null
      if (node.ruleActive !== ruleActive) {
        pulseKind = ruleActive ? 'rule-on' : 'rule-off'
      } else if (node.ruleOverridden !== itemOverridden) {
        pulseKind = itemOverridden ? 'rule-off' : 'rule-on'
      } else if (node.propSig !== propSig) {
        // Prop-set crossing: gaining a nature pops the entity, losing
        // one sags it; a swap counts as a gain — the new nature is the
        // news.
        const before = new Set(
          node.propSig === '' ? [] : node.propSig.split('|'),
        )
        const after = new Set(propSig === '' ? [] : propSig.split('|'))
        const gained = [...after].filter((prop) => !before.has(prop)).length
        const lost = [...before].filter((prop) => !after.has(prop)).length
        pulseKind = gained >= lost ? 'rule-on' : 'rule-off'
      }
      if (pulseKind !== null) {
        node.pulseStartMs =
          nowMs +
          Math.min(rulePulseIndex, RULE_PULSE_STAGGER_MAX_INDEX) *
            RULE_PULSE_STAGGER_MS
        node.pulseKind = pulseKind
        node.ruleFxDone = false
        rulePulseIndex += 1
      }
    }
    node.ruleActive = ruleActive
    node.ruleOverridden = itemOverridden
    node.propSig = propSig

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
        setNodeIdlePose(
          node,
          target,
          node.toRoll,
          camera,
          nowMs,
          cardFacingFor(node),
        )
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
