import {
  menuPositionHtml,
  menuWindowRange,
  renderMenuHtml,
} from '../view/render-menu-html.js'
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
  menuLevels: Array<{ title: string }>
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
    menuLevels,
    drawState,
    getSnapshot,
    hasGoldenReplay = () => false,
    computeCellSize,
    applyWithTransition,
    unmountBoard3d,
    mountAndSyncBoard3d,
  } = options

  // Same-window selection moves flip row classes and the position readout
  // in place instead of rebuilding the list — full innerHTML re-renders
  // would restart the row entrance cascade and the marker's idle wiggle
  // on every keypress.
  const updateMenuInPlace = (
    container: HTMLElement,
    selected: number,
  ): boolean => {
    if (typeof container.querySelectorAll !== 'function') return false
    const rows = container.querySelectorAll<HTMLElement>(
      '.menu-row[data-level-index]',
    )
    const positionEl = container.querySelector<HTMLElement>('.menu-position')
    if (rows.length === 0 || !positionEl) return false

    // Same clamp renderMenuHtml applies, so both paths agree on the index.
    const clamped = Math.min(
      Math.max(selected, 0),
      Math.max(0, menuLevels.length - 1),
    )
    const [start, end] = menuWindowRange(menuLevels.length, clamped)
    const firstIndex = Number(rows[0]?.dataset.levelIndex)
    const lastIndex = Number(rows[rows.length - 1]?.dataset.levelIndex)
    if (
      rows.length !== end - start ||
      firstIndex !== start ||
      lastIndex !== end - 1
    ) {
      return false
    }

    for (const row of Array.from(rows)) {
      const isSelected = Number(row.dataset.levelIndex) === clamped
      row.classList.toggle('selected', isSelected)
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false')
      const marker = row.querySelector('.marker')
      if (marker) marker.innerHTML = isSelected ? '&#9670;' : '&nbsp;'
    }
    positionEl.innerHTML = menuPositionHtml(menuLevels, clamped)
    return true
  }

  return (): void => {
    const snapshot = getSnapshot()
    const {
      mode,
      menuSelectedLevelIndex,
      levelIndex,
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
    document.body.classList.toggle('game-3d-fullscreen', mode === 'game')

    if (mode === 'game') {
      const cellSize = computeCellSize(state)
      if (cellSize !== drawState.prevCellSize) {
        drawState.prevCellSize = cellSize
        document.documentElement.style.setProperty(
          '--cell-size',
          `${cellSize}px`,
        )
      }
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
        if (mode === 'menu') {
          if (
            !modeChanged &&
            updateMenuInPlace(root, menuSelectedLevelIndex)
          ) {
            drawState.gameView = null
            return
          }
          root.innerHTML = renderMenuHtml({
            levels: menuLevels,
            selectedLevelIndex: menuSelectedLevelIndex,
            animateEntrance: modeChanged,
          })
          drawState.gameView = null
          return
        }

        root.replaceChildren()
        const gameView = createGameView({
          document: root.ownerDocument,
          hasGoldenReplay: hasGoldenReplay(),
        })
        gameView.update(state, viewUpdate)
        root.append(gameView.root)
        drawState.gameView = gameView
        mountAndSyncBoard3d(gameView.boardEl, state)
      })
      return
    }

    if (mode === 'game' && drawState.gameView) {
      drawState.gameView.update(state, viewUpdate)
      mountAndSyncBoard3d(drawState.gameView.boardEl, state)
    }
  }
}
