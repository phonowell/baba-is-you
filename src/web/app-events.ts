import type { GameCommand } from '../view/input.js'

type AppEventViewState = {
  getMode: () => 'menu' | 'game'
  isReferenceDialogOpen: () => boolean
  isReplayConfirmOpen: () => boolean
}

// HUD buttons and the outcome overlay share the keyboard command pipeline:
// a click produces the same GameCommand a keypress would.
const GAME_ACTION_COMMANDS: Record<string, GameCommand> = {
  'game-undo': { type: 'undo' },
  'game-wait': { type: 'wait' },
  'game-restart': { type: 'restart' },
  'game-menu': { type: 'back' },
  'game-next': { type: 'next' },
}

type RootClickHandlerContext = {
  viewState: AppEventViewState
  toggleReferenceDialog: () => void
  closeReferenceDialog: () => void
  // The Solution button's confirmation modal: `play-replay` opens it,
  // `confirm-replay` commits (close + play), `cancel-replay` and the
  // backdrop dismiss it.
  openReplayConfirm?: () => void
  closeReplayConfirm?: () => void
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleGameCommand: (cmd: GameCommand) => boolean
  // Menu rows carry their own index — the click enters that level
  // directly instead of going through selection state first.
  enterLevel: (index: number) => void
  // Golden playback start: a UI action, not a game command — it stays
  // available while a replay owns the board so the button doubles as
  // "watch it again".
  playReplay?: () => void
}

export const createRootClickHandler = (
  context: RootClickHandlerContext,
): ((event: MouseEvent) => void) => {
  const {
    viewState,
    toggleReferenceDialog,
    closeReferenceDialog,
    openReplayConfirm,
    closeReplayConfirm,
    canHandleGameAction,
    markGameActionHandled,
    handleGameCommand,
    enterLevel,
    playReplay,
  } = context

  return (event: MouseEvent): void => {
    const mode = viewState.getMode()
    const showReferenceDialog = viewState.isReferenceDialogOpen()
    const showReplayConfirm = viewState.isReplayConfirmOpen()
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const actionElement = target.closest<HTMLElement>('[data-action]')
    if (actionElement) {
      const action = actionElement.dataset.action
      if (action === 'toggle-reference') {
        toggleReferenceDialog()
        return
      }

      if (action === 'close-reference') {
        closeReferenceDialog()
        return
      }

      // Playback rebuilds the board from the golden — the button asks
      // first; only the dialog's own confirm runs the replay.
      if (action === 'play-replay') {
        openReplayConfirm?.()
        return
      }

      if (action === 'confirm-replay') {
        closeReplayConfirm?.()
        playReplay?.()
        return
      }

      if (action === 'cancel-replay') {
        closeReplayConfirm?.()
        return
      }

      if (action === 'start-level' && mode === 'menu') {
        const index = Number(actionElement.dataset.levelIndex)
        if (Number.isInteger(index)) enterLevel(index)
        return
      }

      if (!showReferenceDialog && !showReplayConfirm && action) {
        const cmd = GAME_ACTION_COMMANDS[action]
        if (cmd && canHandleGameAction() && handleGameCommand(cmd)) {
          markGameActionHandled()
        }
      }

      return
    }

    if (showReplayConfirm) {
      const backdrop = target.closest<HTMLElement>(
        '[data-role="replay-confirm-backdrop"]',
      )
      const dialog = target.closest<HTMLElement>(
        '[data-role="replay-confirm-dialog"]',
      )
      if (backdrop && !dialog) closeReplayConfirm?.()
      return
    }

    if (!showReferenceDialog) return

    const backdrop = target.closest<HTMLElement>('[data-role="reference-backdrop"]')
    const dialog = target.closest<HTMLElement>('[data-role="reference-dialog"]')
    if (backdrop && !dialog) {
      closeReferenceDialog()
    }
  }
}

type MenuHoverHandlerContext = {
  viewState: AppEventViewState
  // Hover moves the highlight (and the preview with it) but never starts
  // a level — entering still needs a click or Enter.
  selectLevel: (index: number) => void
}

// Grid cells preview on hover: the pointer lands on a cell, its level
// paints on the right — browsing the board without committing to it.
export const createMenuHoverHandler = (
  context: MenuHoverHandlerContext,
): ((event: PointerEvent) => void) => {
  const { viewState, selectLevel } = context
  // Keyboard/gamepad navigation scrolls the grid under a stationary
  // pointer, which fires pointerover on whatever cell slides beneath it —
  // with unchanged client coordinates. Only a real pointer move may steal
  // the selection, so the last seen position gates every event.
  let lastX = Number.NaN
  let lastY = Number.NaN

  return (event: PointerEvent): void => {
    if (viewState.getMode() !== 'menu') return
    if (event.clientX === lastX && event.clientY === lastY) return
    lastX = event.clientX
    lastY = event.clientY

    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const cell = target.closest<HTMLElement>('.menu-cell[data-level-index]')
    const index = Number(cell?.dataset.levelIndex)
    if (cell && Number.isInteger(index)) selectLevel(index)
  }
}

type WindowKeydownHandlerContext = {
  viewState: AppEventViewState
  closeReferenceDialog: () => void
  // Replay confirm modal keys: Escape cancels, Enter commits — the same
  // pair the dialog's own buttons fire.
  closeReplayConfirm?: () => void
  playReplay?: () => void
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleMenuEvent: (event: KeyboardEvent) => boolean
  handleGameEvent: (event: KeyboardEvent) => boolean
}

export const createWindowKeydownHandler = (
  context: WindowKeydownHandlerContext,
): ((event: KeyboardEvent) => void) => {
  const {
    viewState,
    closeReferenceDialog,
    closeReplayConfirm,
    playReplay,
    canHandleGameAction,
    markGameActionHandled,
    handleMenuEvent,
    handleGameEvent,
  } = context

  return (event: KeyboardEvent): void => {
    const mode = viewState.getMode()

    if (viewState.isReplayConfirmOpen()) {
      if (event.key === 'Escape') {
        closeReplayConfirm?.()
        event.preventDefault()
      } else if (event.key === 'Enter') {
        closeReplayConfirm?.()
        playReplay?.()
        event.preventDefault()
      }
      return
    }

    if (viewState.isReferenceDialogOpen()) {
      if (event.key === 'Escape') {
        closeReferenceDialog()
        event.preventDefault()
      }
      return
    }

    if (!canHandleGameAction()) return

    const handled =
      mode === 'menu' ? handleMenuEvent(event) : handleGameEvent(event)

    if (!handled) return

    event.preventDefault()
    markGameActionHandled()
  }
}
