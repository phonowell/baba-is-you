import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { createInitialState, markCampaignComplete } from '../logic/state.js'
import { step } from '../logic/step.js'
import { mapGameKeyboardEvent, mapMenuKeyboardEvent } from '../view/input-web.js'
import { MENU_WINDOW_SIZE } from '../view/render-menu.js'
import { runGameCommand, runMenuCommand } from './app-commands.js'
import { createDraw } from './app-draw.js'
import { createRootClickHandler, createWindowKeydownHandler } from './app-events.js'
import { registerAppLifecycle } from './app-lifecycle.js'
import { applyWithTransition, computeCellSizeForState } from './app-view-helpers.js'
import { createBoard3dRenderer } from './board-3d.js'

import type { GameState } from '../logic/types.js'
import type { DrawRefs } from './app-draw.js'

type AppMode = 'menu' | 'game'
const GAME_INPUT_COOLDOWN_MS = 100
const APP_DISPOSE_KEY = '__baba_is_you_web_dispose__'

type AppGlobal = typeof globalThis & {
  __baba_is_you_web_dispose__?: () => void
}

const levelData = levels.map((level) => parseLevel(level))
const firstLevel = levelData[0]
if (!firstLevel) throw new Error('No levels available.')

const menuLevels = levelData.map((level) => ({ title: level.title }))
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const root = globalThis.document.getElementById('app')
if (!root) throw new Error('Missing #app container.')

const appGlobal = globalThis as AppGlobal
appGlobal[APP_DISPOSE_KEY]?.()

const firstLevelIndex = 0
const latestLevelIndex = levelData.length - 1

let mode: AppMode = 'menu'
let menuSelectedLevelIndex = firstLevelIndex
let levelIndex = firstLevelIndex
let history: GameState[] = []
let state = createInitialState(levelData[levelIndex] ?? firstLevel, levelIndex)
let showReferenceDialog = false
let lastGameActionMs = 0

const drawRefs: DrawRefs = {
  prevMode: null,
  prevShowDialog: false,
  prevBoardSignature: null,
  boardEl: null,
  statusEl: null,
}
let board3dRenderer: ReturnType<typeof createBoard3dRenderer> | null = null

const ensureBoard3dRenderer = (): ReturnType<typeof createBoard3dRenderer> => {
  if (!board3dRenderer) board3dRenderer = createBoard3dRenderer()
  return board3dRenderer
}

const closeReferenceDialog = (): void => {
  showReferenceDialog = false
}

const resetLevel = (index: number): void => {
  const nextLevel = levelData[index]
  if (!nextLevel) throw new Error(`Invalid level index: ${index}`)

  levelIndex = index
  history = []
  closeReferenceDialog()
  state = createInitialState(nextLevel, levelIndex)
}

const enterGame = (index: number): void => {
  resetLevel(index)
  mode = 'game'
}

const returnToMenu = (): void => {
  menuSelectedLevelIndex = levelIndex
  history = []
  closeReferenceDialog()
  board3dRenderer?.unmount()
  mode = 'menu'
}

const draw = createDraw({
  root,
  menuLevels,
  refs: drawRefs,
  getMode: () => mode,
  getLevelIndex: () => levelIndex,
  getState: () => state,
  getShowReferenceDialog: () => showReferenceDialog,
  getMenuSelectedLevelIndex: () => menuSelectedLevelIndex,
  computeCellSize: (boardState) => computeCellSizeForState(boardState),
  applyWithTransition: (fn) => applyWithTransition(reducedMotionQuery, fn),
  unmountBoard3d: () => {
    board3dRenderer?.unmount()
  },
  mountAndSyncBoard3d: (board, boardState) => {
    const renderer = ensureBoard3dRenderer()
    renderer.mount(board)
    renderer.sync(boardState)
  },
})

const handleMove = (direction: Parameters<typeof step>[1]): boolean => {
  if (state.status !== 'playing') return false

  const result = step(state, direction)
  if (!result.changed) return false

  history.push(state)
  state = result.state
  return true
}

const handleGameCommand = (cmd: ReturnType<typeof mapGameKeyboardEvent>): boolean =>
  runGameCommand(cmd, {
    status: state.status,
    levelIndex,
    levelCount: levelData.length,
    canUndo: history.length > 0,
    move: handleMove,
    undo: () => {
      state = history.pop() ?? state
    },
    resetLevel,
    markCampaignComplete: () => {
      state = markCampaignComplete(state)
    },
    returnToMenu,
  })

const handleMenuCommand = (cmd: ReturnType<typeof mapMenuKeyboardEvent>): boolean =>
  runMenuCommand(cmd, {
    selectedLevelIndex: menuSelectedLevelIndex,
    latestLevelIndex,
    pageSize: MENU_WINDOW_SIZE,
    setSelectedLevelIndex: (index) => {
      menuSelectedLevelIndex = index
    },
    enterGame,
  })

const handleRootClick = createRootClickHandler({
  levelCount: levelData.length,
  getMode: () => mode,
  getShowReferenceDialog: () => showReferenceDialog,
  setMenuSelectedLevelIndex: (index) => {
    menuSelectedLevelIndex = index
  },
  enterGame,
  toggleReferenceDialog: () => {
    showReferenceDialog = !showReferenceDialog
  },
  closeReferenceDialog,
  draw,
})

const handleWindowKeydown = createWindowKeydownHandler({
  getMode: () => mode,
  getShowReferenceDialog: () => showReferenceDialog,
  closeReferenceDialog,
  canHandleGameAction: () =>
    Date.now() - lastGameActionMs >= GAME_INPUT_COOLDOWN_MS,
  markGameActionHandled: () => {
    lastGameActionMs = Date.now()
  },
  handleMenuEvent: (event) => handleMenuCommand(mapMenuKeyboardEvent(event)),
  handleGameEvent: (event) => handleGameCommand(mapGameKeyboardEvent(event)),
  draw,
})

const disposeApp = registerAppLifecycle({
  root,
  handleRootClick,
  handleWindowKeydown,
  draw,
  disposeBoard3d: () => {
    board3dRenderer?.dispose()
    board3dRenderer = null
  },
  onDispose: () => {
    delete appGlobal[APP_DISPOSE_KEY]
  },
})
appGlobal[APP_DISPOSE_KEY] = disposeApp

draw()
