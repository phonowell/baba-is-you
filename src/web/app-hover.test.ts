import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appSpaceRect,
  cellItemNames,
  createBoardHover,
  createHoverTipWriter,
  visualCellToLogical,
} from './app-hover.js'

import type { GameState } from '../logic/types.js'
import type { BoardHoverTipElements } from './app-hover.js'

const createState = (
  overrides: Partial<GameState> = {},
): GameState => ({
  levelIndex: 0,
  title: 'hover-test',
  width: 5,
  height: 4,
  items: [],
  rules: [],
  status: 'playing',
  turn: 0,
  ...overrides,
})

type StubEl = {
  _text?: string
  textContent: string
  textWrites: number
  offsetWidth: number
  offsetHeight: number
  style: { transform: string }
  parentElement: StubEl | null
  isConnected: boolean
  hidden: boolean
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
  toggleAttribute: (name: string, force?: boolean) => boolean
  getBoundingClientRect: () => {
    left: number
    top: number
    right: number
    bottom: number
  }
  rect: { left: number; top: number; right: number; bottom: number }
}

const createStubEl = (rect = { left: 0, top: 0, right: 0, bottom: 0 }): StubEl => {
  const el: StubEl = {
    textWrites: 0,
    offsetWidth: 60,
    offsetHeight: 20,
    style: { transform: '' },
    parentElement: null,
    isConnected: true,
    hidden: false,
    rect,
    get textContent() {
      return this._text ?? ''
    },
    set textContent(value: string) {
      this._text = value
      this.textWrites += 1
    },
    setAttribute: (name) => {
      if (name === 'hidden') el.hidden = true
    },
    removeAttribute: (name) => {
      if (name === 'hidden') el.hidden = false
    },
    toggleAttribute: (name, force) => {
      if (name === 'hidden') el.hidden = force ?? !el.hidden
      return el.hidden
    },
    getBoundingClientRect: () => el.rect,
  }
  return el
}

const createTip = (
  wrapRect = { left: 0, top: 0, right: 800, bottom: 600 },
): { tip: BoardHoverTipElements; stub: StubEl } => {
  const root = createStubEl()
  // The real chip is created with `hidden` — the stub mirrors that so the
  // writer's dedupe sees the same initial state.
  root.hidden = true
  const wrap = createStubEl(wrapRect)
  root.parentElement = wrap
  const coord = createStubEl()
  const names = createStubEl()
  const tip = {
    root: root as unknown as HTMLElement,
    coord: coord as unknown as HTMLElement,
    names: names as unknown as HTMLElement,
  }
  return { tip, stub: root }
}

test('appSpaceRect maps viewport rects through the rotation mapper', () => {
  const identity = appSpaceRect(
    { left: 10, top: 20, right: 110, bottom: 70 },
    (x, y) => ({ x, y }),
  )
  assert.deepEqual(identity, { left: 10, top: 20, width: 100, height: 50 })

  // The portrait frame's inverse rotation: (x, y) → (y, -x) about the
  // viewport origin — a 100x50 viewport rect is a 50x100 app rect.
  const rotated = appSpaceRect(
    { left: 0, top: 0, right: 100, bottom: 50 },
    (x, y) => ({ x: y, y: -x }),
  )
  assert.deepEqual(rotated, { left: 0, top: -100, width: 50, height: 100 })
})

test('visualCellToLogical unwraps the scrollroom render offset', () => {
  const state = createState({
    width: 5,
    height: 4,
    levelOffset: { x: 1, y: 0 },
  })
  assert.deepEqual(visualCellToLogical(state, { x: 0, y: 3 }), {
    x: 4,
    y: 3,
  })
  assert.deepEqual(visualCellToLogical(state, { x: 3, y: 0 }), {
    x: 2,
    y: 0,
  })
  // No offset → the cell passes through untouched.
  const plain = createState()
  assert.deepEqual(visualCellToLogical(plain, { x: 1, y: 2 }), {
    x: 1,
    y: 2,
  })
})

test('cellItemNames lists visible cards, text tiles as their word', () => {
  const state = createState({
    items: [
      { id: 1, name: 'baba', x: 2, y: 1, isText: false, props: [] },
      { id: 2, name: 'win', x: 2, y: 1, isText: true, props: [] },
      { id: 3, name: 'ghost', x: 2, y: 1, isText: false, props: ['hide'] },
      { id: 4, name: 'rock', x: 0, y: 0, isText: false, props: [] },
    ],
  })
  assert.deepEqual(cellItemNames(state, 2, 1), ['baba', 'WIN'])
  assert.deepEqual(cellItemNames(state, 0, 0), ['rock'])
  assert.deepEqual(cellItemNames(state, 4, 4), [])
})

