import {
  menuPositionHtml,
  renderMenuHtml,
} from '../view/render-menu-html.js'
import { createGameView } from './app-game-view.js'

import type { GameState } from '../logic/types.js'
import type { MenuLevel } from '../view/render-menu-html.js'
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
  menuLevels: ReadonlyArray<MenuLevel>
  drawState: DrawState
  getSnapshot: () => WebAppSnapshot
  // Asked once per board build: the Replay button only renders when the
  // level on screen has a recorded golden.
  hasGoldenReplay?: () => boolean
  // A level's number as the menu shows it — the grid's display order,
  // not the campaign index. Defaults to campaign order (index + 1).
  levelMenuNumber?: (levelIndex: number) => number
  computeCellSize: (state: GameState) => number
  // Repaints the menu's level-preview canvas for the highlighted index —
  // injected because the sprite painter lives in the web layer.
  paintMenuPreview?: (canvas: HTMLCanvasElement, levelIndex: number) => void
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
    levelMenuNumber = (index) => index + 1,
    computeCellSize,
    paintMenuPreview,
    applyWithTransition,
    unmountBoard3d,
    mountAndSyncBoard3d,
  } = options

  // Selection moves flip the selected cell's classes, the position readout
  // and the preview's start-index in place — full innerHTML re-renders
  // would restart the entrance cascade and reset the grid's scroll. Every
  // cell is always in the DOM (the grid scrolls internally), so the only
  // fallback trigger is a missing piece of menu DOM.
  const updateMenuInPlace = (
    container: HTMLElement,
    selected: number,
  ): boolean => {
    if (typeof container.querySelector !== 'function') return false

    // Same clamp renderMenuHtml applies, so both paths agree on the index.
    const clamped = Math.min(
      Math.max(selected, 0),
      Math.max(0, menuLevels.length - 1),
    )
    const target = container.querySelector<HTMLElement>(
      `.menu-cell[data-level-index="${clamped}"]`,
    )
    const positionEl = container.querySelector<HTMLElement>('.menu-position')
    if (!target || !positionEl) return false

    const current = container.querySelector<HTMLElement>('.menu-cell.selected')
    if (current !== target) {
      current?.classList.remove('selected')
      current?.setAttribute('aria-selected', 'false')
      target.classList.add('selected')
      target.setAttribute('aria-selected', 'true')
    }
    // Arrow/Page keys can land the selection off-screen — keep it visible
    // with the smallest scroll that does so (jsdom-style fakes lack it).
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
    // The preview panel doubles as a start button — keep its level index
    // on the selection so a click enters the highlighted board.
    const preview = container.querySelector<HTMLElement>('.menu-preview')
    if (preview?.dataset) preview.dataset.levelIndex = String(clamped)
    positionEl.innerHTML = menuPositionHtml(menuLevels, clamped)
    return true
  }

  const revealSelectedCell = (
    container: HTMLElement,
    selected: number,
  ): void => {
    if (typeof container.querySelector !== 'function') return
    const cell = container.querySelector<HTMLElement>(
      `.menu-cell[data-level-index="${selected}"]`,
    )
    if (cell && typeof cell.scrollIntoView === 'function') {
      cell.scrollIntoView({ block: 'nearest' })
    }
  }

  const paintPreviewCanvas = (
    container: HTMLElement,
    levelIndex: number,
  ): void => {
    if (!paintMenuPreview || typeof container.querySelector !== 'function')
      return
    const canvas = container.querySelector<HTMLCanvasElement>(
      '.menu-preview-canvas',
    )
    if (canvas) paintMenuPreview(canvas, levelIndex)
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
        ? `${levelMenuNumber(levelIndex)}. ${state.title} – Baba Is You`
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
      // Selection moves patch a few classes and repaint one canvas — cheap
      // enough that wrapping them in a document view transition (a full-
      // page snapshot per keypress or hover) would be pure overhead.
      if (
        mode === 'menu' &&
        !modeChanged &&
        updateMenuInPlace(root, menuSelectedLevelIndex)
      ) {
        paintPreviewCanvas(root, menuSelectedLevelIndex)
        drawState.gameView = null
        return
      }

      if (mode !== 'game' || modeChanged || boardChanged) unmountBoard3d()

      applyWithTransition(() => {
        if (mode === 'menu') {
          root.innerHTML = renderMenuHtml({
            levels: menuLevels,
            selectedLevelIndex: menuSelectedLevelIndex,
            animateEntrance: modeChanged,
          })
          // A fresh grid mounts scrolled to the top — re-reveal the
          // selection (e.g. returning from a deep level).
          revealSelectedCell(root, menuSelectedLevelIndex)
          paintPreviewCanvas(root, menuSelectedLevelIndex)
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
