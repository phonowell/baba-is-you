import assert from 'node:assert/strict'
import test from 'node:test'

import { createAppPointerHandlers } from './app-pointer.js'

import type { AppPointerEvent } from './app-pointer.js'
import type { GameCommand } from '../view/input.js'

class TestElement {
  capturedIds: number[] = []

  #closest = new Map<string, Element | null>()

  setPointerCapture(pointerId: number): void {
    this.capturedIds.push(pointerId)
  }

  setClosest(selector: string, value: Element | null): void {
    this.#closest.set(selector, value)
  }

  closest<T extends Element = HTMLElement>(selector: string): T | null {
    return (this.#closest.get(selector) ?? null) as T | null
  }
}

if (!('Element' in globalThis)) {
  ;(globalThis as typeof globalThis & { Element: typeof TestElement }).Element =
    TestElement as never
}

const boardEl = new TestElement() as unknown as HTMLElement

const onBoard = (): HTMLElement => {
  const el = new TestElement()
  el.setClosest('.board', boardEl as unknown as Element)
  return el as unknown as HTMLElement
}

const offSurface = (): HTMLElement => new TestElement() as unknown as HTMLElement

const pointerEvent = (
  overrides: Partial<AppPointerEvent> = {},
): AppPointerEvent => ({
  pointerId: 1,
  clientX: 100,
  clientY: 100,
  target: onBoard(),
  preventDefault: () => {},
  ...overrides,
})

type ContextOptions = {
  mode?: 'menu' | 'game'
  dialogOpen?: boolean
  canHandle?: () => boolean
  handled?: (cmd: GameCommand) => boolean
  mapViewportDelta?: (dx: number, dy: number) => { dx: number; dy: number }
}

const createContext = (options: ContextOptions = {}) => {
  const commands: GameCommand[] = []
  const hovers: Array<{ board: HTMLElement; x: number; y: number }> = []
  let marks = 0
  let buzzes = 0
  let hoverEnds = 0
  const state = { mode: options.mode ?? 'game' }
  const handlers = createAppPointerHandlers({
    viewState: {
      getMode: () => state.mode,
      isReferenceDialogOpen: () => options.dialogOpen ?? false,
    },
    canHandleGameAction: options.canHandle ?? (() => true),
    markGameActionHandled: () => {
      marks += 1
    },
    handleGameCommand: (cmd) => {
      commands.push(cmd)
      return options.handled?.(cmd) ?? true
    },
    ...(options.mapViewportDelta
      ? { mapViewportDelta: options.mapViewportDelta }
      : {}),
    onHandledAction: () => {
      buzzes += 1
    },
    onBoardHover: (board, x, y) => {
      hovers.push({ board, x, y })
    },
    onBoardHoverEnd: () => {
      hoverEnds += 1
    },
  })
  return {
    handlers,
    commands,
    hovers,
    setMode: (mode: 'menu' | 'game') => {
      state.mode = mode
    },
    get marks() {
      return marks
    },
    get buzzes() {
      return buzzes
    },
    get hoverEnds() {
      return hoverEnds
    },
  }
}

test('pointer swipe past threshold fires one move on the dominant axis', () => {
  const ctx = createContext()
  const { handlers, commands } = ctx

  handlers.onPointerDown(pointerEvent({ clientX: 100, clientY: 100 }))
  handlers.onPointerMove(pointerEvent({ clientX: 140, clientY: 104 }))
  // Further movement in the same press must not fire a second move.
  handlers.onPointerMove(pointerEvent({ clientX: 180, clientY: 110 }))
  handlers.onPointerUp(pointerEvent({ clientX: 180, clientY: 110 }))

  assert.deepEqual(commands, [{ type: 'move', direction: 'right' }])
  assert.equal(ctx.marks, 1)
  assert.equal(ctx.buzzes, 1)
})

test('pointer tap on a level plays a wait turn', () => {
  const { handlers, commands } = createContext()

  handlers.onPointerDown(pointerEvent({ clientX: 60, clientY: 60 }))
  handlers.onPointerUp(pointerEvent({ clientX: 62, clientY: 61 }))

  assert.deepEqual(commands, [{ type: 'wait' }])
})

test('pointer gestures are inert on the menu — rows enter via click', () => {
  const { handlers, commands } = createContext({ mode: 'menu' })

  handlers.onPointerDown(pointerEvent({ clientX: 60, clientY: 60 }))
  handlers.onPointerUp(pointerEvent({ clientX: 62, clientY: 61 }))
  handlers.onPointerDown(pointerEvent({ clientX: 50, clientY: 50 }))
  handlers.onPointerMove(pointerEvent({ clientX: 52, clientY: 20 }))
  handlers.onPointerUp(pointerEvent({ clientX: 52, clientY: 20 }))

  assert.deepEqual(commands, [])
})

test('pointer swipe vertically resolves to up or down', () => {
  const { handlers, commands } = createContext()

  handlers.onPointerDown(pointerEvent({ clientX: 50, clientY: 50 }))
  handlers.onPointerMove(pointerEvent({ clientX: 52, clientY: 20 }))
  handlers.onPointerUp(pointerEvent({ clientX: 52, clientY: 20 }))

  handlers.onPointerDown(pointerEvent({ clientX: 50, clientY: 50 }))
  handlers.onPointerMove(pointerEvent({ clientX: 48, clientY: 90 }))
  handlers.onPointerUp(pointerEvent({ clientX: 48, clientY: 90 }))

  assert.deepEqual(commands, [
    { type: 'move', direction: 'up' },
    { type: 'move', direction: 'down' },
  ])
})

test('pointer gestures are ignored with a dialog open and off the board', () => {
  const dialogCtx = createContext({ dialogOpen: true })
  dialogCtx.handlers.onPointerDown(pointerEvent())
  dialogCtx.handlers.onPointerUp(pointerEvent())

  const offBoardCtx = createContext()
  offBoardCtx.handlers.onPointerDown(pointerEvent({ target: offSurface() }))
  offBoardCtx.handlers.onPointerUp(pointerEvent({ target: offSurface() }))

  assert.deepEqual(dialogCtx.commands, [])
  assert.deepEqual(offBoardCtx.commands, [])
})

test('unhandled commands and cooldown-blocked swipes are not marked handled', () => {
  const ctx = createContext({
    handled: () => false,
  })
  const { handlers, commands } = ctx
  handlers.onPointerDown(pointerEvent())
  handlers.onPointerMove(pointerEvent({ clientX: 160, clientY: 100 }))
  handlers.onPointerUp(pointerEvent({ clientX: 160, clientY: 100 }))
  assert.equal(commands.length, 1)
  assert.equal(ctx.marks, 0)

  const cooling = createContext({ canHandle: () => false })
  cooling.handlers.onPointerDown(pointerEvent())
  cooling.handlers.onPointerMove(pointerEvent({ clientX: 160, clientY: 100 }))
  cooling.handlers.onPointerUp(pointerEvent({ clientX: 160, clientY: 100 }))
  assert.equal(cooling.commands.length, 0)
  assert.equal(cooling.marks, 0)
})

test('pointerdown captures the pointer on the board so off-app releases still land', () => {
  const board = new TestElement()
  const target = new TestElement()
  target.setClosest('.board', board as unknown as Element)
  const { handlers } = createContext()

  handlers.onPointerDown(pointerEvent({ target: target as unknown as HTMLElement, pointerId: 7 }))

  assert.deepEqual(board.capturedIds, [7])
})

test('pointer cancel resets the drag so a stale release cannot fire wait', () => {
  const { handlers, commands } = createContext()

  handlers.onPointerDown(pointerEvent())
  handlers.onPointerCancel(pointerEvent())
  handlers.onPointerUp(pointerEvent())

  assert.deepEqual(commands, [])
})

test('viewport delta mapping rotates gestures back into app space', () => {
  // The forced-landscape frame turns the app 90° clockwise, so the app's
  // left edge faces the top of the screen: an upward screen drag is a
  // leftward app swipe.
  const { handlers, commands } = createContext({
    mapViewportDelta: (dx, dy) => ({ dx: dy, dy: -dx }),
  })

  handlers.onPointerDown(pointerEvent({ clientX: 100, clientY: 100 }))
  handlers.onPointerMove(pointerEvent({ clientX: 100, clientY: 60 }))
  handlers.onPointerUp(pointerEvent({ clientX: 100, clientY: 60 }))

  assert.deepEqual(commands, [{ type: 'move', direction: 'left' }])
})

test('a mode change mid-drag invalidates the gesture instead of retargeting it', () => {
  const ctx = createContext({ mode: 'game' })
  const { handlers, commands } = ctx

  handlers.onPointerDown(pointerEvent({ clientX: 100, clientY: 100 }))
  ctx.setMode('menu')
  handlers.onPointerMove(pointerEvent({ clientX: 100, clientY: 40 }))
  handlers.onPointerUp(pointerEvent({ clientX: 100, clientY: 40 }))

  assert.deepEqual(commands, [])
})

test('hover reports the board cell while no press is captured', () => {
  const ctx = createContext()

  ctx.handlers.onPointerMove(pointerEvent({ clientX: 33, clientY: 44 }))

  assert.equal(ctx.hovers.length, 1)
  assert.equal(ctx.hovers[0]?.board, boardEl)
  assert.deepEqual({ x: ctx.hovers[0]?.x, y: ctx.hovers[0]?.y }, { x: 33, y: 44 })
  assert.equal(ctx.hoverEnds, 0)
})

test('hover stays quiet for touch moves, off-board moves, and the menu', () => {
  const ctx = createContext()

  ctx.handlers.onPointerMove(pointerEvent({ pointerType: 'touch' }))
  ctx.handlers.onPointerMove(pointerEvent({ target: offSurface() }))

  const menuCtx = createContext({ mode: 'menu' })
  menuCtx.handlers.onPointerMove(pointerEvent())

  assert.equal(ctx.hovers.length, 0)
  assert.equal(menuCtx.hovers.length, 0)
  assert.equal(ctx.hoverEnds, 2)
})

test('a swipe consumes the gesture and ends hover reporting', () => {
  const ctx = createContext()

  ctx.handlers.onPointerMove(pointerEvent({ clientX: 30, clientY: 30 }))
  ctx.handlers.onPointerDown(pointerEvent({ clientX: 30, clientY: 30 }))
  // Below-threshold drag: no hover reports while a press is captured.
  ctx.handlers.onPointerMove(pointerEvent({ clientX: 38, clientY: 32 }))
  ctx.handlers.onPointerMove(pointerEvent({ clientX: 90, clientY: 34 }))
  ctx.handlers.onPointerUp(pointerEvent({ clientX: 90, clientY: 34 }))

  assert.equal(ctx.hovers.length, 1)
  assert.equal(ctx.hoverEnds, 1)
  assert.deepEqual(ctx.commands, [{ type: 'move', direction: 'right' }])
})

test('pointerleave ends hover', () => {
  const ctx = createContext()

  ctx.handlers.onPointerMove(pointerEvent())
  ctx.handlers.onPointerLeave()

  assert.equal(ctx.hoverEnds, 1)
})
