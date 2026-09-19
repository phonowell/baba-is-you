import { CREATURE_SPRITES } from './data/creatures.js'
import { MISC_SPRITES } from './data/misc.js'
import { OBJECT_SPRITES } from './data/objects.js'
import { OFFICIAL_OBJECT_SPRITES } from './data/objects-official.js'
import { TERRAIN_SPRITES } from './data/terrain.js'

import type { PixelSprite } from './types.js'

export const PIXEL_SPRITES: Record<string, PixelSprite> = {
  ...CREATURE_SPRITES,
  ...TERRAIN_SPRITES,
  ...OBJECT_SPRITES,
  ...OFFICIAL_OBJECT_SPRITES,
  ...MISC_SPRITES,
}

export const spriteForName = (name: string): PixelSprite | null =>
  PIXEL_SPRITES[name] ?? null
