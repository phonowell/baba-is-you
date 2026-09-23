// Renders a subset of pixel sprites at large scale for close inspection.
// `pnpm tsx scripts/sprite-zoom.ts moon pipe spike`
import { mkdirSync, writeFileSync } from 'node:fs'

import { ensureFrames } from '../src/web/pixel-sprites/derive.js'
import { PIXEL_SPRITES } from '../src/web/pixel-sprites/index.js'
import { encodePng } from './shared/png.js'
import { createPixelSheet, drawSpriteFrame } from './shared/pixel-sheet.js'

const SCALE = 20
const GAP = 8
const BG: [number, number, number, number] = [0x18, 0x18, 0x20, 0xff]

const names = process.argv.slice(2)
const cell = 24 * SCALE
const blockW = 3 * cell + 2 * GAP
const sheetW = names.length * (blockW + GAP) + GAP
const sheetH = cell + 2 * GAP

const sheet = createPixelSheet(sheetW, sheetH)
sheet.fill(0, 0, sheetW, sheetH, BG)

names.forEach((name, i) => {
  const sprite = PIXEL_SPRITES[name]
  if (!sprite) {
    console.log(`missing: ${name}`)
    return
  }
  const frames = ensureFrames(sprite.frames)
  const ox = GAP + i * (blockW + GAP)
  frames.forEach((frame, f) => {
    drawSpriteFrame(sheet, frame, sprite.palette, ox + f * (cell + GAP), GAP, cell)
  })
})

mkdirSync('release', { recursive: true })
writeFileSync('release/sprite-zoom.png', encodePng(sheetW, sheetH, sheet.pixels))
console.log(`release/sprite-zoom.png ${sheetW}x${sheetH} [${names.join(', ')}]`)
