import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRootClickHandler,
  createWindowKeydownHandler,
} from './app-events.js'

type MutableViewState = {
  mode: 'menu' | 'game'
  showReferenceDialog: boolean
}

class TestHTMLElement {
  dataset: Record<string, string | undefined> = {}

  #closest = new Map<string, Element | null>()

  setClosest(selector: string, value: Element | null): void {
    this.#closest.set(selector, value)
  }

  closest<T extends Element = HTMLElement>(selector: string): T | null {
    return (this.#closest.get(selector) ?? null) as T | null
  }
}

if (!('HTMLElement' in globalThis)) {
  ;(globalThis as typeof globalThis & { HTMLElement: typeof TestHTMLElement }).HTMLElement =
    TestHTMLElement as never
}

const createViewState = (state: MutableViewState) => ({
  getMode: () => state.mode,
  isReferenceDialogOpen: () => state.showReferenceDialog,
})

const createActionElement = (
  action: string,
  extraDataset: Record<string, string> = {},
): HTMLElement => {
  const element = new TestHTMLElement()
  element.dataset = {
    action,
    ...extraDataset,
  }
  return element as unknown as HTMLElement
}

const createEventTarget = (matches: {
  actionElement?: HTMLElement | null
  backdrop?: HTMLElement | null
  dialog?: HTMLElement | null
}): HTMLElement => {
  const element = new TestHTMLElement()
  element.setClosest('[data-action]', matches.actionElement ?? null)
  element.setClosest('[data-role="reference-backdrop"]', matches.backdrop ?? null)
  element.setClosest('[data-role="reference-dialog"]', matches.dialog ?? null)
  return element as unknown as HTMLElement
}

test('createRootClickHandler starts valid menu levels only', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  const started: number[] = []
  const handler = createRootClickHandler({
    levelCount: 2,
    viewState: createViewState(state),
    enterGame: (index) => {
      started.push(index)
    },
    toggleReferenceDialog: () => {
      throw new Error('should not toggle in menu start test')
    },
    closeReferenceDialog: () => {
      throw new Error('should not close in menu start test')
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('start-level', { levelIndex: '1' }),
    }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({
      actionElement: createActionElement('start-level', { levelIndex: '9' }),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(started, [1])
})

test('createRootClickHandler ignores reference actions outside game mode', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  let toggles = 0
  let closes = 0
  const handler = createRootClickHandler({
    levelCount: 1,
    viewState: createViewState(state),
    enterGame: () => {
      throw new Error('should not enter game')
    },
    toggleReferenceDialog: () => {
      toggles += 1
    },
    closeReferenceDialog: () => {
      closes += 1
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('toggle-reference'),
    }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({
      actionElement: createActionElement('close-reference'),
    }),
  } as unknown as MouseEvent)

  assert.equal(toggles, 0)
  assert.equal(closes, 0)
})

test('createRootClickHandler closes dialog only on game backdrop clicks', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: true }
  let closes = 0
  const backdrop = {} as HTMLElement
  const dialog = {} as HTMLElement
  const handler = createRootClickHandler({
    levelCount: 1,
    viewState: createViewState(state),
    enterGame: () => {
      throw new Error('should not enter game')
    },
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {
      closes += 1
    },
  })

  handler({
    target: createEventTarget({ backdrop, dialog: null }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({ backdrop, dialog }),
  } as unknown as MouseEvent)

  assert.equal(closes, 1)
})

test('createWindowKeydownHandler closes open game dialog on Escape only', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: true }
  let closes = 0
  let prevented = 0
  let menuCalls = 0
  let gameCalls = 0
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      closes += 1
    },
    canHandleGameAction: () => true,
    markGameActionHandled: () => {
      throw new Error('dialog close should not mark game action handled')
    },
    handleMenuEvent: () => {
      menuCalls += 1
      return true
    },
    handleGameEvent: () => {
      gameCalls += 1
      return true
    },
  })

  handler({
    key: 'Escape',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)
  handler({
    key: 'n',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)

  assert.equal(closes, 1)
  assert.equal(prevented, 1)
  assert.equal(menuCalls, 0)
  assert.equal(gameCalls, 0)
})

test('createWindowKeydownHandler respects game cooldown and marks only handled game input', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: false }
  let handledMarks = 0
  let prevented = 0
  let gameCalls = 0
  let canHandle = false
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      throw new Error('should not close dialog')
    },
    canHandleGameAction: () => canHandle,
    markGameActionHandled: () => {
      handledMarks += 1
    },
    handleMenuEvent: () => {
      throw new Error('should not route to menu')
    },
    handleGameEvent: () => {
      gameCalls += 1
      return gameCalls === 1
    },
  })

  handler({
    key: 'ArrowRight',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)

  canHandle = true
  handler({
    key: 'ArrowRight',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)
  handler({
    key: 'ArrowLeft',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)

  assert.equal(gameCalls, 2)
  assert.equal(handledMarks, 1)
  assert.equal(prevented, 1)
})

test('createWindowKeydownHandler routes menu events without game-side bookkeeping', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  let menuCalls = 0
  let prevented = 0
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      throw new Error('should not close dialog in menu')
    },
    canHandleGameAction: () => {
      throw new Error('menu path should not query game cooldown')
    },
    markGameActionHandled: () => {
      throw new Error('menu path should not mark game actions')
    },
    handleMenuEvent: () => {
      menuCalls += 1
      return true
    },
    handleGameEvent: () => {
      throw new Error('menu path should not route to game')
    },
  })

  handler({
    key: 'Enter',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)

  assert.equal(menuCalls, 1)
  assert.equal(prevented, 1)
})

test('createWindowKeydownHandler does not prevent or mark ignored menu input', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  let prevented = 0
  let menuCalls = 0
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      throw new Error('should not close dialog in menu')
    },
    canHandleGameAction: () => {
      throw new Error('menu path should not query game cooldown')
    },
    markGameActionHandled: () => {
      throw new Error('menu path should not mark game actions')
    },
    handleMenuEvent: () => {
      menuCalls += 1
      return false
    },
    handleGameEvent: () => {
      throw new Error('menu path should not route to game')
    },
  })

  handler({
    key: 'ArrowUp',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)

  assert.equal(menuCalls, 1)
  assert.equal(prevented, 0)
})
