import { mapGameKeyboardEvent, mapMenuKeyboardEvent } from '../view/input-web.js'
import {
  mapGameCommandToAction,
  mapMenuCommandToAction,
} from './app-commands.js'

import type { WebAppAction, WebAppSnapshot } from './app-model.js'
import type { createWebAppStore } from './app-store.js'

const GAME_INPUT_COOLDOWN_MS = 100

type WebAppStore = ReturnType<typeof createWebAppStore>

type CreateWebAppControllerOptions = {
  store: WebAppStore
}

export const createWebAppController = (
  options: CreateWebAppControllerOptions,
) => {
  const { store } = options

  const dispatch = (action: WebAppAction): void => {
    store.dispatch(action)
  }

  const getMode = (): WebAppSnapshot['mode'] => store.getState().mode

  const isReferenceDialogOpen = (): boolean =>
    store.getState().showReferenceDialog

  const getViewState = (): WebAppSnapshot => store.snapshot()

  const canHandleGameAction = (): boolean =>
    Date.now() - store.getState().lastGameActionMs >= GAME_INPUT_COOLDOWN_MS

  const markGameActionHandled = (): void => {
    dispatch({ type: 'mark-game-action-handled', nowMs: Date.now() })
  }

  const handleGameCommand = (
    cmd: ReturnType<typeof mapGameKeyboardEvent>,
  ): boolean => {
    const before = store.getState()
    if (before.mode !== 'game') return false
    const action = mapGameCommandToAction(cmd, before)
    if (!action) return false
    dispatch(action)
    return store.getState() !== before
  }

  const handleMenuCommand = (
    cmd: ReturnType<typeof mapMenuKeyboardEvent>,
  ): boolean => {
    const before = store.getState()
    if (before.mode !== 'menu') return false
    const action = mapMenuCommandToAction(cmd, before)
    if (!action) return false
    dispatch(action)
    return store.getState() !== before
  }

  return {
    dispatch,
    getState: store.getState,
    getMode,
    isReferenceDialogOpen,
    getViewState,
    canHandleGameAction,
    markGameActionHandled,
    closeReferenceDialog: (): void =>
      dispatch({ type: 'close-reference-dialog' }),
    enterGame: (index: number): void => dispatch({ type: 'enter-game', index }),
    handleGameCommand,
    handleGameKeyboardEvent: (event: KeyboardEvent): boolean =>
      handleGameCommand(mapGameKeyboardEvent(event)),
    handleMenuCommand,
    handleMenuKeyboardEvent: (event: KeyboardEvent): boolean =>
      handleMenuCommand(mapMenuKeyboardEvent(event)),
    setMenuSelectedLevelIndex: (index: number): void =>
      dispatch({ type: 'select-menu-level', index }),
    toggleReferenceDialog: (): void =>
      dispatch({ type: 'toggle-reference-dialog' }),
  }
}