test('hover tip fills content and anchors below-right of the cursor', () => {
  const { tip, stub } = createTip()
  const writer = createHoverTipWriter(tip)
  writer.show(
    { x: 100, y: 100 },
    { left: 0, top: 0, width: 800, height: 600 },
    { x: 3, y: 4 },
    ['baba', 'WALL'],
  )
  assert.equal(stub.hidden, false)
  assert.equal(tip.coord.textContent, '(3, 4)')
  assert.equal(tip.names.textContent, 'baba, WALL')
  assert.equal(stub.style.transform, 'translate3d(114px, 118px, 0)')
})

test('hover tip flips back inside when the cursor hugs the edge', () => {
  const { tip, stub } = createTip()
  const writer = createHoverTipWriter(tip)
  writer.show(
    { x: 790, y: 590 },
    { left: 0, top: 0, width: 800, height: 600 },
    { x: 0, y: 0 },
    [],
  )
  // 790 + 14 + 60 > 800 - 8 → flips to the cursor's left; same vertically.
  assert.equal(stub.style.transform, `translate3d(${790 - 60 - 14}px, ${590 - 20 - 18}px, 0)`)
  // The empty names span stays hidden rather than rendering a blank slot.
  assert.equal((tip.names as unknown as StubEl).hidden, true)

  writer.hide()
  assert.equal(stub.hidden, true)
})

test('hover tip skips DOM writes while content and position are unchanged', () => {
  const { tip, stub } = createTip()
  const names = ['baba']
  const writer = createHoverTipWriter(tip)
  const bounds = { left: 0, top: 0, width: 800, height: 600 }

  writer.show({ x: 100, y: 100 }, bounds, { x: 1, y: 1 }, names)
  const coordWrites = (tip.coord as unknown as StubEl).textWrites
  const transform = stub.style.transform

  // Same content AND same position: nothing about the chip may change.
  writer.show({ x: 100, y: 100 }, bounds, { x: 1, y: 1 }, names)
  assert.equal((tip.coord as unknown as StubEl).textWrites, coordWrites)
  assert.equal(stub.style.transform, transform)

  // A new position only moves the chip — the text nodes stay untouched.
  writer.show({ x: 200, y: 100 }, bounds, { x: 1, y: 1 }, names)
  assert.equal((tip.coord as unknown as StubEl).textWrites, coordWrites)
  assert.notEqual(stub.style.transform, transform)

  // Repeated hides don't re-write the attribute.
  writer.hide()
  writer.hide()
  assert.equal(stub.hidden, true)
})

test('board hover picks the cell, fills the tip, and clears on end', () => {
  const state = createState({
    items: [
      { id: 1, name: 'flag', x: 1, y: 2, isText: false, props: [] },
    ],
  })
  const { tip, stub } = createTip()
  const picked: Array<{ x: number; y: number }> = []
  let cleared = 0
  const renderer = {
    setHoverAtPoint: (x: number, y: number) => {
      picked.push({ x, y })
      return { x: 1, y: 2 }
    },
    clearHover: () => {
      cleared += 1
    },
  }
  const board = createStubEl({ left: 0, top: 0, right: 800, bottom: 600 })
  const hover = createBoardHover({
    getGameState: () => state,
    getTip: () => tip,
    getRenderer: () => renderer,
  })

  hover.move(board as unknown as HTMLElement, 200, 300)
  assert.deepEqual(picked, [{ x: 200, y: 300 }])
  assert.equal(stub.hidden, false)
  assert.equal(tip.coord.textContent, '(1, 2)')
  assert.equal(tip.names.textContent, 'flag')

  hover.clear()
  assert.equal(cleared, 1)
  assert.equal(stub.hidden, true)
})

