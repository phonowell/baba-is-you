import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from 'three'

import {
  BOARD3D_LAYOUT_CONFIG,
} from './board-3d-config-layout.js'
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

export const createEntityNode = (
  deps: CreateEntityNodeDeps,
  item: Item,
  nowMs: number,
  spawnDelayMs = 0,
): EntityNode => {
  const { entityGroup, shadowGeometry, shadowTexture, getVisual } = deps
  const rollNoise = cardRollForItemStep(item, 0)
  const visual = getVisual(item)
  const mesh = new Mesh(visual.geometry, visual.material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  entityGroup.add(mesh)

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
  entityGroup.add(shadow)

  return {
    mesh,
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
    rotRoll: rollNoise,
    rollStep: 0,
    fxColors: [],
    spawnFxDone: false,
    despawnFxDone: true,
    pulseStartMs: null,
    pulseKind: null,
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
