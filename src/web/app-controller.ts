import { mapGameKeyboardEvent, mapMenuKeyboardEvent } from '../view/input-web.js'
import { mapGameCommandToAction } from './app-commands.js'

import type { WebAppAction, WebAppSnapshot } from './app-model.js'
import type { createWebAppStore } from './app-store.js'
import type { LevelData } from '../logic/types.js'

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

  const isReplayConfirmOpen = (): boolean =>
    store.getState().showReplayConfirm

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
    const action = mapGameCommandToAction(cmd, before)
    if (!action) return false
    dispatch(action)
    return store.getState() !== before
  }

  return {
    dispatch,
    getState: store.getState,
    getMode,
    isReferenceDialogOpen,
    isReplayConfirmOpen,
    getViewState,
    canHandleGameAction,
    markGameActionHandled,
    closeReferenceDialog: (): void =>
      dispatch({ type: 'close-reference-dialog' }),
    openReplayConfirm: (): void =>
      dispatch({ type: 'open-replay-confirm' }),
    closeReplayConfirm: (): void =>
      dispatch({ type: 'close-replay-confirm' }),
    startReplay: (name: string, inputs: string, level: LevelData): void =>
      dispatch({ type: 'start-replay', name, inputs, level }),
    replayStep: (): void => dispatch({ type: 'replay-step' }),
    isReplaying: (): boolean => store.getState().replay !== null,
    handleGameCommand,
    handleGameKeyboardEvent: (event: KeyboardEvent): boolean =>
      handleGameCommand(mapGameKeyboardEvent(event)),
    handleMenuKeyboardEvent: (event: KeyboardEvent): boolean =>
      handleGameCommand(mapMenuKeyboardEvent(event)),
    enterLevel: (index: number): void =>
      dispatch({ type: 'enter-game', index }),
    toggleReferenceDialog: (): void =>
      dispatch({ type: 'toggle-reference-dialog' }),
  }
}
