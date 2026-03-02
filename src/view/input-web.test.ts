import assert from 'node:assert/strict'
import test from 'node:test'

import { mapBrowserKeypress, mapGameKeyboardEvent } from './input-web.js'

test('mapBrowserKeypress normalizes Space aliases', () => {
  assert.deepEqual(mapBrowserKeypress({ key: ' ' }), { name: 'space', ctrl: false, meta: false })
  assert.deepEqual(mapBrowserKeypress({ key: 'Space' }), {
    name: 'space',
    ctrl: false,
    meta: false,
  })
  assert.deepEqual(mapBrowserKeypress({ key: 'Spacebar' }), {
    name: 'space',
    ctrl: false,
    meta: false,
  })
})

test('mapGameKeyboardEvent keeps ctrl/meta guard through browser mapping', () => {
  assert.deepEqual(mapGameKeyboardEvent({ key: 'r', ctrlKey: true }), {
    type: 'noop',
  })
  assert.deepEqual(mapGameKeyboardEvent({ key: 'q', metaKey: true }), {
    type: 'noop',
  })
})
