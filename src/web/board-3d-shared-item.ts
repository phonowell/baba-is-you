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
import { OBJECT_GLYPHS } from '../view/render-config.js'
import { isGroundHugItem } from '../view/stack-policy.js'
import { SYNTAX_WORDS } from '../view/syntax-words.js'

import type { Direction, Item, LevelIcon } from '../logic/types.js'
import type { CardSpec } from './board-3d-shared-types.js'

const {
  MOVE_ROLL_AMPLITUDE,
  IDLE_STRETCH_CYCLE_MS,
} = BOARD3D_ANIMATION_CONFIG

const { CARD_TEXTURE_TEXT_MAX_LINE_CHARS } = BOARD3D_CARD_TEXTURE_CONFIG

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

// Map icon badges: the icon's own display number/letter is the card face
// (sprite cards cannot overlay text), tinted per .ld style — number dots,
// letter levels, special markers, and a dimmed plate for icons whose
// target was filtered out of the playable set. World icons (style -1)
// and map links carry the map/icon sprites instead.
const ICON_BADGE_STYLES = {
  number: {
    background: '#3d3423',
    backgroundTop: '#5a4b2d',
    textColor: '#ede285',
    outlineColor: '#141008',
    keylineColor: '#8a7434',
  },
  letter: {
    background: '#3a2530',
    backgroundTop: '#5b3549',
    textColor: '#f3c6dd',
    outlineColor: '#150a10',
    keylineColor: '#a05a80',
  },
  special: {
    background: '#20343c',
    backgroundTop: '#2f5666',
    textColor: '#a9d9ea',
    outlineColor: '#0a1418',
    keylineColor: '#4a90aa',
  },
  unresolved: {
    background: '#232329',
    backgroundTop: '#2d2d36',
    textColor: '#565664',
    outlineColor: '#101014',
    keylineColor: '#3c3c48',
  },
} as const

const iconBadgeLabel = (target: LevelIcon): string => {
  if (target.style === 1) return String.fromCharCode(65 + target.number)
  if (target.style === 2) return `✦${target.number}`
  return String(target.number)
}

const iconCardSpec = (target: LevelIcon): CardSpec => {
  // Any kind can carry a named icon sprite (`icon_${icon}`); map links
  // fall back to the generic world marker, the rest to the badge plate.
  const sprite =
    (target.icon ? spriteForName(`icon_${target.icon}`) : null) ??
    (target.kind === 'map' ? spriteForName('map') : null)
  if (sprite) {
    return {
      key: `icon:${target.kind}:${target.file}:${target.icon ?? ''}`,
      label: '',
      facingDirection: null,
      sprite,
      background: '#232329',
      textColor: '#ede285',
      outlineColor: '#101014',
      isText: false,
    }
  }
  const style =
    target.kind === 'unresolved'
      ? ICON_BADGE_STYLES.unresolved
      : target.style === 1
        ? ICON_BADGE_STYLES.letter
        : target.style === 2
          ? ICON_BADGE_STYLES.special
          : ICON_BADGE_STYLES.number
  const label =
    target.style === -1 ? '?' : iconBadgeLabel(target)
  return {
    key: `icon:${target.kind}:${target.file}:${target.number}:${target.style}`,
    label,
    facingDirection: null,
    sprite: null,
    ...style,
    isText: false,
  }
}

export const cardSpecForItem = (
  item: Item,
  minContrastRatio: number,
  overridden = false,
): CardSpec => {
  const label = labelForItem(item)
  const facingDirection = facingDirectionForItem(item)
  if (!item.isText && item.levelTarget) return iconCardSpec(item.levelTarget)
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
