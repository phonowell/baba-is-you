import assert from 'node:assert/strict'
import test from 'node:test'

import { mapGameKeypress, mapMenuKeypress } from './input.js'

test('mapGameKeypress maps arrows and WASD to move', () => {
  assert.deepEqual(mapGameKeypress({ name: 'up' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGameKeypress({ name: 'right' }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapGameKeypress({ name: 'down' }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapGameKeypress({ name: 'left' }), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapGameKeypress({ name: 'w' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGameKeypress({ name: 'd' }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapGameKeypress({ name: 's' }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapGameKeypress({ name: 'a' }), {
    type: 'move',
    direction: 'left',
  })
})

test('mapGameKeypress maps utility and fallback commands', () => {
  assert.deepEqual(mapGameKeypress({ name: 'u' }), { type: 'undo' })
  assert.deepEqual(mapGameKeypress({ name: 'r' }), { type: 'restart' })
  assert.deepEqual(mapGameKeypress({ name: 'n' }), { type: 'next' })
  assert.deepEqual(mapGameKeypress({ name: 'enter' }), { type: 'next' })
  assert.deepEqual(mapGameKeypress({ name: 'q' }), { type: 'back-menu' })
  assert.deepEqual(mapGameKeypress({ name: 'x' }), { type: 'noop' })
})

test('mapMenuKeypress maps navigation, start, quit, and fallback', () => {
  assert.deepEqual(mapMenuKeypress({ name: 'up' }), { type: 'up' })
  assert.deepEqual(mapMenuKeypress({ name: 'w' }), { type: 'up' })
  assert.deepEqual(mapMenuKeypress({ name: 'down' }), { type: 'down' })
  assert.deepEqual(mapMenuKeypress({ name: 's' }), { type: 'down' })
  assert.deepEqual(mapMenuKeypress({ name: 'space' }), { type: 'start' })
  assert.deepEqual(mapMenuKeypress({ name: 'enter' }), { type: 'start' })
  assert.deepEqual(mapMenuKeypress({ name: 'q' }), { type: 'quit-app' })
  assert.deepEqual(mapMenuKeypress({ name: 'x' }), { type: 'noop' })
})
