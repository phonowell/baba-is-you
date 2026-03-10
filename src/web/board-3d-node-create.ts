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
  cardRollForItemStep,
  cardRotXForItem,
  emojiPhaseOffsetMsForItem,
  emojiStretchEnabledForItem,
  isEmojiItem,
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
): EntityNode => {
  const { entityGroup, cardGeometry, shadowGeometry, shadowTexture, getMaterial } = deps
  const rollNoise = cardRollForItemStep(item, 0)
  const mesh = new Mesh(cardGeometry, getMaterial(item))
  const emoji = isEmojiItem(item)
  const stretchEnabled = emojiStretchEnabledForItem(item)
  mesh.castShadow = true
  mesh.receiveShadow = !emoji
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
    isEmoji: stretchEnabled,
    emojiPhaseOffsetMs: emojiPhaseOffsetMsForItem(item),
    rotX: cardRotXForItem(item),
    rotRoll: rollNoise,
    rollStep: 0,
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
    spawnStartMs: nowMs,
    despawnStartMs: null,
    landStartMs: null,
  }
}
