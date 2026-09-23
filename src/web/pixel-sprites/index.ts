import { CREATURE_SPRITES } from './data/creatures.js'
import { MISC_SPRITES } from './data/misc.js'
import { OBJECT_SPRITES } from './data/objects.js'
import { OFFICIAL_OBJECT_SPRITES } from './data/objects-official.js'
import { TERRAIN_SPRITES } from './data/terrain.js'

import type { PixelSprite } from './types.js'

// Authored sets override the generated official silhouettes: promoting a
// sprite means drawing it under the same name in objects/creatures/etc. —
// the importer's skip-list then stops re-extracting it on the next regen.
export const PIXEL_SPRITES: Record<string, PixelSprite> = {
  ...OFFICIAL_OBJECT_SPRITES,
  ...CREATURE_SPRITES,
  ...TERRAIN_SPRITES,
  ...OBJECT_SPRITES,
  ...MISC_SPRITES,
}

export const spriteForName = (name: string): PixelSprite | null =>
  PIXEL_SPRITES[name] ?? null
