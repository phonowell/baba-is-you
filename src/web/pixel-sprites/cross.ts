import type { PixelFrame } from './types.js'

// Vetoed-rule mark: a chunky pixel X painted over overridden rule text.
// Kept as a palette frame (like the direction arrows) so the strike shares
// the sprites' texel look instead of a vector line. No palette is declared
// here — the card's overridden colors are supplied at draw time.
export const OVERRIDDEN_CROSS_FRAME: PixelFrame = [
  'xx.....xx',
  'xxx...xxx',
  '.xxx.xxx.',
  '..xxxxx..',
  '...xxx...',
  '..xxxxx..',
  '.xxx.xxx.',
  'xxx...xxx',
  'xx.....xx',
]
