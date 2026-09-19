import assert from 'node:assert/strict'
import test from 'node:test'

import { statusLine } from './status-line.js'

test('statusLine win and lose hints mention undo', () => {
  assert.match(statusLine('win'), /U\/Z to undo/)
  assert.match(statusLine('lose'), /U\/Z to undo/)
})
