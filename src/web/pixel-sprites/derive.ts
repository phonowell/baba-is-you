import type { Direction } from '../../logic/types.js'
import type { PixelFrame, PixelSprite } from './types.js'

export const SPRITE_GRID_SIZE = 24
export const SPRITE_FRAME_COUNT = 3

const cellAt = (frame: PixelFrame, x: number, y: number): string =>
  frame[y]?.[x] ?? '.'

const buildFrame = (
  width: number,
  height: number,
  cell: (x: number, y: number) => string,
): PixelFrame =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => cell(x, y)).join(''),
  )

export const frameSize = (
  frame: PixelFrame,
): { width: number; height: number } => ({
  width: Math.max(0, ...frame.map((row) => row.length)),
  height: frame.length,
})

const contentBounds = (
  frame: PixelFrame,
): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  const { width, height } = frameSize(frame)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (cellAt(frame, x, y) === '.') continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

// Idle wobble: shift the occupied cells vertically inside the same grid.
// Phase 0 returns the frame unchanged; ±1 reads as a gentle bob when cycled.
export const wobbleFrame = (frame: PixelFrame, phase: number): PixelFrame => {
  if (phase === 0) return frame
  const bounds = contentBounds(frame)
  if (!bounds) return frame
  const { width, height } = frameSize(frame)
  const maxUp = bounds.minY
  const maxDown = height - 1 - bounds.maxY
  const dy = phase < 0 ? -Math.min(-phase, maxUp) : Math.min(phase, maxDown)
  if (dy === 0) return frame
  return buildFrame(width, height, (x, y) => cellAt(frame, x, y - dy))
}

export const mirrorXFrame = (frame: PixelFrame): PixelFrame => {
  const { width, height } = frameSize(frame)
  return buildFrame(width, height, (x, y) => cellAt(frame, width - 1 - x, y))
}

export const rotate90Frame = (frame: PixelFrame): PixelFrame => {
  const { width, height } = frameSize(frame)
  return buildFrame(height, width, (x, y) => cellAt(frame, y, height - 1 - x))
}

// Grows the painted area by one cell on every side (8-neighbor dilation).
// Output is padded +1 per side, so callers realign it with dx-1/dy-1 —
// used to back the voxel arrow relief with a dark outline layer.
export const dilateFrame = (frame: PixelFrame): PixelFrame => {
  const { width, height } = frameSize(frame)
  return buildFrame(width + 2, height + 2, (x, y) =>
    [-1, 0, 1].some((dy) =>
      [-1, 0, 1].some((dx) => cellAt(frame, x - 1 + dx, y - 1 + dy) !== '.'),
    )
      ? 'a'
      : '.',
  )
}

// Every sprite animates on the shared 3-frame clock. Hand-drawn frames are
// used as-is; short sets are padded by wobbling the base frame.
export const ensureFrames = (
  frames: readonly PixelFrame[],
): PixelFrame[] => {
  const base = frames[0]
  if (!base) throw new Error('pixel sprite requires at least one frame')
  const result = frames.slice(0, SPRITE_FRAME_COUNT)
  const wobblePhases = [0, 1, -1]
  while (result.length < SPRITE_FRAME_COUNT) {
    const phase = wobblePhases[result.length] ?? 0
    result.push(phase === 0 ? base : wobbleFrame(base, phase))
  }
  return result
}

export const spriteFrames = (sprite: PixelSprite): PixelFrame[] =>
  ensureFrames(sprite.frames)

export const spriteContentBounds = (
  sprite: PixelSprite,
): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const frame of spriteFrames(sprite)) {
    const bounds = contentBounds(frame)
    if (!bounds) continue
    minX = Math.min(minX, bounds.minX)
    minY = Math.min(minY, bounds.minY)
    maxX = Math.max(maxX, bounds.maxX)
    maxY = Math.max(maxY, bounds.maxY)
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY }
}

export const mirroredSprite = (sprite: PixelSprite): PixelSprite => ({
  palette: sprite.palette,
  frames: sprite.frames.map(mirrorXFrame),
})

const rotatedSprite = (sprite: PixelSprite): PixelSprite => ({
  palette: sprite.palette,
  frames: sprite.frames.map(rotate90Frame),
})

// Directional sprites (belt) bake their base frame pointing right; the whole
// sprite — including hand-drawn flow frames — rotates with the item's dir.
export const orientedSprite = (
  sprite: PixelSprite,
  direction: Direction,
): PixelSprite => {
  switch (direction) {
    case 'left':
      return mirroredSprite(sprite)
    case 'down':
      return rotatedSprite(sprite)
    case 'up':
      return rotatedSprite(mirroredSprite(sprite))
    default:
      return sprite
  }
}
