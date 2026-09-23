import goldenIndex from 'baba-golden-index'

import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { orderMenuLevels } from '../view/render-menu-html.js'
import { createDraw } from './app-draw.js'
import { createWebAppController } from './app-controller.js'
import {
  createMenuHoverHandler,
  createRootClickHandler,
  createWindowKeydownHandler,
} from './app-events.js'
import { createGamepadRuntime } from './app-gamepad.js'
import { createBoardHover } from './app-hover.js'
import { createAppPointerHandlers } from './app-pointer.js'
import { registerAppLifecycle } from './app-lifecycle.js'
import { createGoldenStore } from './app-goldens.js'
import { createReplayDriver } from './app-replay.js'
import { createWebAppStore } from './app-store.js'
import { applyWithTransition, computeCellSizeForState } from './app-view-helpers.js'
import { createLazyBoard3d } from './board-3d-mount.js'
import { paintLevelPreview } from './menu-preview.js'
import { resolveHostLockMessage } from './host-gate.js'

import type { LevelData } from '../logic/types.js'
import type { DrawState } from './app-draw.js'

const APP_DISPOSE_KEY = '__baba_is_you_web_dispose__'

type AppGlobal = typeof globalThis & {
  __baba_is_you_web_dispose__?: () => void
}

// Campaign boards parse on first index access: the menu only needs
// titles, and every downstream consumer (`env.levels`, golden
// resolution, previews) reaches boards through `levelData[index]`, so a
// session pays the full parse only for levels it actually enters or
// previews. The slots are real array elements once filled — iteration
// still sees the complete list.
const parsedLevels: Array<LevelData | undefined> = new Array(levels.length)
const levelData = new Proxy(parsedLevels, {
  get: (target, prop, receiver) => {
    if (typeof prop === 'string' && /^\d+$/.test(prop)) {
      const index = Number(prop)
      const source = levels[index]
      if (source !== undefined) return (target[index] ??= parseLevel(source))
    }
    return Reflect.get(target, prop, receiver)
  },
}) as LevelData[]
if (!levelData[0]) throw new Error('No levels available.')

// Menu metadata can't wait for full parses, but it also can't afford
// them — scan the `title` statement only (same grammar `parseLevel`
// applies: first `;`-separated part whose head token is `title`, last
// one wins).
const parseLevelTitle = (levelText: string): string => {
  let title = 'Untitled'
  for (const part of levelText.split(';')) {
    const tokens = part.trim().split(/\s+/)
    if (tokens[0]?.toLowerCase() !== 'title') continue
    const next = tokens.slice(1).join(' ').trim()
    title = next.length ? next : 'Untitled'
  }
  return title
}

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

// Goldens bind at build time (the index maps campaign level → recording
// name); the recordings themselves stay packed until one is actually
// played. Boards with no recording just never show a Replay button.
const goldenStore = createGoldenStore(
  (name) => __babaPack.text(name),
  goldenIndex,
  levelData,
)

// The menu lists solvable levels first — a bound replay is what the menu
// calls "has a solution". menuOrder maps each grid slot back to its
// campaign level index; the reducer does the same translation on
// enter-game/return-to-menu.
const menuLevelsByLevel = levels.map((source, index) => ({
  title: parseLevelTitle(source),
  hasSolution: goldenStore.nameForLevelIndex(index) !== undefined,
}))
const menuOrder = orderMenuLevels(menuLevelsByLevel)
const menuLevels = menuOrder.map(
  // orderMenuLevels only emits indexes of menuLevelsByLevel itself.
  (index) => menuLevelsByLevel[index]!,
)
const menuPositionByLevelIndex = new Map(
  menuOrder.map((levelIndex, position) => [levelIndex, position]),
)

const appStore = createWebAppStore({
  levels: levelData,
  menuOrder,
})
const appController = createWebAppController({
  store: appStore,
})

const goldenNameForCurrentBoard = (): string | undefined => {
  const data = appStore.getState()
  if (data.mode !== 'game') return undefined
  if (data.customLevel) return goldenStore.loadedForLevel(data.customLevel)?.name
  return goldenStore.nameForLevelIndex(data.levelIndex)
}

const drawState: DrawState = {
  prevMode: null,
  prevShowDialog: false,
  prevBoardSignature: null,
  prevCellSize: null,
  gameView: null,
}
// The whole three.js scene tree sits behind import('./board-3d-lazy.js')
// — the menu boots without it; the first board mount awaits the chunk.
const board3d = createLazyBoard3d({
  loadModule: () => import('./board-3d-lazy.js'),
  isCurrentBoard: (board) => drawState.gameView?.boardEl === board,
  latestState: () => appController.getViewState().state,
})

const draw = createDraw({
  root,
  // Display order — solvable cells lead, known-unsolvable ones dim and
  // trail. Slots carry no campaign index; translate at the seams below.
  menuLevels,
  drawState,
  getSnapshot: appController.getViewState,
  hasGoldenReplay: () => goldenNameForCurrentBoard() !== undefined,
  // The in-game title number matches the number the menu cell showed.
  levelMenuNumber: (levelIndex) =>
    (menuPositionByLevelIndex.get(levelIndex) ?? levelIndex) + 1,
  computeCellSize: (boardState) => computeCellSizeForState(boardState),
  paintMenuPreview: (canvas, index) => {
    const level = levelData[menuOrder[index] ?? index]
    if (level) paintLevelPreview(canvas, level)
  },
  applyWithTransition: (fn) => applyWithTransition(reducedMotionQuery, fn),
  unmountBoard3d: () => {
    board3d.unmount()
  },
  mountAndSyncBoard3d: (board, boardState) => {
    board3d.mountAndSync(board, boardState)
  },
})

