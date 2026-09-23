import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMenuHoverHandler,
  createRootClickHandler,
  createWindowKeydownHandler,
} from './app-events.js'

type MutableViewState = {
  mode: 'menu' | 'game'
  showReferenceDialog: boolean
  showReplayConfirm?: boolean
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
  isReplayConfirmOpen: () => state.showReplayConfirm ?? false,
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
  confirmBackdrop?: HTMLElement | null
  confirmDialog?: HTMLElement | null
}): HTMLElement => {
  const element = new TestHTMLElement()
  element.setClosest('[data-action]', matches.actionElement ?? null)
  element.setClosest('[data-role="reference-backdrop"]', matches.backdrop ?? null)
  element.setClosest('[data-role="reference-dialog"]', matches.dialog ?? null)
  element.setClosest(
    '[data-role="replay-confirm-backdrop"]',
    matches.confirmBackdrop ?? null,
  )
  element.setClosest(
    '[data-role="replay-confirm-dialog"]',
    matches.confirmDialog ?? null,
  )
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
  enterLevel: () => {
    throw new Error('should not enter a level')
  },
}

test('createRootClickHandler toggles and closes the reference dialog', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
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
    enterLevel: () => {
      throw new Error('should not enter a level from game mode')
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
      actionElement: createActionElement('game-menu'),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(commands, ['restart', 'undo', 'back'])
  assert.equal(marks, 2)
})

test('createRootClickHandler enters the clicked menu row directly', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  const entered: number[] = []
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {
      throw new Error('should not close dialog')
    },
    ...noopGameDeps,
    enterLevel: (index) => {
      entered.push(index)
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('start-level', {
        levelIndex: '7',
      }),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(entered, [7])
})

test('createRootClickHandler ignores start-level clicks outside the menu', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: false }
  let entered = 0
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {},
    closeReferenceDialog: () => {},
    ...noopGameDeps,
    enterLevel: () => {
      entered += 1
    },
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('start-level', {
        levelIndex: '3',
      }),
    }),
  } as unknown as MouseEvent)

  assert.equal(entered, 0)
})

test('createRootClickHandler ignores game actions while a dialog is open', () => {
  const state: MutableViewState = { mode: 'game', showReferenceDialog: true }
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
    enterLevel: () => {},
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-restart'),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(commands, [])
})

test('createRootClickHandler asks before playing: play-replay opens the confirm, confirm-replay commits', () => {
  const state: MutableViewState = {
    mode: 'game',
    showReferenceDialog: false,
  }
  let opens = 0
  let closes = 0
  let plays = 0
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {},
    closeReferenceDialog: () => {},
    openReplayConfirm: () => {
      opens += 1
      state.showReplayConfirm = true
    },
    closeReplayConfirm: () => {
      closes += 1
      state.showReplayConfirm = false
    },
    ...noopGameDeps,
    playReplay: () => {
      plays += 1
    },
  })

  // The bare Solution click only asks — playback must not start yet.
  handler({
    target: createEventTarget({
      actionElement: createActionElement('play-replay'),
    }),
  } as unknown as MouseEvent)
  assert.equal(opens, 1)
  assert.equal(plays, 0)

  // The dialog's own commit closes the ask and runs the replay.
  handler({
    target: createEventTarget({
      actionElement: createActionElement('confirm-replay'),
    }),
  } as unknown as MouseEvent)
  assert.equal(closes, 1)
  assert.equal(plays, 1)

  // Cancel asks nothing further — it only dismisses.
  handler({
    target: createEventTarget({
      actionElement: createActionElement('cancel-replay'),
    }),
  } as unknown as MouseEvent)
  assert.equal(closes, 2)
  assert.equal(plays, 1)
})

test('createRootClickHandler dismisses the replay confirm on backdrop clicks only', () => {
  const state: MutableViewState = {
    mode: 'game',
    showReferenceDialog: false,
    showReplayConfirm: true,
  }
  let closes = 0
  const confirmBackdrop = {} as HTMLElement
  const confirmDialog = {} as HTMLElement
  const handler = createRootClickHandler({
    viewState: createViewState(state),
    toggleReferenceDialog: () => {
      throw new Error('should not toggle dialog')
    },
    closeReferenceDialog: () => {},
    closeReplayConfirm: () => {
      closes += 1
    },
    ...noopGameDeps,
  })

  // Dialog interior clicks keep the ask open; the dim behind it cancels.
  handler({
    target: createEventTarget({ confirmBackdrop, confirmDialog }),
  } as unknown as MouseEvent)
  handler({
    target: createEventTarget({ confirmBackdrop, confirmDialog: null }),
  } as unknown as MouseEvent)

  assert.equal(closes, 1)
})

