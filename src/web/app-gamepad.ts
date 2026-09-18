import {
  mapGamepadGameInput,
  mapGamepadMenuInput,
  readGamepadInputs,
  toGamepadSnapshot,
} from '../view/input-gamepad.js'

import type {
  GamepadLogicalInput,
  GamepadSnapshot,
  GamepadSource,
} from '../view/input-gamepad.js'
import type { GameCommand, MenuCommand } from '../view/input.js'
import type { Direction, GameStatus } from '../logic/types.js'

// Held directions re-fire on a cadence (held-key auto-repeat, but slower):
// the game-side cooldown still gates how fast turns actually advance.
const DIR_REPEAT_DELAY_MS = 300
const DIR_REPEAT_MS = 140

const DIRECTION_INPUTS: readonly Direction[] = [
  'up',
  'down',
  'left',
  'right',
]

const EDGE_INPUTS: readonly GamepadLogicalInput[] = [
  'a',
  'b',
  'x',
  'start',
]

const NO_INPUTS: ReadonlySet<GamepadLogicalInput> = new Set()

type GamepadViewState = {
  getMode: () => 'menu' | 'game'
  isReferenceDialogOpen: () => boolean
  getStatus: () => GameStatus
}

type GamepadEventTarget = {
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

type GamepadRuntimeContext = {
  viewState: GamepadViewState
  closeReferenceDialog: () => void
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleGameCommand: (cmd: GameCommand) => boolean
  handleMenuCommand: (cmd: MenuCommand) => boolean
  getGamepads?: () => ArrayLike<GamepadSource | null>
  requestFrame?: (callback: (nowMs: number) => void) => number
  cancelFrame?: (handle: number) => void
  eventTarget?: GamepadEventTarget
}

export type GamepadRuntime = {
  dispose: () => void
}

// The Gamepad API has no button events — polling is mandatory. The loop
// only runs while a pad is connected: it starts on `gamepadconnected`
// (or an already-present pad at startup) and stops itself once
// getGamepads() reports nothing, so an idle session never holds a RAF.
export const createGamepadRuntime = (
  context: GamepadRuntimeContext,
): GamepadRuntime => {
  const {
    viewState,
    closeReferenceDialog,
    canHandleGameAction,
    markGameActionHandled,
    handleGameCommand,
    handleMenuCommand,
    getGamepads = () => navigator.getGamepads?.() ?? [],
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
  } = context

  const eventTarget: GamepadEventTarget = context.eventTarget ?? {
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  }

  let disposed = false
  let polling = false
  let rafId = 0
  let activeIndex: number | null = null
  let prevInputs: ReadonlySet<GamepadLogicalInput> = NO_INPUTS
  let heldDir: Direction | null = null
  let nextDirFireMs = 0

  const resetTracking = (): void => {
    activeIndex = null
    prevInputs = NO_INPUTS
    heldDir = null
  }

  const pickSnapshot = (): GamepadSnapshot | null => {
    const sources = getGamepads()
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      if (!source) continue
      const snapshot = toGamepadSnapshot(source)
      if (snapshot) return snapshot
    }
    return null
  }

  const scheduleNext = (): void => {
    polling = true
    rafId = requestFrame(tick)
  }

  const dispatchInput = (
    input: GamepadLogicalInput,
    mode: 'menu' | 'game',
  ): void => {
    if (mode === 'menu') {
      handleMenuCommand(mapGamepadMenuInput(input))
      return
    }
    if (!canHandleGameAction()) return
    if (handleGameCommand(mapGamepadGameInput(input, viewState.getStatus()))) {
      markGameActionHandled()
    }
  }

  // Prefer the direction already held so a wobbling stick does not flip
  // between axes mid-press; otherwise fall back to a fixed order.
  const pickDirection = (
    inputs: ReadonlySet<GamepadLogicalInput>,
  ): Direction | null => {
    if (heldDir && inputs.has(heldDir)) return heldDir
    for (const input of DIRECTION_INPUTS) {
      if (inputs.has(input)) return input
    }
    return null
  }

  const tick = (now: number): void => {
    polling = false
    if (disposed) {
      rafId = 0
      return
    }

    const snapshot = pickSnapshot()
    if (!snapshot) {
      // No usable pad (none, disconnected, or non-standard mapping — those
      // can never fire anyway). Stop polling: `gamepadconnected` wakes the
      // loop again when a standard pad shows up.
      resetTracking()
      rafId = 0
      return
    }
    scheduleNext()

    const inputs = readGamepadInputs(snapshot)
    if (snapshot.index !== activeIndex) {
      // Pad swap: adopt the current state as the baseline so buttons held
      // across the swap do not replay as fresh presses.
      activeIndex = snapshot.index
      prevInputs = inputs
      heldDir = null
      return
    }

    const mode = viewState.getMode()
    if (mode === 'game' && viewState.isReferenceDialogOpen()) {
      // B is the cancel convention — Escape's counterpart on a pad.
      if (inputs.has('b') && !prevInputs.has('b')) closeReferenceDialog()
      prevInputs = inputs
      heldDir = null
      return
    }

    for (const input of EDGE_INPUTS) {
      if (inputs.has(input) && !prevInputs.has(input)) {
        dispatchInput(input, mode)
      }
    }

    const dir = pickDirection(inputs)
    if (dir !== heldDir) {
      heldDir = dir
      if (dir) {
        dispatchInput(dir, mode)
        nextDirFireMs = now + DIR_REPEAT_DELAY_MS
      }
    } else if (dir && now >= nextDirFireMs) {
      dispatchInput(dir, mode)
      nextDirFireMs = now + DIR_REPEAT_MS
    }

    prevInputs = inputs
  }

  const ensurePolling = (): void => {
    if (disposed || polling) return
    scheduleNext()
  }

  const onGamepadConnected = (): void => {
    ensurePolling()
  }

  eventTarget.addEventListener('gamepadconnected', onGamepadConnected)
  // A pad connected before this script ran never fired the event; check
  // once so a reload mid-session keeps the pad usable.
  ensurePolling()

  return {
    dispose: (): void => {
      if (disposed) return
      disposed = true
      eventTarget.removeEventListener('gamepadconnected', onGamepadConnected)
      if (polling) cancelFrame(rafId)
      polling = false
      rafId = 0
      resetTracking()
    },
  }
}
