import { frameSize } from './derive.js'

import type { PixelFrame } from './types.js'

// Pure per-pixel iteration — the DOM-touching draw call stays thin so the
// geometry/colors are testable in node.
export const forEachPixel = (
  frame: PixelFrame,
  palette: Record<string, string>,
  visit: (x: number, y: number, color: string) => void,
): void => {
  const { width, height } = frameSize(frame)
  for (let y = 0; y < height; y += 1) {
    const row = frame[y] ?? ''
    for (let x = 0; x < width; x += 1) {
      const key = row[x] ?? '.'
      if (key === '.') continue
      const color = palette[key]
      if (!color) continue
      visit(x, y, color)
    }
  }
}

export const drawPixelFrame = (
  ctx: CanvasRenderingContext2D,
  frame: PixelFrame,
  palette: Record<string, string>,
  dstX: number,
  dstY: number,
  dstSize: number,
): void => {
  const { width, height } = frameSize(frame)
  if (width === 0 || height === 0) return
  const px = dstSize / width
  const py = dstSize / height
  forEachPixel(frame, palette, (x, y, color) => {
    ctx.fillStyle = color
    ctx.fillRect(
      Math.floor(dstX + x * px),
      Math.floor(dstY + y * py),
      Math.ceil(px),
      Math.ceil(py),
    )
  })
}

export const frameContentDrawRect = (
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  dstX: number,
  dstY: number,
  dstSize: number,
): { x: number; y: number; texel: number } => {
  const width = bounds.maxX - bounds.minX + 1
  const height = bounds.maxY - bounds.minY + 1
  const texel = dstSize / Math.max(width, height)
  return {
    x: dstX + (dstSize - width * texel) / 2 - bounds.minX * texel,
    y: dstY + (dstSize - height * texel) / 2 - bounds.minY * texel,
    texel,
  }
}

// Uniform-texel variant for non-square frames (direction arrows): the caller
// picks the texel size and centers the frame, so the shape never stretches.
export const drawPixelFrameUniform = (
  ctx: CanvasRenderingContext2D,
  frame: PixelFrame,
  palette: Record<string, string>,
  dstX: number,
  dstY: number,
  texelSize: number,
): void => {
  forEachPixel(frame, palette, (x, y, color) => {
    ctx.fillStyle = color
    ctx.fillRect(
      Math.floor(dstX + x * texelSize),
      Math.floor(dstY + y * texelSize),
      Math.ceil(texelSize),
      Math.ceil(texelSize),
    )
  })
}
