import { createClayObjectPalette } from './clay-config.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import {
  BOARD3D_RULE_VISUAL_CONFIG,
  BOARD3D_TEXT_CARD_STYLE_CONFIG,
} from './board-3d-config-visuals.js'
import { fnv1a, hashSeed01 } from './board-3d-shared-math.js'
import {
  mirroredSprite,
  orientedSprite,
  SPRITE_FRAME_COUNT,
} from './pixel-sprites/derive.js'
import { spriteForName } from './pixel-sprites/index.js'
import { OBJECT_GLYPHS } from '../view/render-config.js'
import { isGroundHugItem } from '../view/stack-policy.js'
import { SYNTAX_WORDS } from '../view/syntax-words.js'

import type { Direction, Item } from '../logic/types.js'
import type { CardSpec } from './board-3d-shared-types.js'

const {
  MOVE_ROLL_AMPLITUDE,
  IDLE_STRETCH_CYCLE_MS,
} = BOARD3D_ANIMATION_CONFIG

const {
  BELT_DIRECTION_GLYPH_UP,
  BELT_DIRECTION_GLYPH_RIGHT,
  BELT_DIRECTION_GLYPH_DOWN,
  BELT_DIRECTION_GLYPH_LEFT,
  FACING_ARROW_PROPS,
} = BOARD3D_RULE_VISUAL_CONFIG

const {
  TEXT_CARD_SYNTAX_BACKGROUND,
  TEXT_CARD_SYNTAX_BACKGROUND_TOP,
  TEXT_CARD_SYNTAX_TEXT,
  TEXT_CARD_SYNTAX_OUTLINE,
  TEXT_CARD_SYNTAX_KEYLINE,
  TEXT_CARD_SYNTAX_DIAMOND,
  TEXT_CARD_NORMAL_BACKGROUND,
  TEXT_CARD_NORMAL_BACKGROUND_TOP,
  TEXT_CARD_NORMAL_TEXT,
  TEXT_CARD_NORMAL_OUTLINE,
  TEXT_CARD_NORMAL_KEYLINE,
  TEXT_CARD_OVERRIDDEN_BACKGROUND,
  TEXT_CARD_OVERRIDDEN_BACKGROUND_TOP,
  TEXT_CARD_OVERRIDDEN_TEXT,
  TEXT_CARD_OVERRIDDEN_OUTLINE,
  TEXT_CARD_OVERRIDDEN_STRIKE,
  TEXT_CARD_OVERRIDDEN_KEYLINE,
} = BOARD3D_TEXT_CARD_STYLE_CONFIG

export const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: BELT_DIRECTION_GLYPH_UP,
  right: BELT_DIRECTION_GLYPH_RIGHT,
  down: BELT_DIRECTION_GLYPH_DOWN,
  left: BELT_DIRECTION_GLYPH_LEFT,
}

const rollForMoveStep = (itemId: number, step: number): number => {
  const seed = fnv1a(`${itemId}:${step}`)
  return ((seed & 0xfff) / 0xfff - 0.5) * MOVE_ROLL_AMPLITUDE
}

export const cardFacesCamera = (item: Item): boolean =>
  !isGroundHugItem(item)

export const cardRollForItemStep = (item: Item, step: number): number =>
  item.isText || isGroundHugItem(item) ? 0 : rollForMoveStep(item.id, step)

const directionFromProps = (item: Item): Direction | null => {
  if (item.props.includes('up')) return 'up'
  if (item.props.includes('right')) return 'right'
  if (item.props.includes('down')) return 'down'
  if (item.props.includes('left')) return 'left'
  return null
}

const facingDirectionForItem = (item: Item): Direction | null => {
  if (item.isText) return null
  // Belts always show their travel direction; other objects only while a
  // facing prop (you/move/shift) is active.
  if (item.name === 'belt') return item.dir ?? 'right'
  if (!item.props.some((prop) => FACING_ARROW_PROPS.has(prop))) return null
  if (item.dir) return item.dir
  const propDirection = directionFromProps(item)
  if (propDirection) return propDirection
  if (item.props.includes('you')) return 'right'
  if (item.props.includes('move')) return 'right'
  if (item.props.includes('shift')) return 'right'
  return null
}

const labelForItem = (item: Item): string => {
  if (item.isText) return item.name.toUpperCase()
  if (item.name === 'belt') return BELT_DIRECTION_GLYPHS[item.dir ?? 'right']
  return OBJECT_GLYPHS[item.name] ?? item.name.slice(0, 2).toUpperCase()
}

