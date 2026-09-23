import { createClayObjectPalette } from './clay-config.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_CARD_TEXTURE_CONFIG } from './board-3d-config-textures.js'
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
import { isGroundHugItem } from '../view/stack-policy.js'
import { SYNTAX_WORDS } from '../view/syntax-words.js'

import type { Direction, Item } from '../logic/types.js'
import type { CardSpec } from './board-3d-shared-types.js'

const {
  MOVE_ROLL_AMPLITUDE,
  IDLE_STRETCH_CYCLE_MS,
} = BOARD3D_ANIMATION_CONFIG

const { CARD_TEXTURE_TEXT_MAX_LINE_CHARS } = BOARD3D_CARD_TEXTURE_CONFIG

const { FACING_ARROW_PROPS } = BOARD3D_RULE_VISUAL_CONFIG

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
  TEXT_CARD_ACTIVE_BACKGROUND,
  TEXT_CARD_ACTIVE_BACKGROUND_TOP,
  TEXT_CARD_ACTIVE_TEXT,
  TEXT_CARD_ACTIVE_OUTLINE,
  TEXT_CARD_ACTIVE_KEYLINE,
  TEXT_CARD_ACTIVE_DIAMOND,
} = BOARD3D_TEXT_CARD_STYLE_CONFIG

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

// Sprite-less objects wear a two-letter tag; every object with a pixel
// sprite never reaches this paint path, so no glyph table is needed.
const labelForItem = (item: Item): string =>
  item.isText ? item.name.toUpperCase() : item.name.slice(0, 2).toUpperCase()

// Wrapped labels break near the middle so both halves stay big. The
// shorter half rides on top — WA/TER lands on the word's natural
// syllable boundary and leaves the wider line as a stable base. A few
// words break the other way because the even split would orphan an
// unpronounceable onset or a stunted first line; they carry explicit
// cut points.
const CARD_LABEL_CUTS: Record<string, number> = {
  EMPTY: 3, // EMP/TY — EM/PTY opens the second line on "PTY"
  FENCE: 3,
  HEDGE: 3,
  JELLY: 3,
  LEVEL: 3,
  FRUIT: 3,
  GHOST: 3,
  FOLIAGE: 4,
}

export const cardLabelLines = (spec: CardSpec): readonly string[] => {
  const { label } = spec
  if (!spec.isText || label.length <= CARD_TEXTURE_TEXT_MAX_LINE_CHARS) {
    return [label]
  }
  const cut = CARD_LABEL_CUTS[label] ?? Math.floor(label.length / 2)
  return [label.slice(0, cut), label.slice(cut)]
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
  active = false,
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
    if (active) {
      return {
        key: `text:active:${item.name}`,
        label,
        facingDirection: null,
        sprite: null,
        background: TEXT_CARD_ACTIVE_BACKGROUND,
        backgroundTop: TEXT_CARD_ACTIVE_BACKGROUND_TOP,
        keylineColor: TEXT_CARD_ACTIVE_KEYLINE,
        textColor: TEXT_CARD_ACTIVE_TEXT,
        outlineColor: TEXT_CARD_ACTIVE_OUTLINE,
        // Grammar words keep their ◆ flourish when lit — the active face
        // still announces syntax vs noun at a glance.
        ...(SYNTAX_WORDS.has(item.name)
          ? { diamondColor: TEXT_CARD_ACTIVE_DIAMOND }
          : {}),
        isText: true,
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

// Particle bursts colour themselves after the card: sprites poof in their
// pixel palette, text/emoji cards in their plate colours.
export const fxColorsForSpec = (spec: CardSpec): readonly string[] => {
  if (spec.sprite) {
    const spriteColors = [...new Set(Object.values(spec.sprite.palette))]
    if (spriteColors.length > 0) return spriteColors.slice(0, 4)
  }
  return [spec.background, spec.textColor, spec.outlineColor]
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

// Ground-hug tiles run on the shared global frame — staggered offsets would
// show different animation frames in neighbouring cells and break the
// seamless pattern across tile seams. Upright cards keep per-item offsets.
export const idleFrameOffsetForItem = (item: Item): number =>
  isGroundHugItem(item)
    ? 0
    : Math.floor(idlePhase01ForItem(item) * SPRITE_FRAME_COUNT)
