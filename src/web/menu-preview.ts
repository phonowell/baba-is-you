import { createInitialState } from '../logic/state.js'
import {
  sortGroundStack,
  sortUprightStack,
} from '../view/stack-policy.js'
import {
  cardLabelLines,
  cardSpecForItem,
  orientedSpriteForSpec,
} from './board-3d-shared-item.js'
import { CLAY_PRESET } from './clay-config.js'
import { drawPixelFrame } from './pixel-sprites/blit.js'

import type { GameState, Item, LevelData } from '../logic/types.js'

// The menu sits on the same ink-navy backdrop the page body wears; the
// preview well reads as a dimmed board cut into it, one shade deeper.
const PREVIEW_BOARD_BACKGROUND = '#1b2433'

// Below this the label strokes dissolve into mush — the colored plate
// still identifies a word card, so the text simply drops out.
const MIN_LABEL_FONT_PX = 3.5

// A card label's advance width per character, in font-size units —
// Courier-bold approximates the chunky pixel glyphs the in-game word
// cards wear (the UI chrome font is unrelated to card text).
const LABEL_CHAR_WIDTH = 0.62

type PreviewCell = { x: number; y: number; items: Item[] }

const collectCells = (state: GameState): PreviewCell[] => {
  const byCell = new Map<number, PreviewCell>()
  for (const item of state.items) {
    if (item.x < 0 || item.y < 0 || item.x >= state.width || item.y >= state.height)
      continue
    // `hide` starts invisible; the 3D board drops it, the preview does too.
    if (item.props.includes('hide')) continue
    const key = item.y * state.width + item.x
    let cell = byCell.get(key)
    if (!cell) {
      cell = { x: item.x, y: item.y, items: [] }
      byCell.set(key, cell)
    }
    cell.items.push(item)
  }
  return [...byCell.values()]
}

const drawCardLabel = (
  ctx: CanvasRenderingContext2D,
  spec: ReturnType<typeof cardSpecForItem>,
  left: number,
  top: number,
  size: number,
): void => {
  const inner = size - Math.max(1, size * 0.14)
  const lines = cardLabelLines(spec)
  const maxLen = Math.max(...lines.map((line) => line.length), 1)
  const fontSize = Math.min(
    inner * 0.55,
    inner / (maxLen * LABEL_CHAR_WIDTH),
    inner / (lines.length * 1.15),
  )
  if (fontSize < MIN_LABEL_FONT_PX) return

  ctx.fillStyle = spec.textColor
  ctx.font = `700 ${fontSize}px 'Courier New', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = left + size / 2
  const firstBaseline =
    top + size / 2 - ((lines.length - 1) * fontSize * 1.15) / 2
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, firstBaseline + i * fontSize * 1.15)
  })
}

const drawItem = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  item: Item,
  left: number,
  top: number,
  size: number,
): void => {
  const spec = cardSpecForItem(
    item,
    CLAY_PRESET.readability.minContrastRatio,
    state.overriddenTextIds?.has(item.id) ?? false,
    state.activeTextIds?.has(item.id) ?? false,
  )
  const sprite = orientedSpriteForSpec(spec)
  const frame = sprite?.frames[0]
  if (sprite && frame) {
    drawPixelFrame(ctx, frame, sprite.palette, left, top, size)
    return
  }

  // Word cards and sprite-less objects wear the flat plate: inset so the
  // board background still grids the layout, with a keyline-free fill.
  const inset = Math.max(0.5, size * 0.08)
  ctx.fillStyle = spec.background
  ctx.fillRect(left + inset, top + inset, size - inset * 2, size - inset * 2)
  drawCardLabel(ctx, spec, left, top, size)
  if (spec.strikethrough) {
    const strike = Math.max(1, size * 0.06)
    ctx.fillStyle = spec.strikeColor ?? spec.textColor
    ctx.fillRect(left + inset, top + size / 2 - strike / 2, size - inset * 2, strike)
  }
}

// Static one-shot board render for the level-select preview: sprites and
// card plates at their base frame, no animation clock behind it.
export const drawLevelPreview = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
): void => {
  if (state.width <= 0 || state.height <= 0) return
  const cellSize = Math.min(width / state.width, height / state.height)
  if (cellSize <= 0) return

  const boardW = state.width * cellSize
  const boardH = state.height * cellSize
  const originX = (width - boardW) / 2
  const originY = (height - boardH) / 2

  ctx.fillStyle = PREVIEW_BOARD_BACKGROUND
  ctx.fillRect(originX, originY, boardW, boardH)

  for (const cell of collectCells(state)) {
    const left = originX + cell.x * cellSize
    const top = originY + cell.y * cellSize
    // Painter's order mirrors the 3D stack: ground tiles first, then the
    // upright stack sorted bottom-to-top so the topmost card wins.
    for (const item of sortGroundStack(cell.items)) {
      drawItem(ctx, state, item, left, top, cellSize)
    }
    const upright = sortUprightStack(cell.items)
    for (let i = upright.length - 1; i >= 0; i -= 1) {
      const item = upright[i]
      if (item) drawItem(ctx, state, item, left, top, cellSize)
    }
  }
}

// createInitialState resolves every rule for the spawn — hover can
// repaint the same board many times, so the resolved state is memoized
// per level object. WeakMap so non-campaign levels can still collect.
const previewStates = new WeakMap<LevelData, GameState>()

const previewStateFor = (level: LevelData): GameState => {
  const cached = previewStates.get(level)
  if (cached) return cached
  const state = createInitialState(level, 0)
  previewStates.set(level, state)
  return state
}

// DOM-facing entry: sizes the backing store to the CSS box and paints the
// level's initial state (rules resolved, so props/stacking match spawn).
export const paintLevelPreview = (
  canvas: HTMLCanvasElement,
  level: LevelData,
): void => {
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return

  const dpr = globalThis.devicePixelRatio || 1
  const cssWidth = canvas.clientWidth || 320
  const cssHeight = canvas.clientHeight || 180
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  drawLevelPreview(ctx, previewStateFor(level), cssWidth, cssHeight)
}
