import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import {
  applyCardOrientation,
  applyVolumeOrientation,
} from './board-3d-card-facing.js'
import {
  clamp01,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  idleFloatBob,
  idleMicroStretch,
  idleStretchBottomAnchorOffset,
  lerp,
} from './board-3d-shared-math.js'

import type { Camera } from 'three'
import type { EntityNode, PoseStepResult } from './board-3d-node-types.js'

const {
  SHADOW_BASE_Z,
  SHADOW_SCALE_BASE,
  SHADOW_SCALE_JUMP_MUL,
  SHADOW_SCALE_LANDING_MUL,
  SHADOW_OPACITY_MIN,
  SHADOW_OPACITY_BASE,
  SHADOW_OPACITY_JUMP_MUL,
  SHADOW_OPACITY_LANDING_MUL,
} = BOARD3D_SHADOW_CONFIG

const {
  SPAWN_ANIM_MS,
  DESPAWN_ANIM_MS,
  SPAWN_SCALE_FROM,
  SPAWN_ROLL_IN,
  DESPAWN_SCALE_TO,
  DESPAWN_SPIN,
  LAND_PULSE_MS,
  JUMP_HEIGHT,
  MOVE_STRETCH_FACTOR,
  MOVE_SQUASH_FACTOR,
  LANDING_PULSE_HEIGHT,
  SPAWN_VERTICAL_OFFSET,
  DESPAWN_VERTICAL_OFFSET,
} = BOARD3D_ANIMATION_CONFIG

const {
  PULSE_MS,
  PULSE_HOP_HEIGHT,
  PULSE_HOP_STRETCH,
  PULSE_SLUMP_Y,
  PULSE_SLUMP_X,
} = BOARD3D_EFFECTS_CONFIG

export const nodeRollAtMs = (node: EntityNode, nowMs: number): number => {
  const animDuration = Math.max(1, node.animDurationMs)
  const eased = easeOutCubic(
    clamp01((nowMs - node.animStartMs) / animDuration),
  )
  return lerp(node.fromRoll, node.toRoll, eased)
}

