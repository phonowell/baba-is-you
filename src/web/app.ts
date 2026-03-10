import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { createDraw } from './app-draw.js'
import { createWebAppController } from './app-controller.js'
import { createRootClickHandler, createWindowKeydownHandler } from './app-events.js'
import { registerAppLifecycle } from './app-lifecycle.js'
import { createWebAppStore } from './app-store.js'
import { applyWithTransition, computeCellSizeForState } from './app-view-helpers.js'
import { createBoard3dRendererFactoryDeps } from './board-3d-renderer-factory.js'
import { createBoard3dRendererRuntime } from './board-3d-renderer-runtime.js'
import type { DrawState } from './app-draw.js'
import type { Board3dRendererRuntime } from './board-3d-renderer-runtime.js'

const APP_DISPOSE_KEY = '__baba_is_you_web_dispose__'

type AppGlobal = typeof globalThis & {
  __baba_is_you_web_dispose__?: () => void
}

const levelData = levels.map((level) => parseLevel(level))
if (!levelData[0]) throw new Error('No levels available.')

const menuLevels = levelData.map((level) => ({ title: level.title }))
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const root = globalThis.document.getElementById('app')
if (!root) throw new Error('Missing #app container.')

const appGlobal = globalThis as AppGlobal
appGlobal[APP_DISPOSE_KEY]?.()

const appStore = createWebAppStore({ levels: levelData })
const appController = createWebAppController({
  store: appStore,
})

const drawState: DrawState = {
  prevMode: null,
  prevShowDialog: false,
  prevBoardSignature: null,
  gameView: null,
}
let board3dRenderer: Board3dRendererRuntime | null = null

const ensureBoard3dRenderer = (): Board3dRendererRuntime => {
  if (!board3dRenderer) {
    board3dRenderer = createBoard3dRendererRuntime(
      createBoard3dRendererFactoryDeps(),
    )
  }
  return board3dRenderer
}

const draw = createDraw({
  root,
  menuLevels,
  drawState,
  getSnapshot: appController.getViewState,
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

const handleRootClick = createRootClickHandler({
  levelCount: levelData.length,
  viewState: appController,
  enterGame: appController.enterGame,
  toggleReferenceDialog: appController.toggleReferenceDialog,
  closeReferenceDialog: appController.closeReferenceDialog,
})

const handleWindowKeydown = createWindowKeydownHandler({
  viewState: appController,
  closeReferenceDialog: appController.closeReferenceDialog,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleMenuEvent: appController.handleMenuKeyboardEvent,
  handleGameEvent: appController.handleGameKeyboardEvent,
})

const unsubscribeDraw = appStore.subscribe(draw)

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
    unsubscribeDraw()
    delete appGlobal[APP_DISPOSE_KEY]
  },
})
appGlobal[APP_DISPOSE_KEY] = disposeApp

draw()