test('createRootClickHandler ignores game actions while the replay confirm is open', () => {
  const state: MutableViewState = {
    mode: 'game',
    showReferenceDialog: false,
    showReplayConfirm: true,
  }
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
    enterLevel: () => {},
  })

  handler({
    target: createEventTarget({
      actionElement: createActionElement('game-restart'),
    }),
  } as unknown as MouseEvent)

  assert.deepEqual(commands, [])
})

test('createMenuHoverHandler selects the hovered cell in menu mode only', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  const selected: number[] = []
  const handler = createMenuHoverHandler({
    viewState: createViewState(state),
    selectLevel: (index) => {
      selected.push(index)
    },
  })

  const overCellIndex = (index: string): HTMLElement => {
    const cell = new TestHTMLElement()
    cell.dataset = { levelIndex: index }
    const target = new TestHTMLElement()
    target.setClosest('.menu-cell[data-level-index]', cell as unknown as Element)
    return target as unknown as HTMLElement
  }

  handler({
    target: overCellIndex('4'),
    clientX: 10,
    clientY: 10,
  } as unknown as PointerEvent)

  // Non-cell targets and non-integer indexes never select.
  const overNothing = new TestHTMLElement()
  overNothing.setClosest('.menu-cell[data-level-index]', null)
  handler({
    target: overNothing,
    clientX: 20,
    clientY: 20,
  } as unknown as PointerEvent)
  handler({
    target: overCellIndex('x'),
    clientX: 30,
    clientY: 30,
  } as unknown as PointerEvent)

  // Game mode ignores hover entirely — cells aren't on screen anyway,
  // but the mode guard is what keeps the handler cheap.
  state.mode = 'game'
  handler({
    target: overCellIndex('7'),
    clientX: 40,
    clientY: 40,
  } as unknown as PointerEvent)

  assert.deepEqual(selected, [4])
})

test('createMenuHoverHandler ignores pointerover without real movement', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  const selected: number[] = []
  const handler = createMenuHoverHandler({
    viewState: createViewState(state),
    selectLevel: (index) => {
      selected.push(index)
    },
  })

  const overCellIndex = (index: string): HTMLElement => {
    const cell = new TestHTMLElement()
    cell.dataset = { levelIndex: index }
    const target = new TestHTMLElement()
    target.setClosest('.menu-cell[data-level-index]', cell as unknown as Element)
    return target as unknown as HTMLElement
  }

  handler({
    target: overCellIndex('4'),
    clientX: 10,
    clientY: 10,
  } as unknown as PointerEvent)

  // Keyboard navigation scrolled the grid: a different cell slides under
  // the stationary pointer — same coordinates, so it must not reselect.
  handler({
    target: overCellIndex('9'),
    clientX: 10,
    clientY: 10,
  } as unknown as PointerEvent)

  // A real move to that same cell does select it.
  handler({
    target: overCellIndex('9'),
    clientX: 12,
    clientY: 10,
  } as unknown as PointerEvent)

  assert.deepEqual(selected, [4, 9])
})

test('createWindowKeydownHandler closes open dialogs on Escape only', () => {
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

test('createWindowKeydownHandler answers the replay confirm with Escape and Enter only', () => {
  const state: MutableViewState = {
    mode: 'game',
    showReferenceDialog: false,
    showReplayConfirm: true,
  }
  let closes = 0
  let plays = 0
  let prevented = 0
  let gameCalls = 0
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      throw new Error('should not close reference dialog')
    },
    closeReplayConfirm: () => {
      closes += 1
    },
    playReplay: () => {
      plays += 1
    },
    canHandleGameAction: () => true,
    markGameActionHandled: () => {
      throw new Error('confirm keys should not mark game action handled')
    },
    handleMenuEvent: () => {
      throw new Error('confirm swallows menu keys')
    },
    handleGameEvent: () => {
      gameCalls += 1
      return true
    },
  })

  // Escape cancels the ask; Enter commits to playback; anything else is
  // swallowed — no game input leaks under the modal.
  handler({
    key: 'Escape',
    preventDefault: () => {
      prevented += 1
    },
  } as KeyboardEvent)
  handler({
    key: 'ArrowRight',
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

  assert.equal(closes, 2)
  assert.equal(plays, 1)
  assert.equal(prevented, 2)
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

test('createWindowKeydownHandler routes menu-mode keys to the menu handler', () => {
  const state: MutableViewState = { mode: 'menu', showReferenceDialog: false }
  let menuCalls = 0
  let marks = 0
  let prevented = 0
  const handler = createWindowKeydownHandler({
    viewState: createViewState(state),
    closeReferenceDialog: () => {
      throw new Error('should not close dialog on menu')
    },
    canHandleGameAction: () => true,
    markGameActionHandled: () => {
      marks += 1
    },
    handleMenuEvent: () => {
      menuCalls += 1
      return menuCalls === 1
    },
    handleGameEvent: () => {
      throw new Error('menu path should not route to game')
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

  assert.equal(menuCalls, 2)
  assert.equal(marks, 1)
  assert.equal(prevented, 1)
})
