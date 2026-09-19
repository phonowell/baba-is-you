import type { GameCommand } from '../view/input.js'

type AppEventViewState = {
  getMode: () => 'menu' | 'game'
  isReferenceDialogOpen: () => boolean
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
    canHandleGameAction,
    markGameActionHandled,
    handleGameCommand,
    enterLevel,
    playReplay,
  } = context

  return (event: MouseEvent): void => {
    const mode = viewState.getMode()
    const showReferenceDialog = viewState.isReferenceDialogOpen()
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

      if (action === 'play-replay') {
        playReplay?.()
        return
      }

      if (action === 'start-level' && mode === 'menu') {
        const index = Number(actionElement.dataset.levelIndex)
        if (Number.isInteger(index)) enterLevel(index)
        return
      }

      if (!showReferenceDialog && action) {
        const cmd = GAME_ACTION_COMMANDS[action]
        if (cmd && canHandleGameAction() && handleGameCommand(cmd)) {
          markGameActionHandled()
        }
      }

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

type WindowKeydownHandlerContext = {
  viewState: AppEventViewState
  closeReferenceDialog: () => void
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
    canHandleGameAction,
    markGameActionHandled,
    handleMenuEvent,
    handleGameEvent,
  } = context

  return (event: KeyboardEvent): void => {
    const mode = viewState.getMode()

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
