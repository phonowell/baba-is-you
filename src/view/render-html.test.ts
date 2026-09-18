import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'

import {
  renderReferenceLegendHtml,
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

test('reference legend marks syntax words', () => {
  const level = parseLevel('title Legend; size 2x1; Is 0,0; Baba 1,0')
  const state = createInitialState(level, 0)
  const output = renderReferenceLegendHtml(state)

  assert.match(output, /legend-text syntax[^>]*>IS<\/span>/)
  assert.match(output, /legend-text normal[^>]*>BABA<\/span>/)
})

test('reference legend skips hidden text entries', () => {
  const level = parseLevel(
    'title HideLegend; size 3x2; Baba 0,0; Text 0,1; Is 1,1; Hide 2,1',
  )
  const state = createInitialState(level, 0)
  const output = renderReferenceLegendHtml(state)

  assert.equal(output, '<li>(no text tiles)</li>')
})
