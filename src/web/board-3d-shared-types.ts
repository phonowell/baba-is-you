import type { Direction, Item } from '../logic/types.js'
import type { PixelSprite } from './pixel-sprites/types.js'

export type CardSpec = {
  key: string
  label: string
  facingDirection: Direction | null
  rotatesWithDirection?: boolean
  sprite: PixelSprite | null
  background: string
  // Menu-pill chrome on painted card faces: an optional brighter top stop
  // turns the flat fill into the menu row's parchment gradient, and the
  // keyline/diamond paint the gold filigree the menu wears inside its
  // edges. Sprite-textured cards never read these — their face is pixels.
  backgroundTop?: string
  keylineColor?: string
  diamondColor?: string
  textColor: string
  outlineColor: string
  isText: boolean
  strikethrough?: boolean
  strikeColor?: string
}

export type EntityView = {
  item: Item
  stackIndex: number
  stackCount: number
  displayStackIndex: number
  displayStackCount: number
  layerPriority: number
}

// Additive offsets on top of the readability baseline for post-processing:
// effects push a mood (win flash, lose desaturation) without owning the
// per-state bloom floor the view controller computes.
export type BoardFxMood = {
  bloomBoost: number
  saturationAdd: number
  vignetteAdd: number
}

export const BOARD_FX_MOOD_NEUTRAL: BoardFxMood = {
  bloomBoost: 0,
  saturationAdd: 0,
  vignetteAdd: 0,
}
