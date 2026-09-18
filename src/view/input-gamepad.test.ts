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
    toGamepadSnapshot(padSource({ buttons: buttons([12, 0, 9]) }))!,
  )
  assert.deepEqual([...dpad].sort(), ['a', 'start', 'up'])

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
    type: 'back-menu',
  })
})

test('mapGamepadGameInput turns A into next on the outcome card', () => {
  assert.deepEqual(mapGamepadGameInput('a', 'playing'), { type: 'wait' })
  assert.deepEqual(mapGamepadGameInput('a', 'lose'), { type: 'wait' })
  assert.deepEqual(mapGamepadGameInput('a', 'win'), { type: 'next' })
  assert.deepEqual(mapGamepadGameInput('a', 'complete'), { type: 'next' })
})

test('mapGamepadMenuInput maps navigation, start, and dead buttons', () => {
  assert.deepEqual(mapGamepadMenuInput('up'), { type: 'up' })
  assert.deepEqual(mapGamepadMenuInput('down'), { type: 'down' })
  assert.deepEqual(mapGamepadMenuInput('left'), { type: 'page-left' })
  assert.deepEqual(mapGamepadMenuInput('right'), { type: 'page-right' })
  assert.deepEqual(mapGamepadMenuInput('a'), { type: 'start' })
  assert.deepEqual(mapGamepadMenuInput('start'), { type: 'start' })
  assert.deepEqual(mapGamepadMenuInput('b'), { type: 'noop' })
  assert.deepEqual(mapGamepadMenuInput('x'), { type: 'noop' })
})
