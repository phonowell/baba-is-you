import assert from 'node:assert/strict'
import test from 'node:test'

import { levelHasWinCondition } from './level-admission.js'
import { parseLevel } from './parse-level.js'

test('levelHasWinCondition admits every win-like word', () => {
  for (const word of ['Win', 'End', 'Done']) {
    const level = parseLevel(
      `Title T;\nSize 3x3;\nBaba 0,0;\n${word} 1,1;\n`,
    )
    assert.equal(levelHasWinCondition(level), true, word)
  }
})

test('levelHasWinCondition rejects levels with no win-condition word', () => {
  const level = parseLevel(
    'Title T;\nSize 3x3;\nBaba 0,0;\nbaba 1,1;\nIs 0,1;\nYou 0,2;\n',
  )
  assert.equal(levelHasWinCondition(level), false)
})

test('levelHasWinCondition ignores a non-text win entity', () => {
  // A lowercase `win` is a unit, not a word — it can never open a rule.
  const level = parseLevel('Title T;\nSize 3x3;\nwin 0,0;\n')
  assert.equal(levelHasWinCondition(level), false)
})

test('levelHasWinCondition admits letter units able to spell a win word', () => {
  const level = parseLevel('Title T;\nSize 3x3;\nW 0,0;\nI 1,0;\nN 2,0;\n')
  assert.equal(levelHasWinCondition(level), true)
})

test('levelHasWinCondition rejects letters that cannot spell a win word', () => {
  const level = parseLevel('Title T;\nSize 3x3;\nA 0,0;\nB 1,0;\nW 2,0;\n')
  assert.equal(levelHasWinCondition(level), false)
})
