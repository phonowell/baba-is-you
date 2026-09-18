import assert from 'node:assert/strict'
import test from 'node:test'

import { createBoardPointerHandlers } from './app-pointer.js'

import type { BoardPointerEvent } from './app-pointer.js'
import type { GameCommand } from '../view/input.js'

class TestElement {
  rect = { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }
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

  getBoundingClientRect(): typeof this.rect {
    return this.rect
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

const offBoard = (): HTMLElement => new TestElement() as unknown as HTMLElement

const pointerEvent = (
  overrides: Partial<BoardPointerEvent> = {},
): BoardPointerEvent => ({
  pointerId: 1,
  pointerType: 'touch',
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
  parallax?: boolean
}

const createContext = (options: ContextOptions = {}) => {
  const commands: GameCommand[] = []
  const parallaxTargets: Array<[number, number]> = []
  let marks = 0
  let buzzes = 0
  const handlers = createBoardPointerHandlers({
    viewState: {
      getMode: () => options.mode ?? 'game',
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
    ...(options.parallax
      ? {
          setParallaxTarget: (nx: number, ny: number) => {
            parallaxTargets.push([nx, ny])
          },
        }
      : {}),
    onHandledAction: () => {
      buzzes += 1
    },
  })
  return {
    handlers,
    commands,
    parallaxTargets,
    get marks() {
      return marks
    },
    get buzzes() {
      return buzzes
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

test('pointer tap on the board plays a wait turn', () => {
  const { handlers, commands } = createContext()

  handlers.onPointerDown(pointerEvent({ clientX: 60, clientY: 60 }))
  handlers.onPointerUp(pointerEvent({ clientX: 62, clientY: 61 }))

  assert.deepEqual(commands, [{ type: 'wait' }])
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

test('pointer gestures are ignored outside game mode, with dialog open, and off the board', () => {
  const { handlers, commands } = createContext({ mode: 'menu' })
  handlers.onPointerDown(pointerEvent())
  handlers.onPointerMove(pointerEvent({ clientX: 160, clientY: 100 }))
  handlers.onPointerUp(pointerEvent({ clientX: 160, clientY: 100 }))

  const dialogCtx = createContext({ dialogOpen: true })
  dialogCtx.handlers.onPointerDown(pointerEvent())
  dialogCtx.handlers.onPointerUp(pointerEvent())

  const offBoardCtx = createContext()
  offBoardCtx.handlers.onPointerDown(pointerEvent({ target: offBoard() }))
  offBoardCtx.handlers.onPointerUp(pointerEvent({ target: offBoard() }))

  assert.deepEqual(commands, [])
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

test('mouse hover feeds normalized parallax targets and resets off-board', () => {
  const { handlers, parallaxTargets } = createContext({ parallax: true })

  handlers.onPointerMove(
    pointerEvent({ pointerType: 'mouse', clientX: 200, clientY: 0 }),
  )
  handlers.onPointerMove(
    pointerEvent({ pointerType: 'mouse', clientX: 100, clientY: 100, target: offBoard() }),
  )
  handlers.onPointerMove(pointerEvent({ clientX: 200, clientY: 0 }))
  handlers.onPointerOut(
    pointerEvent({ pointerType: 'mouse', relatedTarget: null }),
  )

  assert.deepEqual(parallaxTargets, [
    [1, -1],
    [0, 0],
    [0, 0],
    [0, 0],
  ])
})
