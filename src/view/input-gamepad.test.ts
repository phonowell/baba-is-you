import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GAMEPAD_STICK_THRESHOLD,
  mapGamepadGameInput,
  mapGamepadMenuInput,
  readGamepadInputs,
  toGamepadSnapshot,
} from './input-gamepad.js'

import type { GamepadSource } from './input-gamepad.js'

const padSource = (
  overrides: Partial<GamepadSource> = {},
): GamepadSource => ({
  index: 0,
  connected: true,
  mapping: 'standard',
  buttons: [],
  axes: [0, 0, 0, 0],
  ...overrides,
})

const buttons = (pressed: number[]): { pressed: boolean }[] =>
  Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }))

test('toGamepadSnapshot drops non-standard and disconnected pads', () => {
  assert.equal(toGamepadSnapshot(padSource({ mapping: '' })), null)
  assert.equal(toGamepadSnapshot(padSource({ connected: false })), null)
  const snapshot = toGamepadSnapshot(
    padSource({ buttons: [{ pressed: true }] }),
  )
  assert.ok(snapshot)
  assert.deepEqual(snapshot.buttons, [true])
})

test('readGamepadInputs maps dpad, buttons, and the left stick', () => {
  const dpad = readGamepadInputs(
    toGamepadSnapshot(padSource({ buttons: buttons([12, 0, 8, 9]) }))!,
  )
  assert.deepEqual([...dpad].sort(), ['a', 'select', 'start', 'up'])

  const stick = readGamepadInputs(
    toGamepadSnapshot(padSource({ axes: [0.8, -0.9, 0, 0] }))!,
  )
  assert.deepEqual([...stick].sort(), ['right', 'up'])
})

test('readGamepadInputs ignores stick deflection below the threshold', () => {
  const just = GAMEPAD_STICK_THRESHOLD - 0.01
  const inputs = readGamepadInputs(
    toGamepadSnapshot(padSource({ axes: [just, -just, 0, 0] }))!,
  )
  assert.equal(inputs.size, 0)
})

test('mapGamepadGameInput maps directions and utility buttons', () => {
  assert.deepEqual(mapGamepadGameInput('up', 'playing'), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGamepadGameInput('right', 'playing'), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapGamepadGameInput('b', 'playing'), { type: 'undo' })
  assert.deepEqual(mapGamepadGameInput('x', 'playing'), { type: 'restart' })
  assert.deepEqual(mapGamepadGameInput('start', 'playing'), {
    type: 'back',
  })
  // The runtime intercepts select for the help overlay — the mapping is
  // a deliberate dead end.
  assert.deepEqual(mapGamepadGameInput('select', 'playing'), { type: 'noop' })
})

test('mapGamepadGameInput turns A into next on the outcome card', () => {
  assert.deepEqual(mapGamepadGameInput('a', 'playing'), { type: 'wait' })
  assert.deepEqual(mapGamepadGameInput('a', 'lose'), { type: 'wait' })
  assert.deepEqual(mapGamepadGameInput('a', 'win'), { type: 'next' })
})

test('mapGamepadMenuInput maps selection moves and start; utility keys noop', () => {
  assert.deepEqual(mapGamepadMenuInput('up'), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGamepadMenuInput('down'), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapGamepadMenuInput('left'), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapGamepadMenuInput('right'), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapGamepadMenuInput('a'), { type: 'enter' })
  // The menu is the root screen — back/restart have nowhere to go.
  assert.deepEqual(mapGamepadMenuInput('b'), { type: 'noop' })
  assert.deepEqual(mapGamepadMenuInput('x'), { type: 'noop' })
  assert.deepEqual(mapGamepadMenuInput('start'), { type: 'noop' })
  assert.deepEqual(mapGamepadMenuInput('select'), { type: 'noop' })
})