export const applyNodePose = (
  node: EntityNode,
  nowMs: number,
  camera: Camera,
): PoseStepResult => {
  const animDuration = Math.max(1, node.animDurationMs)
  const rawProgress = clamp01((nowMs - node.animStartMs) / animDuration)
  const eased = easeOutCubic(rawProgress)

  const x = lerp(node.fromX, node.toX, eased)
  const y = lerp(node.fromY, node.toY, eased)
  const baseZ = lerp(node.fromBaseZ, node.toBaseZ, eased)
  let roll = nodeRollAtMs(node, nowMs)

  const dx = node.toX - node.fromX
  const dy = node.toY - node.fromY
  const dominantX = Math.abs(dx) >= Math.abs(dy)

  let jump = 0
  let moveStretch = 1
  let moveSquash = 1
  let stretchX = 1
  let stretchY = 1
  if (node.moving && node.despawnStartMs === null) {
    const wave = Math.sin(Math.PI * rawProgress)
    jump = wave * JUMP_HEIGHT
    moveStretch = 1 + wave * MOVE_STRETCH_FACTOR
    moveSquash = 1 - wave * MOVE_SQUASH_FACTOR
    stretchX = dominantX ? moveStretch : moveSquash
    stretchY = dominantX ? moveSquash : moveStretch
    if (rawProgress >= 1) {
      node.moving = false
      node.landStartMs = nowMs
    }
  }

  let landing = 0
  if (node.landStartMs !== null && node.despawnStartMs === null) {
    const landT = clamp01((nowMs - node.landStartMs) / LAND_PULSE_MS)
    landing = Math.sin((1 - landT) * Math.PI) * LANDING_PULSE_HEIGHT
    if (landT >= 1) node.landStartMs = null
  }

  // Celebration pulse (win hop / lose slump): a staggered whole-board wave.
  // Negative t means the ripple hasn't reached this node yet — it stays
  // animating so the RAF loop lives until the wave passes.
  let pulseStretchX = 1
  let pulseStretchY = 1
  if (node.pulseStartMs !== null && node.despawnStartMs === null) {
    const pulseT = (nowMs - node.pulseStartMs) / PULSE_MS
    if (pulseT >= 1) {
      node.pulseStartMs = null
      node.pulseKind = null
    } else if (pulseT > 0) {
      const wave = Math.sin(Math.PI * pulseT)
      if (node.pulseKind === 'hop') {
        jump += wave * PULSE_HOP_HEIGHT
        pulseStretchY = 1 + wave * PULSE_HOP_STRETCH
        pulseStretchX = 1 - wave * PULSE_HOP_STRETCH * 0.5
      } else {
        pulseStretchY = 1 - wave * PULSE_SLUMP_Y
        pulseStretchX = 1 + wave * PULSE_SLUMP_X
      }
    }
  }

  let scaleFactor = 1
  let verticalOffset = 0
  if (node.spawnStartMs !== null) {
    const spawnT = clamp01((nowMs - node.spawnStartMs) / SPAWN_ANIM_MS)
    // easeOutBack runs 0 → ~1.1 → 1: the card pops past its size on entry.
    // A delayed spawn (board-entry stagger) sits at scale 0 until its turn.
    scaleFactor *= lerp(SPAWN_SCALE_FROM, 1, easeOutBack(spawnT))
    roll += (1 - easeOutCubic(spawnT)) * SPAWN_ROLL_IN
    verticalOffset += (1 - spawnT) * SPAWN_VERTICAL_OFFSET
    if (spawnT >= 1) node.spawnStartMs = null
  }

  let finishedLeaving = false
  let shadowOpacityMul = 1
  if (node.despawnStartMs !== null) {
    const despawnT = clamp01((nowMs - node.despawnStartMs) / DESPAWN_ANIM_MS)
    const fade = 1 - easeOutCubic(despawnT)
    // Ease-in shrink + spin-out: the card whirls away instead of fading.
    scaleFactor *= lerp(1, DESPAWN_SCALE_TO, easeInCubic(despawnT))
    roll += despawnT * DESPAWN_SPIN * (node.rollStep % 2 === 0 ? 1 : -1)
    shadowOpacityMul = Math.max(0, fade)
    verticalOffset += despawnT * DESPAWN_VERTICAL_OFFSET
    if (despawnT >= 1) finishedLeaving = true
  }

  const baseScaleX = stretchX * pulseStretchX * scaleFactor
  const baseScaleY = stretchY * pulseStretchY * scaleFactor
  let scaleX = baseScaleX
  let scaleY = baseScaleY
  if (node.idleStretch) {
    const microStretch = idleMicroStretch(nowMs + node.idlePhaseOffsetMs)
    scaleX *= microStretch.scaleX
    scaleY *= microStretch.scaleY
    verticalOffset += idleStretchBottomAnchorOffset(baseScaleY, scaleY)
  }

  let floatBob = 0
  if (node.idleFloat) {
    floatBob = idleFloatBob(nowMs + node.idlePhaseOffsetMs)
    verticalOffset += floatBob
  }

  node.mesh.position.set(x, y, baseZ + jump + landing + verticalOffset)
  let scaleZ = 1
  if (node.facingYaw === undefined) {
    applyCardOrientation(node.mesh, roll, camera, node.facesCamera)
  } else {
    applyVolumeOrientation(node.mesh, roll, node.facingYaw)
    // The mesh is yawed upright: the move stretch has to land on the
    // model-local axis matching the dominant move direction (local X or Z),
    // not always on X like a camera-facing card.
    const lateralOnX = dominantX === (Math.abs(Math.cos(node.facingYaw)) >= 0.5)
    scaleX = scaleFactor * pulseStretchX * (lateralOnX ? moveStretch : moveSquash)
    scaleZ = scaleFactor * pulseStretchX * (lateralOnX ? moveSquash : moveStretch)
  }
  node.mesh.scale.set(scaleX, scaleY, scaleZ)

  const shadowScale =
    SHADOW_SCALE_BASE +
    (jump + floatBob) * SHADOW_SCALE_JUMP_MUL +
    landing * SHADOW_SCALE_LANDING_MUL
  const shadowOpacity = Math.max(
    SHADOW_OPACITY_MIN,
    SHADOW_OPACITY_BASE -
      (jump + floatBob) * SHADOW_OPACITY_JUMP_MUL +
      landing * SHADOW_OPACITY_LANDING_MUL,
  )
  node.shadow.position.set(x, y, SHADOW_BASE_Z)
  node.shadow.scale.set(shadowScale * scaleFactor, shadowScale * scaleFactor, 1)
  node.shadowMaterial.opacity = shadowOpacity * shadowOpacityMul

  return {
    animating:
      node.moving ||
      node.landStartMs !== null ||
      node.spawnStartMs !== null ||
      node.despawnStartMs !== null ||
      node.pulseStartMs !== null,
    finishedLeaving,
  }
}
