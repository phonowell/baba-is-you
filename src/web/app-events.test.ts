import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRootClickHandler,
  createWindowKeydownHandler,
} from './app-events.js'

type MutableViewState = {
  mode: 'map' | 'game'
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

const noopGameDeps = {
  canHandleGameAction: () => true,
  markGameActionHandled: () => {
    throw new Error('should not mark game action handled')
  },
  handleGameCommand: () => {
    throw new Error('should not handle game command')
  },
}

test('createRootClickHandler toggles and closes the reference dialog', () => {
  const state: MutableViewState = { mode: 'map', showReferenceDialog: false }
  let toggles = 0
  let closes = 0
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      toggles += 1
    },
    closeReferenceDialog: () => {
      closes += 1
    },
    ...noopGameDeps,
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

  assert.equal(toggles, 1)
  assert.equal(closes, 1)
})

test('createRootClickHandler closes dialog only on backdrop clicks', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: true }
  let closes = 0
  const backdrop = {} as HTMLElement
  const dialog = {} as HTMLElement
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {
      closes += 1
    },
    ...noopGameDeps,
  })

  handler({
    target: createEventTarget({ backdrop, dialog: null }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({ backdrop, dialog }),
  } as unknown as MouseEvent)

  assert.equal(closes, 1)
})

test('createRootClickHandler routes game-mode HUD buttons through commands', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: false }
  const commands: string[] = []
  let marks = 0
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {
      throw new Error('should not close dialog')
    },
    canHandleGameAction: () => true,
    markGameActionHandled: () => {
      marks += 1
    },
    handleGameCommand: (cmd) => {
      commands.push(cmd.type)
      // Undo with an empty history is a no-op: it must not count as handled.
      return cmd.type !== 'undo'
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-restart'),
    }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-undo'),
    }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-map'),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(commands, ['restart', 'undo', 'back'])
  assert.equal(marks, 2)
})

test('createRootClickHandler routes the wait slot to enter on the map', () => {
  const state: MutableViewState = { mode: 'map', showReferenceDialog: false }
  const commands: string[] = []
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {
      throw new Error('should not close dialog')
    },
    canHandleGameAction: () => true,
    markGameActionHandled: () => {},
    handleGameCommand: (cmd) => {
      commands.push(cmd.type)
      return true
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-wait'),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(commands, ['enter'])
})

test('createRootClickHandler ignores game actions while a dialog is open', () => {
  const state: MutableViewState = { mode: 'map', showReferenceDialog: true }
  const commands: string[] = []
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {},
    canHandleGameAction: () => true,
    markGameActionHandled: () => {},
    handleGameCommand: (cmd) => {
      commands.push(cmd.type)
      return true
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-restart'),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(commands, [])
})

test('createRootClickHandler fires playReplay on the replay action', () => {
  const state: MutableViewState = {
    mode: 'game',
    showReferenceDialog: false,
  }
  let plays = 0
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {},
    closeReferenceDialog: () => {},
    ...noopGameDeps,
    playReplay: () => {
      plays += 1
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('play-replay'),
    }),
  } as unknown as MouseEvent)

  assert.equal(plays, 1)
})

test('createWindowKeydownHandler closes open dialogs on Escape only', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: true }
  let closes = 0
  let prevented = 0
  let mapCalls = 0
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
    handleMapEvent: () => {
      mapCalls += 1
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
  assert.equal(mapCalls, 0)
  assert.equal(gameCalls, 0)
})

test('createWindowKeydownHandler respects cooldown and marks only handled input', () => {
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
    handleMapEvent: () => {
      throw new Error('should not route to map')
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

test('createWindowKeydownHandler routes map-mode keys to the map handler', () => {
  const state: MutableViewState = { mode: 'map', showReferenceDialog: false }
  let mapCalls = 0
  let marks = 0
  let prevented = 0
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      throw new Error('should not close dialog on map')
    },
    canHandleGameAction: () => true,
    markGameActionHandled: () => {
      marks += 1
    },
    handleMapEvent: () => {
      mapCalls += 1
      return mapCalls === 1
    },
    handleGameEvent: () => {
      throw new Error('map path should not route to game')
    },
  })

  handler({
    key: 'ArrowLeft',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)
  handler({
    key: 'Enter',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)

  assert.equal(mapCalls, 2)
  assert.equal(marks, 1)
  assert.equal(prevented, 1)
})
