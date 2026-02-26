import assert from 'node:assert/strict'
import test from 'node:test'

import { mapGameKeypress, mapMenuKeypress } from './input.js'

test('mapGameKeypress maps q to back-menu', () => {
  assert.deepEqual(mapGameKeypress({ name: 'q' }), { type: 'back-menu' })
})

test('mapMenuKeypress maps q to quit-app and enter to start', () => {
  assert.deepEqual(mapMenuKeypress({ name: 'q' }), { type: 'quit-app' })
  assert.deepEqual(mapMenuKeypress({ name: 'enter' }), { type: 'start' })
})
