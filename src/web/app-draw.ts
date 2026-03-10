import { renderMenuHtml } from '../view/render-menu-html.js'
import { createGameView } from './app-game-view.js'

import type { GameState } from '../logic/types.js'
import type { AppMode, WebAppSnapshot } from './app-model.js'

export type DrawState = {
  prevMode: AppMode | null
  prevShowDialog: boolean
  prevBoardSignature: string | null
  gameView: ReturnType<typeof createGameView> | null
}

type CreateDrawOptions = {
  root: HTMLElement
  menuLevels: Array<{ title: string }>
  drawState: DrawState
  getSnapshot: () => WebAppSnapshot
  computeCellSize: (state: GameState) => number
  applyWithTransition: (fn: () => void) => void
  unmountBoard3d: () => void
  mountAndSyncBoard3d: (board: HTMLElement, state: GameState) => void
}

export const createDraw = (options: CreateDrawOptions): (() => void) => {
  const {
    root,
    menuLevels,
    drawState,
    getSnapshot,
    computeCellSize,
    applyWithTransition,
    unmountBoard3d,
    mountAndSyncBoard3d,
  } = options

  return (): void => {
    const snapshot = getSnapshot()
    const {
      mode,
      levelIndex,
      state,
      showReferenceDialog,
      menuSelectedLevelIndex,
    } = snapshot

    document.title =
      mode === 'game' ? `${levelIndex + 1}. ${state.title} – Baba Is You` : 'Baba Is You'
    document.body.classList.toggle('game-3d-fullscreen', mode === 'game')

    if (mode === 'game') {
      document.documentElement.style.setProperty('--cell-size', `${computeCellSize(state)}px`)
    }

    const modeChanged = mode !== drawState.prevMode
    const nextBoardSignature =
      mode === 'game' ? `${levelIndex}:${state.width}x${state.height}` : null
    const boardChanged = nextBoardSignature !== drawState.prevBoardSignature
    drawState.prevMode = mode
    drawState.prevShowDialog = showReferenceDialog
    drawState.prevBoardSignature = nextBoardSignature

    if (modeChanged || mode === 'menu' || boardChanged) {
      if (mode !== 'game' || modeChanged || boardChanged) unmountBoard3d()

      applyWithTransition(() => {
        root.replaceChildren()
        if (mode === 'menu') {
          root.innerHTML = renderMenuHtml({
            levels: menuLevels,
            selectedLevelIndex: menuSelectedLevelIndex,
          })
          drawState.gameView = null
          return
        }

        const gameView = createGameView({ document: root.ownerDocument })
        gameView.update(state, showReferenceDialog)
        root.append(gameView.root)
        drawState.gameView = gameView
      })
      if (mode === 'game' && drawState.gameView)
        mountAndSyncBoard3d(drawState.gameView.boardEl, state)
      return
    }

    if (mode === 'game' && drawState.gameView) {
      drawState.gameView.update(state, showReferenceDialog)
      mountAndSyncBoard3d(drawState.gameView.boardEl, state)
    }
  }
}
