import { levels } from '../levels.js'
import { maps, rootMapFile } from '../levels-maps.js'
import { levelDataForMap } from '../logic/map-level.js'
import { parseLevel } from '../logic/parse-level.js'
import { createDraw } from './app-draw.js'
import { createWebAppController } from './app-controller.js'
import { createRootClickHandler, createWindowKeydownHandler } from './app-events.js'
import { createGamepadRuntime } from './app-gamepad.js'
import { createAppPointerHandlers } from './app-pointer.js'
import { registerAppLifecycle } from './app-lifecycle.js'
import { bindGoldensToLevels } from './app-golden-binding.js'
import { goldenReplays } from './app-goldens.js'
import { createReplayDriver } from './app-replay.js'
import { createWebAppStore } from './app-store.js'
import { applyWithTransition, computeCellSizeForState } from './app-view-helpers.js'
import { createBoard3dRendererFactoryDeps } from './board-3d-renderer-factory.js'
import { createBoard3dRendererRuntime } from './board-3d-renderer-runtime.js'
import { resolveHostLockMessage } from './host-gate.js'
import type { DrawState } from './app-draw.js'
import type { Board3dRendererRuntime } from './board-3d-renderer-runtime.js'
import type { LevelData } from '../logic/types.js'

const APP_DISPOSE_KEY = '__baba_is_you_web_dispose__'

type AppGlobal = typeof globalThis & {
  __baba_is_you_web_dispose__?: () => void
}

const levelData = levels.map((level) => parseLevel(level))
if (!levelData[0]) throw new Error('No levels available.')

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const root = globalThis.document.getElementById('app')
if (!root) throw new Error('Missing #app container.')

const hostLockMessage = resolveHostLockMessage(globalThis.location.hostname)
if (hostLockMessage) {
  root.textContent = hostLockMessage
  throw new Error(hostLockMessage)
}

const appGlobal = globalThis as AppGlobal
appGlobal[APP_DISPOSE_KEY]?.()

const mapData = new Map<string, LevelData>(
  maps.map((entry) => [entry.file, levelDataForMap(entry)]),
)
const appStore = createWebAppStore({
  levels: levelData,
  rootMapFile,
  mapFor: (file) => mapData.get(file),
})
const appController = createWebAppController({
  store: appStore,
})

// Goldens bind to the campaign level they were recorded on (title+layout
// match inside the binding); boards with no recording just never show a
// Replay button.
const goldenBinding = bindGoldensToLevels(goldenReplays, levelData)
const goldenForCurrentBoard = ():
  | (typeof goldenReplays)[number]
  | undefined => {
  const data = appStore.getState()
  if (data.mode !== 'game') return undefined
  if (data.customLevel) return goldenBinding.forLevel(data.customLevel)
  return goldenBinding.forLevelIndex(data.levelIndex)
}

const drawState: DrawState = {
  prevMode: null,
  prevShowDialog: false,
  prevBoardSignature: null,
  prevCellSize: null,
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
  drawState,
  getSnapshot: appController.getViewState,
  hasGoldenReplay: () => goldenForCurrentBoard() !== undefined,
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

// Forced landscape on portrait phones (the #app frame rotates 90°, see
// style.css): pointer deltas arrive in viewport space and are rotated
// back into app space before gesture classification.
const portraitTouchQuery = window.matchMedia(
  '(orientation: portrait) and (pointer: coarse)',
)

const pointerHandlers = createAppPointerHandlers({
  viewState: appController,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleGameCommand: appController.handleGameCommand,
  mapViewportDelta: (dx, dy) =>
    portraitTouchQuery.matches ? { dx: dy, dy: -dx } : { dx, dy },
  onHandledAction: () => {
    navigator.vibrate?.(10)
  },
})

const handleRootClick = createRootClickHandler({
  viewState: appController,
  toggleReferenceDialog: appController.toggleReferenceDialog,
  closeReferenceDialog: appController.closeReferenceDialog,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleGameCommand: appController.handleGameCommand,
  playReplay: () => {
    const golden = goldenForCurrentBoard()
    if (golden) appController.startReplay(golden.name, golden.inputs, golden.level)
  },
})

const gamepadRuntime = createGamepadRuntime({
  viewState: {
    getMode: appController.getMode,
    isReferenceDialogOpen: appController.isReferenceDialogOpen,
    getStatus: () => appController.getState().state.status,
  },
  closeReferenceDialog: appController.closeReferenceDialog,
  toggleReferenceDialog: appController.toggleReferenceDialog,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleGameCommand: appController.handleGameCommand,
})

const handleWindowKeydown = createWindowKeydownHandler({
  viewState: appController,
  closeReferenceDialog: appController.closeReferenceDialog,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleMapEvent: appController.handleMapKeyboardEvent,
  handleGameEvent: appController.handleGameKeyboardEvent,
})

// Golden playback driver: while a replay owns the board it consumes one
// recorded input per tick; it stops the moment the stream ends or the
// player aborts back to the map.
const replayDriver = createReplayDriver({
  isReplaying: appController.isReplaying,
  step: appController.replayStep,
  subscribe: appStore.subscribe,
})

const unsubscribeDraw = appStore.subscribe(draw)

// Haptics on outcome transitions; a no-op where vibration is unsupported.
// The pad path mirrors the phone buzz: dual-rumble where the hardware
// offers it, silent otherwise.
let prevBuzzStatus = appController.getViewState().state.status
const unsubscribeStatusBuzz = appStore.subscribe(() => {
  const status = appController.getViewState().state.status
  if (status === prevBuzzStatus) return
  prevBuzzStatus = status
  if (status === 'win') {
    navigator.vibrate?.([30, 40, 30])
    gamepadRuntime.rumble({ durationMs: 60, strongMagnitude: 0.9, weakMagnitude: 0.7 })
    gamepadRuntime.rumble({
      durationMs: 60,
      startDelayMs: 100,
      strongMagnitude: 0.9,
      weakMagnitude: 0.7,
    })
  } else if (status === 'lose') {
    navigator.vibrate?.(20)
    gamepadRuntime.rumble({ durationMs: 90, strongMagnitude: 0.3, weakMagnitude: 0.8 })
  }
})

const disposeApp = registerAppLifecycle({
  root,
  handleRootClick,
  handleWindowKeydown,
  pointerHandlers,
  draw,
  disposeBoard3d: () => {
    board3dRenderer?.dispose()
    board3dRenderer = null
  },
  onDispose: () => {
    unsubscribeDraw()
    unsubscribeStatusBuzz()
    gamepadRuntime.dispose()
    replayDriver.dispose()
    delete appGlobal[APP_DISPOSE_KEY]
  },
})
appGlobal[APP_DISPOSE_KEY] = disposeApp

draw()
