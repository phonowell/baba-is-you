import type { GameStatus } from '../logic/types.js'
import type {
  GameCommand,
  GameControlEntry,
} from './input.js'

// W3C "standard" layout indices. Pads reporting another mapping get
// dropped in toGamepadSnapshot — their button order is unreliable.
const BUTTON_A = 0
const BUTTON_B = 1
const BUTTON_X = 2
const BUTTON_SELECT = 8
const BUTTON_START = 9
const BUTTON_DPAD_UP = 12
const BUTTON_DPAD_DOWN = 13
const BUTTON_DPAD_LEFT = 14
const BUTTON_DPAD_RIGHT = 15

// Left-stick deflection (0..1) that counts as a digital direction press.
export const GAMEPAD_STICK_THRESHOLD = 0.5

// Structural subset of the W3C Gamepad object so tests can feed plain
// objects, same trick input-web.ts uses for keyboard events.
export type GamepadSource = {
  index?: number
  connected?: boolean
  mapping?: string
  buttons: readonly { pressed?: boolean }[]
  axes: readonly number[]
  vibrationActuator?: GamepadVibrationActuator | null
}

// Structural subset of GamepadHapticActuator (Chrome/Edge dual-rumble).
// Absent on pads and browsers without haptics — rumble degrades to a no-op.
// `type` mirrors GamepadHapticEffectType so a real Gamepad still satisfies
// GamepadSource under strictFunctionTypes.
export type GamepadVibrationActuator = {
  playEffect?: (
    type: 'dual-rumble' | 'trigger-rumble',
    params?: {
      duration?: number
      startDelay?: number
      strongMagnitude?: number
      weakMagnitude?: number
    },
  ) => unknown
}

export type GamepadRumble = {
  durationMs?: number
  startDelayMs?: number
  strongMagnitude?: number
  weakMagnitude?: number
}

export type GamepadSnapshot = {
  index: number
  buttons: readonly boolean[]
  axes: readonly number[]
}

export type GamepadLogicalInput =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'x'
  | 'select'
  | 'start'

export const toGamepadSnapshot = (
  source: GamepadSource,
): GamepadSnapshot | null => {
  if (source.connected === false) return null
  if (source.mapping !== 'standard') return null
  return {
    index: source.index ?? 0,
    buttons: source.buttons.map((button) => button.pressed === true),
    axes: [...source.axes],
  }
}

export const readGamepadInputs = (
  pad: GamepadSnapshot,
): ReadonlySet<GamepadLogicalInput> => {
  const pressed = new Set<GamepadLogicalInput>()
  const button = (index: number): boolean => pad.buttons[index] === true

  if (button(BUTTON_DPAD_UP) || (pad.axes[1] ?? 0) < -GAMEPAD_STICK_THRESHOLD)
    pressed.add('up')
  if (button(BUTTON_DPAD_DOWN) || (pad.axes[1] ?? 0) > GAMEPAD_STICK_THRESHOLD)
    pressed.add('down')
  if (button(BUTTON_DPAD_LEFT) || (pad.axes[0] ?? 0) < -GAMEPAD_STICK_THRESHOLD)
    pressed.add('left')
  if (button(BUTTON_DPAD_RIGHT) || (pad.axes[0] ?? 0) > GAMEPAD_STICK_THRESHOLD)
    pressed.add('right')

  if (button(BUTTON_A)) pressed.add('a')
  if (button(BUTTON_B)) pressed.add('b')
  if (button(BUTTON_X)) pressed.add('x')
  if (button(BUTTON_SELECT)) pressed.add('select')
  if (button(BUTTON_START)) pressed.add('start')

  return pressed
}

// A doubles as the confirm button: mid-level it plays a wait turn, on the
// outcome card it advances like N/Enter does on the keyboard.
export const mapGamepadGameInput = (
  input: GamepadLogicalInput,
  status: GameStatus,
): GameCommand => {
  switch (input) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return { type: 'move', direction: input }
    case 'a':
      return status === 'win' ? { type: 'next' } : { type: 'wait' }
    case 'b':
      return { type: 'undo' }
    case 'x':
      return { type: 'restart' }
    case 'start':
      return { type: 'back' }
    // The runtime intercepts select for the help overlay — a command
    // mapping only exists to keep the switch exhaustive.
    case 'select':
      return { type: 'noop' }
  }
}

// Menu pad mapping: directions drive the selection (up/down step,
// left/right page), A starts the highlighted level, B/Start do nothing
// on the top screen — the menu is the root.
export const mapGamepadMenuInput = (
  input: GamepadLogicalInput,
): GameCommand => {
  switch (input) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return { type: 'move', direction: input }
    case 'a':
      return { type: 'enter' }
    case 'b':
    case 'x':
    case 'start':
      return { type: 'noop' }
    // The runtime intercepts select for the help overlay — a command
    // mapping only exists to keep the switch exhaustive.
    case 'select':
      return { type: 'noop' }
  }
}

export const GAMEPAD_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'D-Pad/Stick', action: 'move' },
  { keys: 'A', action: 'wait / enter' },
  { keys: 'B', action: 'undo / back' },
  { keys: 'X', action: 'restart' },
  { keys: 'Start', action: 'menu / back' },
  { keys: 'Select', action: 'controls' },
]
