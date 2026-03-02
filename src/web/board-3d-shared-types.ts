import type { Direction, Item } from '../logic/types.js'

export type CardSpec = {
  key: string
  label: string
  facingDirection: Direction | null
  isEmojiLabel: boolean
  background: string
  textColor: string
  outlineColor: string
  isText: boolean
}

export type EntityView = {
  item: Item
  stackIndex: number
  stackCount: number
  displayStackIndex: number
  displayStackCount: number
  layerPriority: number
}
