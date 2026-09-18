import type { Direction, Item } from '../logic/types.js'
import type { PixelSprite } from './pixel-sprites/types.js'

export type CardSpec = {
  key: string
  label: string
  facingDirection: Direction | null
  rotatesWithDirection?: boolean
  isEmojiLabel: boolean
  sprite: PixelSprite | null
  background: string
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
