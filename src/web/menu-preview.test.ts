import assert from 'node:assert/strict'
import test from 'node:test'

import { BOARD3D_TEXT_CARD_STYLE_CONFIG } from './board-3d-config-visuals.js'
import { drawLevelPreview } from './menu-preview.js'
import { spriteForName } from './pixel-sprites/index.js'

import type { GameState } from '../logic/types.js'

type Fill = { x: number; y: number; w: number; h: number; color: string }

// Node has no canvas — a recording stub stands in for the 2d context so
// the paint order and color choices stay assertable.
const createStubCtx = () => {
  const fills: Fill[] = []
  const texts: string[] = []
  const ctx = {
    fillStyle: '#000000',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, color: this.fillStyle })
    },
    fillText(text: string) {
      texts.push(text)
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, texts }
}

const createState = (items: GameState['items'], width = 4, height = 2): GameState => ({
  levelIndex: 0,
  title: 'preview-test',
  width,
  height,
  items,
  rules: [],
  status: 'playing',
  turn: 0,
})

test('drawLevelPreview letterboxes the board and fills its background', () => {
  const { ctx, fills } = createStubCtx()
  drawLevelPreview(ctx, createState([], 4, 2), 400, 100)

  const bg = fills[0]
  assert.ok(bg)
  // 4x2 cells in a 400x100 box: cell=50, board=200x100, centered in x.
  assert.deepEqual(
    { x: bg.x, y: bg.y, w: bg.w, h: bg.h },
    { x: 100, y: 0, w: 200, h: 100 },
  )
})

test('drawLevelPreview paints sprite pixels and keeps upright items on top', () => {
  const water = spriteForName('water')
  const baba = spriteForName('baba')
  assert.ok(water && baba)

  const state = createState([
    { id: 1, name: 'water', x: 0, y: 0, isText: false, props: [] },
    { id: 2, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
  ])
  const { ctx, fills } = createStubCtx()
  drawLevelPreview(ctx, state, 400, 200)

  const waterColors = new Set(Object.values(water.palette))
  const babaColors = new Set(Object.values(baba.palette))
  const cellFills = fills.filter(
    (fill) => fill.x < 100 && fill.y < 100,
  )
  const firstWater = cellFills.findIndex((fill) => waterColors.has(fill.color))
  const lastBaba = cellFills.findLastIndex((fill) => babaColors.has(fill.color))
  assert.ok(firstWater >= 0, 'expected water sprite pixels in the cell')
  assert.ok(lastBaba > firstWater, 'expected baba painted above water')
})

test('drawLevelPreview renders text items as labeled cards', () => {
  const state = createState([
    { id: 1, name: 'win', x: 2, y: 1, isText: true, props: [] },
  ])
  const { ctx, fills, texts } = createStubCtx()
  drawLevelPreview(ctx, state, 400, 200)

  const card = fills.find(
    (fill) =>
      fill.color === BOARD3D_TEXT_CARD_STYLE_CONFIG.TEXT_CARD_NORMAL_BACKGROUND,
  )
  assert.ok(card, 'expected the word card plate fill')
  // Card sits inset inside cell (2,1) — a 100px cell offset by the inset.
  assert.ok(card.x > 200 && card.x < 210)
  assert.ok(card.y > 100 && card.y < 110)
  assert.deepEqual(texts, ['WIN'])
})

test('drawLevelPreview skips items with the hide prop', () => {
  const state = createState([
    { id: 1, name: 'skull', x: 0, y: 0, isText: false, props: ['hide'] },
  ])
  const { ctx, fills } = createStubCtx()
  drawLevelPreview(ctx, state, 400, 200)

  const skull = spriteForName('skull')
  assert.ok(skull)
  const skullColors = new Set(Object.values(skull.palette))
  assert.equal(
    fills.filter((fill) => skullColors.has(fill.color)).length,
    0,
    'hidden item should not paint sprite pixels',
  )
})
