// Renders a subset of pixel sprites at large scale for close inspection.
// `pnpm tsx scripts/sprite-zoom.ts moon pipe spike`
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

import { ensureFrames, frameSize } from '../src/web/pixel-sprites/derive.js'
import { forEachPixel } from '../src/web/pixel-sprites/blit.js'
import { PIXEL_SPRITES } from '../src/web/pixel-sprites/index.js'

import type { PixelFrame } from '../src/web/pixel-sprites/types.js'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer): Buffer => {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
const encodePng = (width: number, height: number, rgba: Buffer): Buffer => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const SCALE = 20
const GAP = 8
const BG: [number, number, number, number] = [0x18, 0x18, 0x20, 0xff]

const names = process.argv.slice(2)
const cell = 24 * SCALE
const blockW = 3 * cell + 2 * GAP
const sheetW = names.length * (blockW + GAP) + GAP
const sheetH = cell + 2 * GAP

const px = Buffer.alloc(sheetW * sheetH * 4)
const fill = (x: number, y: number, w: number, h: number, c: readonly number[]): void => {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= sheetW || yy >= sheetH) continue
      const i = (yy * sheetW + xx) * 4
      px[i] = c[0]!
      px[i + 1] = c[1]!
      px[i + 2] = c[2]!
      px[i + 3] = c[3]!
    }
  }
}
fill(0, 0, sheetW, sheetH, BG)

const hexToRgba = (hex: string): [number, number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
  255,
]

const drawFrame = (frame: PixelFrame, palette: Record<string, string>, ox: number, oy: number): void => {
  const { width, height } = frameSize(frame)
  const sx = cell / width
  const sy = cell / height
  forEachPixel(frame, palette, (x, y, color) => {
    fill(
      Math.floor(ox + x * sx),
      Math.floor(oy + y * sy),
      Math.ceil(sx),
      Math.ceil(sy),
      hexToRgba(color),
    )
  })
}

names.forEach((name, i) => {
  const sprite = PIXEL_SPRITES[name]
  if (!sprite) {
    console.log(`missing: ${name}`)
    return
  }
  const frames = ensureFrames(sprite.frames)
  const ox = GAP + i * (blockW + GAP)
  frames.forEach((frame, f) => {
    drawFrame(frame, sprite.palette, ox + f * (cell + GAP), GAP)
  })
})

mkdirSync('release', { recursive: true })
writeFileSync('release/sprite-zoom.png', encodePng(sheetW, sheetH, px))
console.log(`release/sprite-zoom.png ${sheetW}x${sheetH} [${names.join(', ')}]`)