test('board hover dedupes identical moves before touching the renderer', () => {
  const { tip } = createTip()
  let picks = 0
  const renderer = {
    setHoverAtPoint: () => {
      picks += 1
      return { x: 0, y: 0 }
    },
    clearHover: () => undefined,
  }
  const board = createStubEl({ left: 0, top: 0, right: 800, bottom: 600 })
  const hover = createBoardHover({
    getGameState: () => createState(),
    getTip: () => tip,
    getRenderer: () => renderer,
  })
  const boardEl = board as unknown as HTMLElement

  hover.move(boardEl, 50, 50)
  hover.move(boardEl, 50, 50)
  hover.move(boardEl, 50, 50)
  assert.equal(picks, 1)

  hover.move(boardEl, 51, 50)
  assert.equal(picks, 2)
})

test('board hover caches cell names until the state or cell changes', () => {
  const items: GameState['items'] = [
    { id: 1, name: 'flag', x: 1, y: 1, isText: false, props: [] },
  ]
  let current = createState({ items })
  const { tip } = createTip()
  const renderer = {
    setHoverAtPoint: () => ({ x: 1, y: 1 }),
    clearHover: () => undefined,
  }
  const board = createStubEl({ left: 0, top: 0, right: 800, bottom: 600 })
  const hover = createBoardHover({
    getGameState: () => current,
    getTip: () => tip,
    getRenderer: () => renderer,
  })
  const boardEl = board as unknown as HTMLElement

  hover.move(boardEl, 50, 50)
  assert.equal(tip.names.textContent, 'flag')

  // Same state ref + same cell → cached names: the in-place mutation is
  // invisible, proving the scan didn't re-run.
  items.push({ id: 2, name: 'rock', x: 1, y: 1, isText: false, props: [] })
  hover.move(boardEl, 52, 50)
  assert.equal(tip.names.textContent, 'flag')

  // A new state object invalidates the cache — the refresh after a turn
  // picks the pushed card up.
  current = createState({ items })
  hover.refresh()
  assert.equal(tip.names.textContent, 'flag, rock')
})

test('board hover hides the tip when the point misses the grid', () => {
  const { tip, stub } = createTip()
  const renderer = {
    setHoverAtPoint: () => null,
    clearHover: () => undefined,
  }
  const board = createStubEl()
  const hover = createBoardHover({
    getGameState: () => createState(),
    getTip: () => tip,
    getRenderer: () => renderer,
  })

  hover.move(board as unknown as HTMLElement, 10, 10)
  assert.equal(stub.hidden, true)
})

test('board hover refresh honors the dialog guard for a parked cursor', () => {
  const { tip, stub } = createTip()
  let blocked = false
  let cleared = 0
  const renderer = {
    setHoverAtPoint: () => ({ x: 0, y: 0 }),
    clearHover: () => {
      cleared += 1
    },
  }
  const board = createStubEl({ left: 0, top: 0, right: 800, bottom: 600 })
  const hover = createBoardHover({
    getGameState: () => createState(),
    getTip: () => tip,
    getRenderer: () => renderer,
    isBlocked: () => blocked,
  })
  const boardEl = board as unknown as HTMLElement

  hover.move(boardEl, 50, 50)
  assert.equal(stub.hidden, false)

  // The reference dialog opened while the cursor sat still — the refresh
  // that follows must hide the chip instead of re-showing it under the
  // modal.
  blocked = true
  hover.refresh()
  assert.equal(stub.hidden, true)
  assert.equal(cleared, 1)

  // Dialog closed with the cursor still parked: the chip comes back.
  blocked = false
  hover.refresh()
  assert.equal(stub.hidden, false)
})

test('board hover refresh re-picks while the cursor stays parked', () => {
  const { tip, stub } = createTip()
  let nextCell: { x: number; y: number } | null = { x: 0, y: 0 }
  const renderer = {
    setHoverAtPoint: () => nextCell,
    clearHover: () => undefined,
  }
  const board = createStubEl({ left: 0, top: 0, right: 800, bottom: 600 })
  const hover = createBoardHover({
    getGameState: () => createState(),
    getTip: () => tip,
    getRenderer: () => renderer,
  })

  hover.move(board as unknown as HTMLElement, 50, 50)
  assert.equal(stub.hidden, false)

  // The state stepped under the cursor: the pick now misses, so the tip
  // goes away instead of serving a stale cell.
  nextCell = null
  hover.refresh()
  assert.equal(stub.hidden, true)

  // A rebuilt board (level switch) drops the parked hover entirely.
  nextCell = { x: 0, y: 0 }
  hover.move(board as unknown as HTMLElement, 50, 50)
  board.isConnected = false
  hover.refresh()
  assert.equal(stub.hidden, true)
})
