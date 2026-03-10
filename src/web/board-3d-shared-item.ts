import { createClayObjectPalette } from './clay-config.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import {
  BOARD3D_RULE_VISUAL_CONFIG,
  BOARD3D_TEXT_CARD_STYLE_CONFIG,
} from './board-3d-config-visuals.js'
import { fnv1a, hashSeed01 } from './board-3d-shared-math.js'
import { OBJECT_GLYPHS } from '../view/render-config.js'
import { isGroundHugItem } from '../view/stack-policy.js'
import { SYNTAX_WORDS } from '../view/syntax-words.js'

import type { Direction, Item } from '../logic/types.js'
import type { CardSpec } from './board-3d-shared-types.js'

const {
  CARD_UPRIGHT_ROT_X,
  CARD_BACK_TILT_RAD,
  CARD_FLAT_ROT_X,
} = BOARD3D_LAYOUT_CONFIG

const {
  MOVE_ROLL_AMPLITUDE,
  EMOJI_MICRO_STRETCH_CYCLE_MS,
} = BOARD3D_ANIMATION_CONFIG

const {
  BELT_DIRECTION_GLYPH_UP,
  BELT_DIRECTION_GLYPH_RIGHT,
  BELT_DIRECTION_GLYPH_DOWN,
  BELT_DIRECTION_GLYPH_LEFT,
  FACING_ARROW_PROPS,
  HAS_EMOJI,
} = BOARD3D_RULE_VISUAL_CONFIG

const {
  TEXT_CARD_SYNTAX_BACKGROUND,
  TEXT_CARD_SYNTAX_TEXT,
  TEXT_CARD_SYNTAX_OUTLINE,
  TEXT_CARD_NORMAL_BACKGROUND,
  TEXT_CARD_NORMAL_TEXT,
  TEXT_CARD_NORMAL_OUTLINE,
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

export const cardRotXForItem = (item: Item): number =>
  isGroundHugItem(item) ? CARD_FLAT_ROT_X : CARD_UPRIGHT_ROT_X - CARD_BACK_TILT_RAD

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

export const isEmojiItem = (item: Item): boolean => {
  if (item.isText) return false
  return HAS_EMOJI.test(labelForItem(item))
}

const objectPalette = (
  name: string,
  minContrastRatio: number,
): { background: string; border: string; textColor: string; outlineColor: string } => {
  const hue = fnv1a(name) % 360
  const palette = createClayObjectPalette(hue, minContrastRatio)
  return palette
}

export const cardSpecForItem = (item: Item, minContrastRatio: number): CardSpec => {
  const label = labelForItem(item)
  const facingDirection = facingDirectionForItem(item)
  const isEmojiLabel = HAS_EMOJI.test(label)
  if (item.isText) {
    if (SYNTAX_WORDS.has(item.name)) {
      return {
        key: `text:syntax:${item.name}`,
        label,
        facingDirection: null,
        isEmojiLabel: false,
        background: TEXT_CARD_SYNTAX_BACKGROUND,
        textColor: TEXT_CARD_SYNTAX_TEXT,
        outlineColor: TEXT_CARD_SYNTAX_OUTLINE,
        isText: true,
      }
    }
    return {
      key: `text:normal:${item.name}`,
      label,
      facingDirection: null,
      isEmojiLabel: false,
      background: TEXT_CARD_NORMAL_BACKGROUND,
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
    isEmojiLabel,
    background: palette.background,
    textColor: palette.textColor,
    outlineColor: palette.outlineColor,
    isText: false,
  }
}

export const emojiStretchEnabledForItem = (item: Item): boolean =>
  isEmojiItem(item) && !isGroundHugItem(item)

export const emojiPhaseOffsetMsForItem = (item: Item): number =>
  hashSeed01(fnv1a(`emoji-stretch:${item.id}:${item.name}`)) * EMOJI_MICRO_STRETCH_CYCLE_MS
