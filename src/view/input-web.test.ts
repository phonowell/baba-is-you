import assert from 'node:assert/strict'
import test from 'node:test'

import { mapGameKeyboardEvent, mapMenuKeyboardEvent } from './input-web.js'

test('mapGameKeyboardEvent maps arrows and WASD to move', () => {
  assert.deepEqual(mapGameKeyboardEvent({ key: 'ArrowUp' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'ArrowRight' }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'ArrowDown' }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'ArrowLeft' }), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'w' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'd' }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 's' }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'a' }), {
    type: 'move',
    direction: 'left',
  })
})

test('mapGameKeyboardEvent normalizes single-character keys to lowercase', () => {
  assert.deepEqual(mapGameKeyboardEvent({ key: 'W' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'Q' }), { type: 'back' })
})

test('mapGameKeyboardEvent maps wait, utility, and fallback commands', () => {
  assert.deepEqual(mapGameKeyboardEvent({ key: ' ' }), { type: 'wait' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'Space' }), { type: 'wait' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'Spacebar' }), { type: 'wait' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'u' }), { type: 'undo' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'z' }), { type: 'undo' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'r' }), { type: 'restart' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'n' }), { type: 'next' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'Enter' }), { type: 'next' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'q' }), { type: 'back' })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'x' }), { type: 'noop' })
})

test('mapGameKeyboardEvent keeps ctrl/meta guard', () => {
  assert.deepEqual(mapGameKeyboardEvent({ key: 'r', ctrlKey: true }), {
    type: 'noop',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'q', metaKey: true }), {
    type: 'noop',
  })
})

test('mapMenuKeyboardEvent maps selection moves, start, and quit', () => {
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'ArrowUp' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'w' }), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'ArrowDown' }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 's' }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'ArrowLeft' }), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'a' }), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'ArrowRight' }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'd' }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: ' ' }), { type: 'enter' })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'n' }), { type: 'enter' })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'Enter' }), { type: 'enter' })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'q' }), { type: 'back' })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'Escape' }), {
    type: 'back',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'u' }), { type: 'noop' })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'x' }), { type: 'noop' })
})

test('mapMenuKeyboardEvent keeps ctrl/meta guard', () => {
  assert.deepEqual(mapMenuKeyboardEvent({ key: ' ', ctrlKey: true }), {
    type: 'noop',
  })
  assert.deepEqual(mapMenuKeyboardEvent({ key: 'q', metaKey: true }), {
    type: 'noop',
  })
})
