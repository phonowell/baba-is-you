import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'

import {
  renderReferenceControlsHtml,
  renderReferenceRulesHtml,
} from './render-html.js'

test('reference rules list renders active rules', () => {
  const level = parseLevel(
    'title Dialog; size 3x1; Baba 0,0; Is 1,0; You 2,0; Flag 0,0; Is 1,0; Win 2,0',
  )
  const state = createInitialState(level, 0)
  const output = renderReferenceRulesHtml(state)

  assert.match(output, /<li>BABA IS YOU<\/li>/)
  assert.match(output, /<li>FLAG IS WIN<\/li>/)
})

test('reference controls list documents undo', () => {
  const output = renderReferenceControlsHtml()

  assert.match(output, /<kbd>U\/Z<\/kbd><span>undo<\/span>/)
})
