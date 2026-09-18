import assert from 'node:assert/strict'
import test from 'node:test'

import { OBJECT_GLYPHS } from '../../view/render-config.js'
import {
  ensureFrames,
  frameSize,
  mirrorXFrame,
  orientedSprite,
  rotate90Frame,
  spriteContentBounds,
  wobbleFrame,
  SPRITE_FRAME_COUNT,
  SPRITE_GRID_SIZE,
} from './derive.js'
import { forEachPixel, frameContentDrawRect } from './blit.js'
import { DIRECTION_ARROW_FRAMES } from './arrows.js'
import { PIXEL_SPRITES, spriteForName } from './index.js'

import type { PixelFrame } from './types.js'

const isAsciiMarker = (name: string): boolean =>
  name.startsWith('marker-') || name.startsWith('glyph-')

test('pixel sprites cover every renderable object glyph', () => {
  const missing = Object.keys(OBJECT_GLYPHS).filter(
    (name) => !isAsciiMarker(name) && !spriteForName(name),
  )
  assert.deepEqual(missing, [])
})

test('pixel sprite frames stay inside the grid and use declared palette keys', () => {
  for (const [name, sprite] of Object.entries(PIXEL_SPRITES)) {
    assert.ok(sprite.frames.length > 0, `${name}: no frames`)
    for (const [key, color] of Object.entries(sprite.palette)) {
      assert.equal(key.length, 1, `${name}: palette key ${key} not a char`)
      assert.match(color, /^#[0-9a-f]{6}$/i, `${name}: bad color ${color}`)
    }
    sprite.frames.forEach((frame, fi) => {
      const { width, height } = frameSize(frame)
      assert.ok(
        height <= SPRITE_GRID_SIZE && width <= SPRITE_GRID_SIZE,
        `${name} frame ${fi}: ${width}x${height} exceeds grid`,
      )
      frame.forEach((row, ri) => {
        for (const ch of row) {
          assert.ok(
            ch === '.' || ch in sprite.palette,
            `${name} frame ${fi} row ${ri}: undeclared char ${JSON.stringify(ch)}`,
          )
        }
      })
    })
  }
})

test('pixel sprite volumes align with frames and use declared palette keys', () => {
  for (const [name, sprite] of Object.entries(PIXEL_SPRITES)) {
    const volumes = sprite.volumes ?? []
    assert.ok(
      volumes.length <= sprite.frames.length,
      `${name}: ${volumes.length} volumes for ${sprite.frames.length} frames`,
    )
    volumes.forEach((volume, vi) => {
      if (!volume) return
      const sliceSets = [
        ['front', volume.frontSlices],
        ['frame', volume.frame ? [volume.frame] : undefined],
        ['back', volume.backSlices],
      ] as const
      for (const [kind, slices] of sliceSets) {
        slices?.forEach((slice, si) => {
          const { width, height } = frameSize(slice)
          assert.ok(
            height <= SPRITE_GRID_SIZE && width <= SPRITE_GRID_SIZE,
            `${name} volume ${vi} ${kind} slice ${si}: ${width}x${height} exceeds grid`,
          )
          slice.forEach((row, ri) => {
            for (const ch of row) {
              assert.ok(
                ch === '.' || ch in sprite.palette,
                `${name} volume ${vi} ${kind} slice ${si} row ${ri}: undeclared char ${JSON.stringify(ch)}`,
              )
            }
          })
        })
      }
    })
  }
})

const TEST_FRAME: PixelFrame = [
  '....',
  '.aa.',
  '.aa.',
  '....',
]

test('ensureFrames pads single-frame sprites to the shared frame count', () => {
  const frames = ensureFrames([TEST_FRAME])
  assert.equal(frames.length, SPRITE_FRAME_COUNT)
  assert.deepEqual(frames[0], TEST_FRAME)
})

test('ensureFrames keeps hand-drawn frames as-is', () => {
  const other: PixelFrame = ['....', '.bb.', '.bb.', '....']
  const frames = ensureFrames([TEST_FRAME, other, TEST_FRAME])
  assert.deepEqual(frames, [TEST_FRAME, other, TEST_FRAME])
})

test('wobbleFrame shifts content without leaving the grid', () => {
  const down = wobbleFrame(TEST_FRAME, 1)
  assert.deepEqual(down, ['....', '....', '.aa.', '.aa.'])
  const up = wobbleFrame(TEST_FRAME, -1)
  assert.deepEqual(up, ['.aa.', '.aa.', '....', '....'])
  const clipped = wobbleFrame(up, -1)
  assert.deepEqual(clipped, up)
})

test('spriteContentBounds unions painted bounds across wobble frames', () => {
  const sprite = { palette: { a: '#fff' }, frames: [TEST_FRAME] }
  assert.deepEqual(spriteContentBounds(sprite), {
    minX: 1,
    minY: 0,
    maxX: 2,
    maxY: 3,
  })
})

test('spriteContentBounds returns null for empty sprites', () => {
  const sprite = { palette: { a: '#fff' }, frames: [['....', '....']] }
  assert.equal(spriteContentBounds(sprite), null)
})

test('frameContentDrawRect fits bounds into the box at uniform texel scale', () => {
  const square = frameContentDrawRect(
    { minX: 0, minY: 0, maxX: 7, maxY: 7 },
    10,
    10,
    84,
  )
  assert.deepEqual(square, { x: 10, y: 10, texel: 10.5 })

  const wide = frameContentDrawRect(
    { minX: 2, minY: 1, maxX: 9, maxY: 4 },
    10,
    10,
    84,
  )
  assert.deepEqual(wide, { x: -11, y: 20.5, texel: 10.5 })
})

test('mirrorXFrame mirrors horizontally', () => {
  const frame: PixelFrame = ['a..', '...', '...']
  assert.deepEqual(mirrorXFrame(frame), ['..a', '...', '...'])
})

test('rotate90Frame rotates clockwise', () => {
  const frame: PixelFrame = ['ab', '..']
  assert.deepEqual(rotate90Frame(frame), ['.a', '.b'])
})

test('rotate90Frame keeps non-square frames inside bounds', () => {
  const frame: PixelFrame = ['a..', '...', '...', '...', '...', '...', '...', '...', '...', '...', '...']
  const rotated = rotate90Frame(frame)
  const { width, height } = frameSize(rotated)
  assert.equal(width, 11)
  assert.equal(height, 3)
  assert.equal(rotated[0]?.[10], 'a')
})

test('direction arrow tips point along each direction', () => {
  const painted = (frame: PixelFrame, x: number, y: number): boolean =>
    frame[y]?.[x] === 'a'
  const right = DIRECTION_ARROW_FRAMES.right
  assert.ok(painted(right, 10, 3), 'right tip missing')
  assert.ok(!painted(right, 0, 0), 'right frame paints outside the shaft/head')
  const down = DIRECTION_ARROW_FRAMES.down
  assert.ok(painted(down, 3, 10), 'down tip missing')
  const left = DIRECTION_ARROW_FRAMES.left
  assert.ok(painted(left, 0, 3), 'left tip missing')
  const up = DIRECTION_ARROW_FRAMES.up
  assert.ok(painted(up, 3, 0), 'up tip missing')
})

test('orientedSprite rotates directional sprites while keeping the palette', () => {
  const sprite = {
    palette: { a: '#ffffff' },
    frames: [DIRECTION_ARROW_FRAMES.right],
  }
  assert.deepEqual(orientedSprite(sprite, 'right').frames[0], DIRECTION_ARROW_FRAMES.right)
  assert.deepEqual(orientedSprite(sprite, 'left').frames[0], DIRECTION_ARROW_FRAMES.left)
  assert.deepEqual(orientedSprite(sprite, 'down').frames[0], DIRECTION_ARROW_FRAMES.down)
  assert.deepEqual(orientedSprite(sprite, 'up').frames[0], DIRECTION_ARROW_FRAMES.up)
  assert.equal(orientedSprite(sprite, 'down').palette, sprite.palette)
})

test('forEachPixel visits only painted cells', () => {
  const seen: Array<[number, number, string]> = []
  forEachPixel(TEST_FRAME, { a: '#fff' }, (x, y, c) => seen.push([x, y, c]))
  assert.deepEqual(seen, [
    [1, 1, '#fff'],
    [2, 1, '#fff'],
    [1, 2, '#fff'],
    [2, 2, '#fff'],
  ])
})
