type AppEventViewState = {
  getMode: () => 'menu' | 'game'
  isReferenceDialogOpen: () => boolean
}

type RootClickHandlerContext = {
  levelCount: number
  viewState: AppEventViewState
  enterGame: (index: number) => void
  toggleReferenceDialog: () => void
  closeReferenceDialog: () => void
}

export const createRootClickHandler = (
  context: RootClickHandlerContext,
): ((event: MouseEvent) => void) => {
  const {
    levelCount,
    viewState,
    enterGame,
    toggleReferenceDialog,
    closeReferenceDialog,
  } = context

  return (event: MouseEvent): void => {
    const mode = viewState.getMode()
    const showReferenceDialog = viewState.isReferenceDialogOpen()
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const actionElement = target.closest<HTMLElement>('[data-action]')
    if (actionElement) {
      const action = actionElement.dataset.action
      if (action === 'start-level' && mode === 'menu') {
        const idx = parseInt(actionElement.dataset.levelIndex ?? '', 10)
        if (!isNaN(idx) && idx >= 0 && idx < levelCount) {
          enterGame(idx)
        }
        return
      }

      if (action === 'toggle-reference' && mode === 'game') {
        toggleReferenceDialog()
        return
      }

      if (action === 'close-reference' && mode === 'game') {
        closeReferenceDialog()
      }

      return
    }

    if (!showReferenceDialog || mode !== 'game') return

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
    const showReferenceDialog = viewState.isReferenceDialogOpen()

    if (mode === 'game' && showReferenceDialog) {
      if (event.key === 'Escape') {
        closeReferenceDialog()
        event.preventDefault()
      }
      return
    }

    if (mode === 'game' && !canHandleGameAction()) return

    const handled = mode === 'menu' ? handleMenuEvent(event) : handleGameEvent(event)

    if (!handled) return

    event.preventDefault()
    if (mode === 'game') markGameActionHandled()
  }
}
