// Renders every registered pixel sprite (all frames) into a single labeled
// contact sheet PNG for visual review: `pnpm tsx scripts/sprite-preview.ts`.
// Output: release/sprite-preview.png — each block shows the sprite's 3 frames
// with its registry name drawn underneath in a tiny embedded bitmap font.
// By default frames render normalized to their painted bounds, matching the
// in-game card texture (board-3d-textures.ts). `--raw` draws the untrimmed
// grid instead, to audit authored canvas usage.
import { mkdirSync, writeFileSync } from 'node:fs'

import {
  ensureFrames,
  frameSize,
  spriteContentBounds,
} from '../src/web/pixel-sprites/derive.js'
import { forEachPixel, frameContentDrawRect } from '../src/web/pixel-sprites/blit.js'
import {
  ARROW_FILL_PALETTE,
  ARROW_SHADOW_PALETTE,
  DIRECTION_ARROW_FRAMES,
} from '../src/web/pixel-sprites/arrows.js'
import { PIXEL_SPRITES } from '../src/web/pixel-sprites/index.js'
import { encodePng, hexToRgba } from './shared/png.js'
import { createPixelSheet, drawSpriteFrame } from './shared/pixel-sheet.js'

import type { PixelFrame } from '../src/web/pixel-sprites/types.js'

// --- 3x5 label font ('.' = off, '#' = on) ---
const FONT: Record<string, readonly string[]> = {
  ' ': ['...', '...', '...', '...', '...'],
  a: ['.#.', '#.#', '###', '#.#', '#.#'],
  b: ['##.', '#.#', '##.', '#.#', '##.'],
  c: ['.##', '#..', '#..', '#..', '.##'],
  d: ['##.', '#.#', '#.#', '#.#', '##.'],
  e: ['###', '#..', '##.', '#..', '###'],
  f: ['###', '#..', '##.', '#..', '#..'],
  g: ['.##', '#..', '#.#', '#.#', '###'],
  h: ['#.#', '#.#', '###', '#.#', '#.#'],
  i: ['###', '.#.', '.#.', '.#.', '###'],
  j: ['..#', '..#', '..#', '#.#', '.#.'],
  k: ['#.#', '#.#', '##.', '#.#', '#.#'],
  l: ['#..', '#..', '#..', '#..', '###'],
  m: ['#.#', '###', '###', '#.#', '#.#'],
  n: ['##.', '#.#', '#.#', '#.#', '#.#'],
  o: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  p: ['##.', '#.#', '##.', '#..', '#..'],
  q: ['.#.', '#.#', '#.#', '.##', '..#'],
  r: ['##.', '#.#', '#..', '#..', '#..'],
  s: ['.##', '#..', '.#.', '..#', '##.'],
  t: ['###', '.#.', '.#.', '.#.', '.#.'],
  u: ['#.#', '#.#', '#.#', '#.#', '###'],
  v: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  w: ['#.#', '#.#', '###', '###', '#.#'],
  x: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '-': ['...', '...', '###', '...', '...'],
  '_': ['...', '...', '...', '...', '###'],
  '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '?': ['###', '..#', '.#.', '...', '.#.'],
}
const GLYPH_W = 3
const GLYPH_H = 5
const GLYPH_ADVANCE = GLYPH_W + 1

// --- contact sheet ---
const SCALE = 4
const LABEL_SCALE = 3
const LABEL_GAP = 5
const LABEL_H = GLYPH_H * LABEL_SCALE
const GAP = 6
const COLS = 5
const BG: [number, number, number, number] = [0x18, 0x18, 0x20, 0xff]
const FRAME_SEP: [number, number, number, number] = [0x33, 0x33, 0x3e, 0xff]
const LABEL_COLOR: [number, number, number, number] = [0xd8, 0xd8, 0xe2, 0xff]

const names = Object.keys(PIXEL_SPRITES).sort()
const cell = 24 * SCALE
const blockW = 3 * cell + 2 * GAP
const blockH = cell + LABEL_GAP + LABEL_H
const sheetW = COLS * (blockW + GAP) + GAP
const rows = Math.ceil(names.length / COLS)
const arrowRow = 1
const sheetH = (rows + arrowRow) * (blockH + GAP) + GAP

const sheet = createPixelSheet(sheetW, sheetH)
const { fill } = sheet
fill(0, 0, sheetW, sheetH, BG)

const textWidth = (text: string, scale = LABEL_SCALE): number =>
  text.length * GLYPH_ADVANCE * scale - scale

