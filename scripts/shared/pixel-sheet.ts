// Shared raster helpers for the sprite review sheets (sprite-preview,
// sprite-zoom): a clipped RGBA rect fill over a pixel buffer, and a
// whole-frame blit stretched to a caller-chosen cell size.
import { frameSize } from '../../src/web/pixel-sprites/derive.js'
import { forEachPixel } from '../../src/web/pixel-sprites/blit.js'
import { hexToRgba } from './png.js'

import type { PixelFrame } from '../../src/web/pixel-sprites/types.js'

export type PixelSheet = {
  width: number
  height: number
  pixels: Buffer
  fill: (
    x: number,
    y: number,
    w: number,
    h: number,
    c: readonly number[],
  ) => void
}

export const createPixelSheet = (
  width: number,
  height: number,
): PixelSheet => {
  const pixels = Buffer.alloc(width * height * 4)
  const fill = (
    x: number,
    y: number,
    w: number,
    h: number,
    c: readonly number[],
  ): void => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        const i = (yy * width + xx) * 4
        pixels[i] = c[0]!
        pixels[i + 1] = c[1]!
        pixels[i + 2] = c[2]!
        pixels[i + 3] = c[3]!
      }
    }
  }
  return { width, height, pixels, fill }
}

// Paints one sprite frame stretched (non-uniformly) into a `cell`-pixel
// box — the row-cell rendering both sheets use.
export const drawSpriteFrame = (
  sheet: PixelSheet,
  frame: PixelFrame,
  palette: Record<string, string>,
  ox: number,
  oy: number,
  cell: number,
): void => {
  const { width, height } = frameSize(frame)
  const sx = cell / width
  const sy = cell / height
  forEachPixel(frame, palette, (x, y, color) => {
    sheet.fill(
      Math.floor(ox + x * sx),
      Math.floor(oy + y * sy),
      Math.ceil(sx),
      Math.ceil(sy),
      hexToRgba(color),
    )
  })
}