// Forced landscape on portrait phones (the #app frame rotates 90°, see
// style.css): pointer deltas arrive in viewport space and are rotated
// back into app space before gesture classification.
const portraitTouchQuery = window.matchMedia(
  '(orientation: portrait) and (pointer: coarse)',
)

// Cell hover: a faint in-scene cell marker plus a small chip listing the
// cell's coordinates and cards. Only tracks pointers between presses —
// swipes and touch drags never read as hover.
const boardHover = createBoardHover({
  getGameState: () => {
    const data = appStore.getState()
    return data.mode === 'game' ? data.state : null
  },
  getTip: () => drawState.gameView?.hoverTip ?? null,
  getRenderer: () => board3d.renderer(),
  isBlocked: () =>
    appController.isReferenceDialogOpen() ||
    appController.isReplayConfirmOpen(),
  // The same inverse rotation as mapViewportDelta below, applied to the
  // point itself (the rotated frame's pivot sits at viewport 0,0).
  mapViewportPoint: (x, y) =>
    portraitTouchQuery.matches ? { x: y, y: -x } : { x, y },
})

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
  onBoardHover: boardHover.move,
  onBoardHoverEnd: boardHover.clear,
})

// Hovering a menu cell selects it — the preview follows the pointer —
// without going through the input cooldown that paces real commands.
const handleMenuHover = createMenuHoverHandler({
  viewState: appController,
  selectLevel: (index) => {
    appController.dispatch({ type: 'select-menu-level', index })
  },
})

// The confirmed Solution run: decode the recordings payload on this
// first request; by the time it resolves the user may have backed out —
// re-verify the board still shows the same replay before dispatching.
const playReplay = (): void => {
  const name = goldenNameForCurrentBoard()
  if (!name) return
  void goldenStore
    .loadByName(name)
    .then((golden) => {
      if (golden && goldenNameForCurrentBoard() === name) {
        appController.startReplay(golden.name, golden.inputs, golden.level)
      }
    })
    .catch(() => undefined)
}

const handleRootClick = createRootClickHandler({
  viewState: appController,
  toggleReferenceDialog: appController.toggleReferenceDialog,
  closeReferenceDialog: appController.closeReferenceDialog,
  openReplayConfirm: appController.openReplayConfirm,
  closeReplayConfirm: appController.closeReplayConfirm,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleGameCommand: appController.handleGameCommand,
  enterLevel: appController.enterLevel,
  playReplay,
})

const gamepadRuntime = createGamepadRuntime({
  viewState: {
    getMode: appController.getMode,
    isReferenceDialogOpen: appController.isReferenceDialogOpen,
    isReplayConfirmOpen: appController.isReplayConfirmOpen,
    getStatus: () => appController.getState().state.status,
  },
  closeReferenceDialog: appController.closeReferenceDialog,
  closeReplayConfirm: appController.closeReplayConfirm,
  toggleReferenceDialog: appController.toggleReferenceDialog,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleGameCommand: appController.handleGameCommand,
})

const handleWindowKeydown = createWindowKeydownHandler({
  viewState: appController,
  closeReferenceDialog: appController.closeReferenceDialog,
  closeReplayConfirm: appController.closeReplayConfirm,
  playReplay,
  canHandleGameAction: appController.canHandleGameAction,
  markGameActionHandled: appController.markGameActionHandled,
  handleMenuEvent: appController.handleMenuKeyboardEvent,
  handleGameEvent: appController.handleGameKeyboardEvent,
})

// Golden playback driver: while a replay owns the board it consumes one
// recorded input per tick; it stops the moment the stream ends or the
// player aborts back to the menu.
const replayDriver = createReplayDriver({
  isReplaying: appController.isReplaying,
  step: appController.replayStep,
  subscribe: appStore.subscribe,
})

const unsubscribeDraw = appStore.subscribe(draw)
// A parked cursor keeps its cell marker across turns — refresh after draw
// so the chip's card list tracks items that moved under it.
const unsubscribeBoardHover = appStore.subscribe(boardHover.refresh)

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
  handleRootPointerOver: handleMenuHover,
  handleWindowKeydown,
  pointerHandlers,
  draw,
  disposeBoard3d: () => {
    board3d.dispose()
  },
  onDispose: () => {
    unsubscribeDraw()
    unsubscribeBoardHover()
    unsubscribeStatusBuzz()
    gamepadRuntime.dispose()
    replayDriver.dispose()
    delete appGlobal[APP_DISPOSE_KEY]
  },
})
appGlobal[APP_DISPOSE_KEY] = disposeApp

draw()

// Fetch + compile the 3D chunk while the menu sits idle — WebGL itself is
// only instantiated on the first mountAndSync.
const scheduleIdle =
  globalThis.requestIdleCallback?.bind(globalThis) ??
  ((callback: () => void) => globalThis.setTimeout(callback, 300))
scheduleIdle(() => board3d.preload())
