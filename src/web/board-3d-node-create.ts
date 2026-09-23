import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from 'three'

import {
  BOARD3D_LAYOUT_CONFIG,
} from './board-3d-config-layout.js'
import { BOARD3D_RULE_VISUAL_CONFIG } from './board-3d-config-visuals.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import {
  cardFacesCamera,
  cardRollForItemStep,
  idleFloatEnabledForItem,
  idleFrameOffsetForItem,
  idlePhaseOffsetMsForItem,
  idleStretchEnabledForItem,
} from './board-3d-shared-item.js'

import { isYouLike } from '../logic/step/shared.js'

import type { Item } from '../logic/types.js'
import type { CreateEntityNodeDeps, EntityNode } from './board-3d-node-types.js'

const {
  CARD_BASE_Z,
} = BOARD3D_LAYOUT_CONFIG

const {
  SHADOW_BASE_Z,
  ENTITY_SHADOW_COLOR,
  ENTITY_SHADOW_OPACITY,
  ENTITY_SHADOW_ALPHA_TEST,
} = BOARD3D_SHADOW_CONFIG

const {
  MOVE_ANIM_MS,
} = BOARD3D_ANIMATION_CONFIG

const {
  YOU_OUTLINE_SCALE,
} = BOARD3D_RULE_VISUAL_CONFIG

export const createEntityNode = (
  deps: CreateEntityNodeDeps,
  item: Item,
  nowMs: number,
  spawnDelayMs = 0,
  tileMask = 0,
  overridden = false,
  active = false,
): EntityNode => {
  const { entityGroup, shadowGeometry, shadowTexture, getVisual } = deps
  const rollNoise = cardRollForItemStep(item, 0)
  const visual = getVisual(item, overridden, tileMask, active)
  const mesh = new Mesh(visual.geometry, visual.material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  // Not added to the scene: the instanced batches draw the card — this
  // mesh is the node's transform/geometry carrier. `parent` still points
  // at the entity group because the card-facing basis reads it.
  mesh.parent = entityGroup

  // Child of the card mesh: inherits every pose/scale/orientation write the
  // pose pass makes, so the rim tracks moves, wobble swaps and spawn/despawn
  // tweens for free. The idle tick pulses its scale/tint; hidden until sync
  // marks the item as a control layer.
  const outline = new Mesh(visual.geometry, visual.outlineMaterial)
  outline.scale.setScalar(YOU_OUTLINE_SCALE)
  outline.visible = isYouLike(item)
  mesh.add(outline)

  const shadowMaterial = new MeshBasicMaterial({
    map: shadowTexture,
    color: new Color(ENTITY_SHADOW_COLOR),
    transparent: true,
    opacity: ENTITY_SHADOW_OPACITY,
    depthWrite: false,
    alphaTest: ENTITY_SHADOW_ALPHA_TEST,
    side: DoubleSide,
  })
  const shadow = new Mesh(shadowGeometry, shadowMaterial)
  shadow.position.z = SHADOW_BASE_Z
  shadow.receiveShadow = false
  shadow.castShadow = false
  // Same off-scene carrier as `mesh` — the shadow batch draws the slot.

  return {
    mesh,
    cardSlot: null,
    shadowSlot: null,
    outlineAnchor: null,
    outline,
    outlineTint: visual.outlineTint,
    shadow,
    shadowMaterial,
    specKey: visual.key,
    frameGeometries: visual.frameGeometries,
    idleStretch: idleStretchEnabledForItem(item),
    idleFloat: idleFloatEnabledForItem(item),
    idlePhaseOffsetMs: idlePhaseOffsetMsForItem(item),
    idleFrameOffset: idleFrameOffsetForItem(item),
    facesCamera: cardFacesCamera(item),
    facingYaw: visual.facingYaw,
    fromYaw: visual.facingYaw ?? 0,
    yawStartMs: 0,
    yawDurationMs: MOVE_ANIM_MS,
    rotRoll: rollNoise,
    rollStep: 0,
    fxColors: [],
    spawnFxDone: false,
    despawnFxDone: true,
    pulseStartMs: null,
    pulseKind: null,
    ruleActive: false,
    ruleOverridden: false,
    propSig: '',
    ruleFxDone: true,
    fromX: 0,
    fromY: 0,
    fromBaseZ: CARD_BASE_Z,
    fromRoll: rollNoise,
    toX: 0,
    toY: 0,
    toBaseZ: CARD_BASE_Z,
    toRoll: rollNoise,
    animStartMs: nowMs,
    animDurationMs: MOVE_ANIM_MS,
    moving: false,
    spawnStartMs: nowMs + spawnDelayMs,
    despawnStartMs: null,
    landStartMs: null,
  }
}
