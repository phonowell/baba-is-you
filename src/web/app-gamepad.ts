import {
  GAMEPAD_STICK_THRESHOLD,
  mapGamepadGameInput,
  mapGamepadMenuInput,
  readGamepadInputs,
  toGamepadSnapshot,
} from '../view/input-gamepad.js'

import type {
  GamepadLogicalInput,
  GamepadRumble,
  GamepadSnapshot,
  GamepadSource,
} from '../view/input-gamepad.js'
import type { GameCommand } from '../view/input.js'
import type { Direction, GameStatus } from '../logic/types.js'

// Held inputs re-fire on a cadence (held-key auto-repeat, but slower):
// the game-side cooldown still gates how fast turns actually advance.
const REPEAT_DELAY_MS = 300
const REPEAT_MS = 140

const DIRECTION_INPUTS: readonly Direction[] = [
  'up',
  'down',
  'left',
  'right',
]

// Edge-only buttons — repeating a level reset or a back-out makes no
// sense. Select is intercepted before dispatch (help overlay toggle).
const EDGE_INPUTS: readonly GamepadLogicalInput[] = [
  'x',
  'start',
]

// Held A/B mirror keyboard auto-repeat (Space wait / U/Z undo): a press
// edge arms the repeat slot and it keeps firing until release.
const REPEATABLE_INPUTS: readonly GamepadLogicalInput[] = [
  'a',
  'b',
]

const NO_INPUTS: ReadonlySet<GamepadLogicalInput> = new Set()

type GamepadViewState = {
  getMode: () => 'menu' | 'game'
  isReferenceDialogOpen: () => boolean
  getStatus: () => GameStatus
}

// Connect events carry the pad so the most recently connected one can
// win the pick. The optional `unknown` param keeps one function type
// compatible with window's EventListener and plain `() => void` test
// harnesses — the GamepadEvent shape is asserted only at the point of
// use.
type GamepadEventTarget = {
  addEventListener: (
    type: string,
    listener: (event?: unknown) => void,
  ) => void
  removeEventListener: (
    type: string,
    listener: (event?: unknown) => void,
  ) => void
}

type GamepadRuntimeContext = {
  viewState: GamepadViewState
  closeReferenceDialog: () => void
  // Optional so older test fixtures keep compiling; absent keeps Select
  // a no-op.
  toggleReferenceDialog?: () => void
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleGameCommand: (cmd: GameCommand) => boolean
  getGamepads?: () => ArrayLike<GamepadSource | null>
  requestFrame?: (callback: (nowMs: number) => void) => number
  cancelFrame?: (handle: number) => void
  eventTarget?: GamepadEventTarget
}

