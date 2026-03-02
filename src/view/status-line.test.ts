import assert from 'node:assert/strict'
import test from 'node:test'

import { statusLine } from './status-line.js'

test('statusLine complete hint matches supported restart keys', () => {
  assert.equal(
    statusLine('complete'),
    'ALL LEVELS CLEARED! Press N/Enter (or R) to restart.',
  )
})
