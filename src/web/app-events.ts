import type { GameCommand } from '../view/input.js'

type AppEventViewState = {
  getMode: () => 'map' | 'game'
  isReferenceDialogOpen: () => boolean
}

// HUD buttons and the outcome overlay share the keyboard command pipeline:
// a click produces the same GameCommand a keypress would. On the map the
// wait slot is the enter press (icon under the cursor).
const GAME_ACTION_COMMANDS: Record<string, GameCommand> = {
  'game-undo': { type: 'undo' },
  'game-wait': { type: 'wait' },
  'game-restart': { type: 'restart' },
  'game-map': { type: 'back' },
  'game-next': { type: 'next' },
}

const MAP_ACTION_COMMANDS: Record<string, GameCommand> = {
  'game-undo': { type: 'undo' },
  'game-wait': { type: 'enter' },
  'game-restart': { type: 'restart' },
  'game-map': { type: 'back' },
}

type RootClickHandlerContext = {
  viewState: AppEventViewState
  toggleReferenceDialog: () => void
  closeReferenceDialog: () => void
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleGameCommand: (cmd: GameCommand) => boolean
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

      if (!showReferenceDialog && action) {
        const commands =
          mode === 'map' ? MAP_ACTION_COMMANDS : GAME_ACTION_COMMANDS
        const cmd = commands[action]
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
  handleMapEvent: (event: KeyboardEvent) => boolean
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
    handleMapEvent,
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

    const handled = mode === 'map' ? handleMapEvent(event) : handleGameEvent(event)

    if (!handled) return

    event.preventDefault()
    markGameActionHandled()
  }
}
