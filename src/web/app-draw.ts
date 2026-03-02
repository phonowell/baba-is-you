import { renderHtml } from '../view/render-html.js'
import { renderMenuHtml } from '../view/render-menu-html.js'
import { statusLine } from '../view/status-line.js'

import type { GameState } from '../logic/types.js'

export type AppMode = 'menu' | 'game'

export type DrawRefs = {
  prevMode: AppMode | null
  prevShowDialog: boolean
  prevBoardSignature: string | null
  boardEl: HTMLElement | null
  statusEl: HTMLElement | null
}

type CreateDrawOptions = {
  root: HTMLElement
  menuLevels: Array<{ title: string }>
  refs: DrawRefs
  getMode: () => AppMode
  getLevelIndex: () => number
  getState: () => GameState
  getShowReferenceDialog: () => boolean
  getMenuSelectedLevelIndex: () => number
  computeCellSize: (state: GameState) => number
  applyWithTransition: (fn: () => void) => void
  unmountBoard3d: () => void
  mountAndSyncBoard3d: (board: HTMLElement, state: GameState) => void
}

export const createDraw = (options: CreateDrawOptions): (() => void) => {
  const {
    root,
    menuLevels,
    refs,
    getMode,
    getLevelIndex,
    getState,
    getShowReferenceDialog,
    getMenuSelectedLevelIndex,
    computeCellSize,
    applyWithTransition,
    unmountBoard3d,
    mountAndSyncBoard3d,
  } = options

  return (): void => {
    const mode = getMode()
    const levelIndex = getLevelIndex()
    const state = getState()
    const showReferenceDialog = getShowReferenceDialog()

    document.title =
      mode === 'game' ? `${levelIndex + 1}. ${state.title} – Baba Is You` : 'Baba Is You'
    document.body.classList.toggle('game-3d-fullscreen', mode === 'game')

    if (mode === 'game') {
      document.documentElement.style.setProperty('--cell-size', `${computeCellSize(state)}px`)
    }

    const modeChanged = mode !== refs.prevMode
    const dialogChanged = showReferenceDialog !== refs.prevShowDialog
    const nextBoardSignature =
      mode === 'game' ? `${levelIndex}:${state.width}x${state.height}` : null
    const boardChanged = nextBoardSignature !== refs.prevBoardSignature
    refs.prevMode = mode
    refs.prevShowDialog = showReferenceDialog
    refs.prevBoardSignature = nextBoardSignature

    if (modeChanged || dialogChanged || mode === 'menu' || boardChanged) {
      if (mode !== 'game' || modeChanged || boardChanged) unmountBoard3d()

      const html =
        mode === 'menu'
          ? renderMenuHtml({
              levels: menuLevels,
              selectedLevelIndex: getMenuSelectedLevelIndex(),
            })
          : renderHtml(state, { showReferenceDialog })

      applyWithTransition(() => {
        root.innerHTML = html
        refs.boardEl = root.querySelector<HTMLElement>('.board')
        refs.statusEl = root.querySelector<HTMLElement>('.status')
        if (mode === 'game' && refs.boardEl) {
          mountAndSyncBoard3d(refs.boardEl, state)
        }
      })
      return
    }

    if (mode === 'game' && refs.boardEl) {
      mountAndSyncBoard3d(refs.boardEl, state)
    }
    if (refs.statusEl) refs.statusEl.textContent = statusLine(state.status)
  }
}
