import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'

import { getBoardEntities, renderHtml } from './render-html.js'

test('getBoardEntities uses full text words instead of 2-letter abbreviations', () => {
  const level = parseLevel('title Full; size 1x1; Defeat 0,0')
  const state = createInitialState(level, 0)

  const entities = getBoardEntities(state)

  assert.equal(entities.length, 1)
  assert.equal(entities[0]?.value, 'DEFEAT')
})

test('renderHtml uses CSS background for empty slots without dom nodes', () => {
  const level = parseLevel('title Empty; size 2x1; Baba 0,0')
  const state = createInitialState(level, 0)

  const output = renderHtml(state)

  assert.doesNotMatch(output, /class="cell/)
  assert.doesNotMatch(output, /<span class="value">\.<\/span>/)
})

test('getBoardEntities returns only occupied cells', () => {
  const level = parseLevel('title Empty; size 2x1; Baba 0,0')
  const state = createInitialState(level, 0)

  const entities = getBoardEntities(state)

  assert.equal(entities.length, 1)
  assert.equal(entities[0]?.x, 0)
  assert.equal(entities[0]?.y, 0)
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

test('getBoardEntities marks only 3-letter text with three class', () => {
  const level = parseLevel('title TextSize; size 2x1; You 0,0; Push 1,0')
  const state = createInitialState(level, 0)

  const entities = getBoardEntities(state)
  const you = entities.find((entity) => entity.value === 'YOU')
  const push = entities.find((entity) => entity.value === 'PUSH')

  assert.ok(you)
  assert.ok(push)
  assert.match(you.className, / three/)
  assert.doesNotMatch(push.className, / three/)
})
