import assert from 'node:assert/strict'
import test from 'node:test'

import { emptyHasProp } from './empty.js'

import type { LevelItem, Rule } from './types.js'

const createItem = (
  id: number,
  name: string,
  x: number,
  y: number,
  isText: boolean,
): LevelItem => ({
  id,
  name,
  x,
  y,
  isText,
})

test('emptyHasProp applies conditional EMPTY property rules per empty cell', () => {
  const items = [createItem(1, 'rock', 1, 0, false)]
  const rules: Rule[] = [
    {
      subject: 'empty',
      object: 'you',
      kind: 'property',
      condition: { kind: 'near', object: 'rock' },
    },
  ]

  assert.equal(emptyHasProp(rules, 'you', items, 3, 1), true)
})

test('emptyHasProp does not treat unsatisfied EMPTY condition as global match', () => {
  const items = [createItem(1, 'rock', 1, 0, false)]
  const rules: Rule[] = [
    {
      subject: 'empty',
      object: 'you',
      kind: 'property',
      condition: { kind: 'on', object: 'rock' },
    },
  ]

  assert.equal(emptyHasProp(rules, 'you', items, 3, 1), false)
})
