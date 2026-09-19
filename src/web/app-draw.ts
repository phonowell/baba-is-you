import { createGameView } from './app-game-view.js'

import type { GameState } from '../logic/types.js'
import type { AppMode, WebAppSnapshot } from './app-model.js'

export type DrawState = {
  prevMode: AppMode | null
  prevShowDialog: boolean
  prevBoardSignature: string | null
  prevCellSize: number | null
  gameView: ReturnType<typeof createGameView> | null
}

type CreateDrawOptions = {
  root: HTMLElement
  drawState: DrawState
  getSnapshot: () => WebAppSnapshot
  // Asked once per board build: the Replay button only renders when the
  // level on screen has a recorded golden.
  hasGoldenReplay?: () => boolean
  computeCellSize: (state: GameState) => number
  applyWithTransition: (fn: () => void) => void
  unmountBoard3d: () => void
  mountAndSyncBoard3d: (board: HTMLElement, state: GameState) => void
}

export const createDraw = (options: CreateDrawOptions): (() => void) => {
  const {
    root,
    drawState,
    getSnapshot,
    hasGoldenReplay = () => false,
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
      mapFile,
      state,
      showReferenceDialog,
      replay,
      canUndo,
    } = snapshot
    const viewUpdate = { showReferenceDialog, replay, canUndo }

    document.title =
      mode === 'game'
        ? `${levelIndex + 1}. ${state.title} – Baba Is You`
        : 'Baba Is You'
    document.body.classList.add('game-3d-fullscreen')

    const cellSize = computeCellSize(state)
    if (cellSize !== drawState.prevCellSize) {
      drawState.prevCellSize = cellSize
      document.documentElement.style.setProperty('--cell-size', `${cellSize}px`)
    }

    const modeChanged = mode !== drawState.prevMode
    // Entering/leaving a node rebuilds the board even inside the same mode
    // (map → child map keeps mode 'map'; level → next level keeps 'game').
    const boardKey = mode === 'map' ? mapFile : `${levelIndex}`
    const nextBoardSignature = `${mode}:${boardKey}:${state.width}x${state.height}`
    const boardChanged = nextBoardSignature !== drawState.prevBoardSignature
    drawState.prevMode = mode
    drawState.prevShowDialog = showReferenceDialog
    drawState.prevBoardSignature = nextBoardSignature

    if (modeChanged || boardChanged) {
      unmountBoard3d()
      applyWithTransition(() => {
        root.replaceChildren()
        const gameView = createGameView({
          document: root.ownerDocument,
          mode,
          hasGoldenReplay: hasGoldenReplay(),
        })
        gameView.update(state, viewUpdate)
        root.append(gameView.root)
        drawState.gameView = gameView
        mountAndSyncBoard3d(gameView.boardEl, state)
      })
      return
    }

    if (drawState.gameView) {
      drawState.gameView.update(state, viewUpdate)
      mountAndSyncBoard3d(drawState.gameView.boardEl, state)
    }
  }
}
