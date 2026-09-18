import assert from 'node:assert/strict'
import test from 'node:test'

import { statusLine } from './status-line.js'

test('statusLine complete hint matches supported restart keys', () => {
  assert.equal(
    statusLine('complete'),
    'ALL LEVELS CLEARED! Press N/Enter (or R) to restart, U to undo.',
  )
})

test('statusLine win and lose hints mention undo', () => {
  assert.match(statusLine('win'), /U to undo/)
  assert.match(statusLine('lose'), /U to undo/)
})
