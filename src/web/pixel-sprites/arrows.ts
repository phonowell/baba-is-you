import { dilateFrame, frameSize, mirrorXFrame, rotate90Frame } from './derive.js'

import type { Direction } from '../../logic/types.js'
import type { PixelFrame } from './types.js'
import type { VolumeSlice } from './voxel.js'

// Block arrow pointing right, drawn as the base frame; other directions are
// derived by rotation/mirror instead of being drawn by hand.
const ARROW_RIGHT: PixelFrame = [
  '....a......',
  '....aaa....',
  'aaaaaaaaa..',
  'aaaaaaaaaaa',
  'aaaaaaaaa..',
  '....aaa....',
  '....a......',
]

export const DIRECTION_ARROW_FRAMES: Record<Direction, PixelFrame> = {
  right: ARROW_RIGHT,
  down: rotate90Frame(ARROW_RIGHT),
  left: mirrorXFrame(ARROW_RIGHT),
  up: rotate90Frame(mirrorXFrame(ARROW_RIGHT)),
}

// Fill pass reads as the arrow face; the shadow pass paints every painted
// cell in one dark color, offset by a couple of destination pixels, so the
// indicator stays readable on light sprites like baba.
export const ARROW_FILL_PALETTE: Record<string, string> = { a: '#f4f8ff' }
export const ARROW_SHADOW_PALETTE: Record<string, string> = { a: '#1a2030' }

// Grid-space placement relative to the sprite's content bounds: the arrow
// sits flush against the facing edge, centered on the perpendicular axis —
// the voxel counterpart of the texture overlay's edge inset.
//
// Returns two volume slices stacked toward the camera: a dilated dark pad
// one voxel proud of the front surface, then the white arrow on top of it,
// so the relief stays readable on light sprites like baba (same role as
// the texture overlay's shadow pass).
export const arrowOverlaysForDirection = (
  direction: Direction,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): VolumeSlice[] => {
  const frame = DIRECTION_ARROW_FRAMES[direction]
  const { width, height } = frameSize(frame)
  const midX = Math.round((bounds.minX + bounds.maxX) / 2 - (width - 1) / 2)
  const midY = Math.round((bounds.minY + bounds.maxY) / 2 - (height - 1) / 2)
  const dx = direction === 'left' ? bounds.minX : direction === 'right' ? bounds.maxX + 1 - width : midX
  const dy = direction === 'up' ? bounds.minY : direction === 'down' ? bounds.maxY + 1 - height : midY
  return [
    {
      frame: dilateFrame(frame),
      palette: ARROW_SHADOW_PALETTE,
      dx: dx - 1,
      dy: dy - 1,
    },
    { frame, palette: ARROW_FILL_PALETTE, dx, dy },
  ]
}

