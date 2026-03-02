type AppMode = 'menu' | 'game'

type RootClickHandlerContext = {
  levelCount: number
  getMode: () => AppMode
  getShowReferenceDialog: () => boolean
  setMenuSelectedLevelIndex: (index: number) => void
  enterGame: (index: number) => void
  toggleReferenceDialog: () => void
  closeReferenceDialog: () => void
  draw: () => void
}

export const createRootClickHandler = (
  context: RootClickHandlerContext,
): ((event: MouseEvent) => void) => {
  const {
    levelCount,
    getMode,
    getShowReferenceDialog,
    setMenuSelectedLevelIndex,
    enterGame,
    toggleReferenceDialog,
    closeReferenceDialog,
    draw,
  } = context

  return (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const actionElement = target.closest<HTMLElement>('[data-action]')
    if (actionElement) {
      const action = actionElement.dataset.action
      if (action === 'start-level' && getMode() === 'menu') {
        const idx = parseInt(actionElement.dataset.levelIndex ?? '', 10)
        if (!isNaN(idx) && idx >= 0 && idx < levelCount) {
          setMenuSelectedLevelIndex(idx)
          enterGame(idx)
          draw()
        }
        return
      }

      if (action === 'toggle-reference' && getMode() === 'game') {
        toggleReferenceDialog()
        draw()
        return
      }

      if (action === 'close-reference' && getMode() === 'game') {
        closeReferenceDialog()
        draw()
      }

      return
    }

    if (!getShowReferenceDialog() || getMode() !== 'game') return

    const backdrop = target.closest<HTMLElement>('[data-role="reference-backdrop"]')
    const dialog = target.closest<HTMLElement>('[data-role="reference-dialog"]')
    if (backdrop && !dialog) {
      closeReferenceDialog()
      draw()
    }
  }
}

type WindowKeydownHandlerContext = {
  getMode: () => AppMode
  getShowReferenceDialog: () => boolean
  closeReferenceDialog: () => void
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleMenuEvent: (event: KeyboardEvent) => boolean
  handleGameEvent: (event: KeyboardEvent) => boolean
  draw: () => void
}

export const createWindowKeydownHandler = (
  context: WindowKeydownHandlerContext,
): ((event: KeyboardEvent) => void) => {
  const {
    getMode,
    getShowReferenceDialog,
    closeReferenceDialog,
    canHandleGameAction,
    markGameActionHandled,
    handleMenuEvent,
    handleGameEvent,
    draw,
  } = context

  return (event: KeyboardEvent): void => {
    if (getMode() === 'game' && getShowReferenceDialog()) {
      if (event.key === 'Escape') {
        closeReferenceDialog()
        event.preventDefault()
        draw()
      }
      return
    }

    if (getMode() === 'game' && !canHandleGameAction()) return

    const handled = getMode() === 'menu' ? handleMenuEvent(event) : handleGameEvent(event)

    if (!handled) return

    event.preventDefault()
    if (getMode() === 'game') markGameActionHandled()
    draw()
  }
}
