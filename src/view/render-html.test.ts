import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'

import { renderHtml } from './render-html.js'

test('renderHtml uses CSS background for empty slots without dom nodes', () => {
  const level = parseLevel('title Empty; size 2x1; Baba 0,0')
  const state = createInitialState(level, 0)

  const output = renderHtml(state)

  assert.doesNotMatch(output, /class="cell/)
  assert.doesNotMatch(output, /<span class="value">\.<\/span>/)
})

test('renderHtml emits board container with board dimensions', () => {
  const level = parseLevel('title Board; size 3x2; Baba 0,0')
  const state = createInitialState(level, 0)
  const output = renderHtml(state)

  assert.match(
    output,
    /class="board" role="grid" style="--board-width:3;--board-height:2;"/,
  )
})

test('renderHtml puts rules and legend into reference dialog', () => {
  const level = parseLevel(
    'title Dialog; size 3x1; Baba 0,0; Is 1,0; You 2,0; Flag 0,0; Is 1,0; Win 2,0',
  )
  const state = createInitialState(level, 0)

  const closedOutput = renderHtml(state)
  const openedOutput = renderHtml(state, { showReferenceDialog: true })

  assert.match(closedOutput, /data-action="toggle-reference"/)
  assert.match(closedOutput, /data-role="reference-backdrop" hidden/)
  assert.match(openedOutput, /data-role="reference-backdrop"[^>]*>/)
  assert.doesNotMatch(openedOutput, /data-role="reference-backdrop" hidden/)
  assert.match(openedOutput, /Rules & Legend/)
})

test('renderHtml marks syntax words in legend', () => {
  const level = parseLevel('title Legend; size 2x1; Is 0,0; Baba 1,0')
  const state = createInitialState(level, 0)
  const output = renderHtml(state, { showReferenceDialog: true })

  assert.match(output, /legend-text syntax[^>]*>IS<\/span>/)
  assert.match(output, /legend-text normal[^>]*>BABA<\/span>/)
})

test('renderHtml legend skips hidden text entries', () => {
  const level = parseLevel(
    'title HideLegend; size 3x2; Baba 0,0; Text 0,1; Is 1,1; Hide 2,1',
  )
  const state = createInitialState(level, 0)
  const output = renderHtml(state, { showReferenceDialog: true })

  assert.doesNotMatch(output, /legend-text normal[^>]*>BABA<\/span>/)
})