const drawText = (text: string, ox: number, oy: number, scale = LABEL_SCALE): void => {
  for (let i = 0; i < text.length; i += 1) {
    const glyph = FONT[text[i]!] ?? FONT['?']!
    for (let y = 0; y < GLYPH_H; y += 1) {
      for (let x = 0; x < GLYPH_W; x += 1) {
        if (glyph[y]![x] !== '#') continue
        fill(
          ox + (i * GLYPH_ADVANCE + x) * scale,
          oy + y * scale,
          scale,
          scale,
          LABEL_COLOR,
        )
      }
    }
  }
}

// Centered under a block of `width` px at frame row origin (ox, oy).
const drawLabel = (
  text: string,
  ox: number,
  oy: number,
  width: number,
  scale = LABEL_SCALE,
): void => {
  drawText(text, Math.floor(ox + (width - textWidth(text, scale)) / 2), oy + cell + LABEL_GAP, scale)
}

// In-game look: fit the sprite's painted bounds into the padded cell with a
// uniform texel, like frameContentDrawRect in createSpriteFrameTexture.
const FRAME_PAD = 4
const drawFrameFitted = (
  frame: PixelFrame,
  sprite: (typeof PIXEL_SPRITES)[string],
  ox: number,
  oy: number,
): void => {
  const bounds = spriteContentBounds(sprite)
  if (!bounds) {
    drawSpriteFrame(sheet, frame, sprite.palette, ox, oy, cell)
    return
  }
  const rect = frameContentDrawRect(bounds, ox + FRAME_PAD, oy + FRAME_PAD, cell - FRAME_PAD * 2)
  forEachPixel(frame, sprite.palette, (x, y, color) => {
    fill(
      Math.floor(rect.x + x * rect.texel),
      Math.floor(rect.y + y * rect.texel),
      Math.ceil(rect.texel),
      Math.ceil(rect.texel),
      hexToRgba(color),
    )
  })
}

const RAW = process.argv.includes('--raw')

names.forEach((name, i) => {
  const sprite = PIXEL_SPRITES[name]!
  const frames = ensureFrames(sprite.frames)
  const col = i % COLS
  const row = Math.floor(i / COLS)
  const ox = GAP + col * (blockW + GAP)
  const oy = GAP + row * (blockH + GAP)
  frames.forEach((frame, f) => {
    const fx = ox + f * (cell + GAP)
    if (f > 0) fill(fx - GAP, oy, GAP, cell, FRAME_SEP)
    if (RAW) drawSpriteFrame(sheet, frame, sprite.palette, fx, oy, cell)
    else drawFrameFitted(frame, sprite, fx, oy)
  })
  drawLabel(name, ox, oy, blockW)
})

// Direction arrows: uniform texel + shadow pass, matching the texture overlay.
const arrowTexel = cell / 11
const arrowY = GAP + rows * (blockH + GAP)
const ARROW_DIRS = ['right', 'down', 'left', 'up'] as const
ARROW_DIRS.forEach((dir, i) => {
  const frame = DIRECTION_ARROW_FRAMES[dir]
  const { width, height } = frameSize(frame)
  const ox = GAP + i * (cell + GAP) + (cell - width * arrowTexel) / 2
  const oy = arrowY + (cell - height * arrowTexel) / 2
  drawLabel(`arrow ${dir}`, GAP + i * (cell + GAP), arrowY, cell, LABEL_SCALE - 1)
  const shadow = Math.max(1, Math.round(arrowTexel / 3))
  forEachPixel(frame, ARROW_SHADOW_PALETTE, (x, y, color) => {
    fill(
      Math.floor(ox + x * arrowTexel) + shadow,
      Math.floor(oy + y * arrowTexel) + shadow,
      Math.ceil(arrowTexel),
      Math.ceil(arrowTexel),
      hexToRgba(color),
    )
  })
  forEachPixel(frame, ARROW_FILL_PALETTE, (x, y, color) => {
    fill(
      Math.floor(ox + x * arrowTexel),
      Math.floor(oy + y * arrowTexel),
      Math.ceil(arrowTexel),
      Math.ceil(arrowTexel),
      hexToRgba(color),
    )
  })
})

mkdirSync('release', { recursive: true })
writeFileSync('release/sprite-preview.png', encodePng(sheetW, sheetH, sheet.pixels))
console.log(`release/sprite-preview.png ${sheetW}x${sheetH} (${names.length} sprites + ${ARROW_DIRS.length} arrows)`)
