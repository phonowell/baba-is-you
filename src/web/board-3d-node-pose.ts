import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import {
  clamp01,
  easeOutCubic,
  emojiBottomAnchorOffset,
  emojiMicroStretch,
  lerp,
} from './board-3d-shared-math.js'

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
  DESPAWN_SCALE_TO,
  LAND_PULSE_MS,
  JUMP_HEIGHT,
  MOVE_STRETCH_FACTOR,
  MOVE_SQUASH_FACTOR,
  LANDING_PULSE_HEIGHT,
  SPAWN_VERTICAL_OFFSET,
  DESPAWN_VERTICAL_OFFSET,
} = BOARD3D_ANIMATION_CONFIG

export const applyNodePose = (node: EntityNode, nowMs: number): PoseStepResult => {
  const animDuration = Math.max(1, node.animDurationMs)
  const rawProgress = clamp01((nowMs - node.animStartMs) / animDuration)
  const eased = easeOutCubic(rawProgress)

  const x = lerp(node.fromX, node.toX, eased)
  const y = lerp(node.fromY, node.toY, eased)
  const baseZ = lerp(node.fromBaseZ, node.toBaseZ, eased)
  const roll = lerp(node.fromRoll, node.toRoll, eased)

  const dx = node.toX - node.fromX
  const dy = node.toY - node.fromY
  const dominantX = Math.abs(dx) >= Math.abs(dy)

  let jump = 0
  let stretchX = 1
  let stretchY = 1
  if (node.moving && node.despawnStartMs === null) {
    const wave = Math.sin(Math.PI * rawProgress)
    jump = wave * JUMP_HEIGHT
    const stretch = 1 + wave * MOVE_STRETCH_FACTOR
    const squash = 1 - wave * MOVE_SQUASH_FACTOR
    stretchX = dominantX ? stretch : squash
    stretchY = dominantX ? squash : stretch
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

  let scaleFactor = 1
  let verticalOffset = 0
  if (node.spawnStartMs !== null) {
    const spawnT = clamp01((nowMs - node.spawnStartMs) / SPAWN_ANIM_MS)
    scaleFactor *= lerp(SPAWN_SCALE_FROM, 1, easeOutCubic(spawnT))
    verticalOffset += (1 - spawnT) * SPAWN_VERTICAL_OFFSET
    if (spawnT >= 1) node.spawnStartMs = null
  }

  let finishedLeaving = false
  let shadowOpacityMul = 1
  if (node.despawnStartMs !== null) {
    const despawnT = clamp01((nowMs - node.despawnStartMs) / DESPAWN_ANIM_MS)
    const fade = 1 - easeOutCubic(despawnT)
    scaleFactor *= lerp(1, DESPAWN_SCALE_TO, despawnT)
    shadowOpacityMul = Math.max(0, fade)
    verticalOffset += despawnT * DESPAWN_VERTICAL_OFFSET
    if (despawnT >= 1) finishedLeaving = true
  }

  const baseScaleX = stretchX * scaleFactor
  const baseScaleY = stretchY * scaleFactor
  let scaleX = baseScaleX
  let scaleY = baseScaleY
  if (node.isEmoji) {
    const microStretch = emojiMicroStretch(nowMs + node.emojiPhaseOffsetMs)
    scaleX *= microStretch.scaleX
    scaleY *= microStretch.scaleY
    verticalOffset += emojiBottomAnchorOffset(baseScaleY, scaleY)
  }

  node.mesh.position.set(x, y, baseZ + jump + landing + verticalOffset)
  node.mesh.rotation.set(node.rotX, 0, roll)
  node.mesh.scale.set(scaleX, scaleY, 1)

  const shadowScale =
    SHADOW_SCALE_BASE +
    jump * SHADOW_SCALE_JUMP_MUL +
    landing * SHADOW_SCALE_LANDING_MUL
  const shadowOpacity = Math.max(
    SHADOW_OPACITY_MIN,
    SHADOW_OPACITY_BASE -
      jump * SHADOW_OPACITY_JUMP_MUL +
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
      node.despawnStartMs !== null,
    finishedLeaving,
  }
}