const objectPalette = (
  name: string,
  minContrastRatio: number,
): { background: string; border: string; textColor: string; outlineColor: string } => {
  const hue = fnv1a(name) % 360
  const palette = createClayObjectPalette(hue, minContrastRatio)
  return palette
}

export const cardSpecForItem = (
  item: Item,
  minContrastRatio: number,
  overridden = false,
): CardSpec => {
  const label = labelForItem(item)
  const facingDirection = facingDirectionForItem(item)
  if (item.isText) {
    if (overridden) {
      return {
        key: `text:overridden:${item.name}`,
        label,
        facingDirection: null,
        sprite: null,
        background: TEXT_CARD_OVERRIDDEN_BACKGROUND,
        backgroundTop: TEXT_CARD_OVERRIDDEN_BACKGROUND_TOP,
        keylineColor: TEXT_CARD_OVERRIDDEN_KEYLINE,
        textColor: TEXT_CARD_OVERRIDDEN_TEXT,
        outlineColor: TEXT_CARD_OVERRIDDEN_OUTLINE,
        isText: true,
        strikethrough: true,
        strikeColor: TEXT_CARD_OVERRIDDEN_STRIKE,
      }
    }
    if (SYNTAX_WORDS.has(item.name)) {
      return {
        key: `text:syntax:${item.name}`,
        label,
        facingDirection: null,
        sprite: null,
        background: TEXT_CARD_SYNTAX_BACKGROUND,
        backgroundTop: TEXT_CARD_SYNTAX_BACKGROUND_TOP,
        keylineColor: TEXT_CARD_SYNTAX_KEYLINE,
        diamondColor: TEXT_CARD_SYNTAX_DIAMOND,
        textColor: TEXT_CARD_SYNTAX_TEXT,
        outlineColor: TEXT_CARD_SYNTAX_OUTLINE,
        isText: true,
      }
    }
    return {
      key: `text:normal:${item.name}`,
      label,
      facingDirection: null,
      sprite: null,
      background: TEXT_CARD_NORMAL_BACKGROUND,
      backgroundTop: TEXT_CARD_NORMAL_BACKGROUND_TOP,
      keylineColor: TEXT_CARD_NORMAL_KEYLINE,
      textColor: TEXT_CARD_NORMAL_TEXT,
      outlineColor: TEXT_CARD_NORMAL_OUTLINE,
      isText: true,
    }
  }

  const palette = objectPalette(item.name, minContrastRatio)
  return {
    key: `object:${item.name}:${item.dir ?? 'none'}:${facingDirection ?? 'none'}`,
    label,
    facingDirection,
    sprite: spriteForName(item.name),
    rotatesWithDirection: item.name === 'belt',
    background: palette.background,
    textColor: palette.textColor,
    outlineColor: palette.outlineColor,
    isText: false,
  }
}

// Directional sprites (belt) rotate wholesale; other sprites only mirror for
// left-facing. Single orientation source for both texture and voxel paths.
export const orientedSpriteForSpec = (spec: CardSpec) => {
  const sprite = spec.sprite
  if (!sprite) return null
  if (spec.rotatesWithDirection && spec.facingDirection) {
    return orientedSprite(sprite, spec.facingDirection)
  }
  if (spec.facingDirection === 'left') return mirroredSprite(sprite)
  return sprite
}

// Text plates carry the idle stretch: sprite cards wobble through frame
// geometry instead, so every upright card on the board keeps an idle motion,
// matching the original game's all-tiles wiggle.
export const idleStretchEnabledForItem = (item: Item): boolean => item.isText

// FLOAT-prop cards levitate: the layout lifts them and this flag keeps them
// bobbing on the idle clock. Text floats too — TEXT IS FLOAT is a real rule.
export const idleFloatEnabledForItem = (item: Item): boolean =>
  item.props.includes('float')

// One stable idle phase per item feeds every idle-motion domain: as a ms
// offset for the stretch cycle, and quantized to frame steps for the sprite
// wobble so voxel cards cycle out of sync instead of on one global index.
const idlePhase01ForItem = (item: Item): number =>
  hashSeed01(fnv1a(`idle:${item.id}:${item.name}`))

export const idlePhaseOffsetMsForItem = (item: Item): number =>
  idlePhase01ForItem(item) * IDLE_STRETCH_CYCLE_MS

export const idleFrameOffsetForItem = (item: Item): number =>
  Math.floor(idlePhase01ForItem(item) * SPRITE_FRAME_COUNT)