export type GamepadRuntime = {
  dispose: () => void
  rumble: (effect: GamepadRumble) => void
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
    toggleReferenceDialog,
    canHandleGameAction,
    markGameActionHandled,
    handleGameCommand,
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
  let activeSource: GamepadSource | null = null
  // Most recently connected pad wins the pick — a player grabbing a
  // second controller expects it to drive.
  let preferredIndex: number | null = null
  let prevInputs: ReadonlySet<GamepadLogicalInput> = NO_INPUTS
  let heldDir: Direction | null = null
  let nextDirFireMs = 0
  let heldButton: GamepadLogicalInput | null = null
  let nextButtonFireMs = 0

  const resetTracking = (): void => {
    activeIndex = null
    activeSource = null
    prevInputs = NO_INPUTS
    heldDir = null
    heldButton = null
  }

  type PickedPad = { source: GamepadSource; snapshot: GamepadSnapshot }

  const pickPad = (): PickedPad | null => {
    const sources = getGamepads()
    let first: PickedPad | null = null
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      if (!source) continue
      const snapshot = toGamepadSnapshot(source)
      if (!snapshot) continue
      if (snapshot.index === preferredIndex) return { source, snapshot }
      if (!first) first = { source, snapshot }
    }
    return first
  }

  const scheduleNext = (): void => {
    polling = true
    rafId = requestFrame(tick)
  }

  const dispatchInput = (
    input: GamepadLogicalInput,
    mode: 'menu' | 'game',
  ): void => {
    if (!canHandleGameAction()) return
    const cmd =
      mode === 'menu'
        ? mapGamepadMenuInput(input)
        : mapGamepadGameInput(input, viewState.getStatus())
    if (handleGameCommand(cmd)) {
      markGameActionHandled()
    }
  }

  // Prefer the direction already held so a wobbling stick does not flip
  // between axes mid-press; a fresh stick deflection picks its dominant
  // axis, then falls back to a fixed order for D-Pad combos.
  const pickDirection = (
    inputs: ReadonlySet<GamepadLogicalInput>,
    axes: readonly number[],
  ): Direction | null => {
    if (heldDir && inputs.has(heldDir)) return heldDir
    const x = axes[0] ?? 0
    const y = axes[1] ?? 0
    const absX = Math.abs(x)
    const absY = Math.abs(y)
    if (absX > GAMEPAD_STICK_THRESHOLD && absX >= absY) {
      return x < 0 ? 'left' : 'right'
    }
    if (absY > GAMEPAD_STICK_THRESHOLD) {
      return y < 0 ? 'up' : 'down'
    }
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

    const picked = pickPad()
    if (!picked) {
      // No usable pad (none, disconnected, or non-standard mapping — those
      // can never fire anyway). Stop polling: `gamepadconnected` wakes the
      // loop again when a standard pad shows up.
      resetTracking()
      rafId = 0
      return
    }
    scheduleNext()
    activeSource = picked.source

    const snapshot = picked.snapshot
    const inputs = readGamepadInputs(snapshot)
    if (snapshot.index !== activeIndex) {
      // Pad swap: adopt the current state as the baseline so buttons held
      // across the swap do not replay as fresh presses.
      activeIndex = snapshot.index
      prevInputs = inputs
      heldDir = null
      heldButton = null
      return
    }

    const mode = viewState.getMode()
    const dialogOpen = viewState.isReferenceDialogOpen()

    // Select toggles the controls reference — checked before the dialog
    // gate so it also closes the overlay it opened.
    if (inputs.has('select') && !prevInputs.has('select')) {
      toggleReferenceDialog?.()
    }

    if (dialogOpen) {
      // B is the cancel convention — Escape's counterpart on a pad.
      if (inputs.has('b') && !prevInputs.has('b')) {
        closeReferenceDialog()
      }
      prevInputs = inputs
      heldDir = null
      heldButton = null
      return
    }

    for (const input of EDGE_INPUTS) {
      if (inputs.has(input) && !prevInputs.has(input)) {
        dispatchInput(input, mode)
      }
    }

    // A repeatable press arms the slot on a real edge — so a B held
    // through a dialog close never bleeds into undo/leave (that press
    // produced no edge here) — then fires on cadence until release.
    for (const input of REPEATABLE_INPUTS) {
      if (inputs.has(input) && !prevInputs.has(input)) {
        dispatchInput(input, mode)
        heldButton = input
        nextButtonFireMs = now + REPEAT_DELAY_MS
      }
    }
    if (heldButton && !inputs.has(heldButton)) {
      heldButton = null
    } else if (heldButton && now >= nextButtonFireMs) {
      dispatchInput(heldButton, mode)
      nextButtonFireMs = now + REPEAT_MS
    }

    const dir = pickDirection(inputs, snapshot.axes)
    if (dir !== heldDir) {
      heldDir = dir
      if (dir) {
        dispatchInput(dir, mode)
        nextDirFireMs = now + REPEAT_DELAY_MS
      }
    } else if (dir && now >= nextDirFireMs) {
      dispatchInput(dir, mode)
      nextDirFireMs = now + REPEAT_MS
    }

    prevInputs = inputs
  }

  const ensurePolling = (): void => {
    if (disposed || polling) return
    scheduleNext()
  }

  const padIndexOf = (event: unknown): number | undefined =>
    (event as { gamepad?: { index?: number } } | undefined)?.gamepad?.index

  const onGamepadConnected = (event?: unknown): void => {
    const index = padIndexOf(event)
    if (index !== undefined) preferredIndex = index
    ensurePolling()
  }

  const onGamepadDisconnected = (event?: unknown): void => {
    if (padIndexOf(event) === preferredIndex) preferredIndex = null
    // A departing active pad needs no work here — the next tick's pick
    // falls back to another pad or stops polling on its own.
  }

  eventTarget.addEventListener('gamepadconnected', onGamepadConnected)
  eventTarget.addEventListener('gamepaddisconnected', onGamepadDisconnected)
  // A pad connected before this script ran never fired the event; check
  // once so a reload mid-session keeps the pad usable.
  ensurePolling()

  return {
    rumble: (effect: GamepadRumble): void => {
      if (disposed) return
      const actuator = activeSource?.vibrationActuator
      if (!actuator?.playEffect) return
      try {
        const result = actuator.playEffect('dual-rumble', {
          duration: effect.durationMs ?? 100,
          startDelay: effect.startDelayMs ?? 0,
          strongMagnitude: effect.strongMagnitude ?? 1,
          weakMagnitude: effect.weakMagnitude ?? 1,
        })
        // Chrome resolves a promise that can reject (unsupported effect,
        // pad yanked mid-play) — haptics are best-effort, never fatal.
        void Promise.resolve(result).catch(() => {})
      } catch {
        // External hardware boundary — a throwing actuator must not
        // break the input loop.
      }
    },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      eventTarget.removeEventListener('gamepadconnected', onGamepadConnected)
      eventTarget.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
      if (polling) cancelFrame(rafId)
      polling = false
      rafId = 0
      resetTracking()
    },
  }
}
