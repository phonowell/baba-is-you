import assert from 'node:assert/strict'
import test from 'node:test'

import { collectRules } from './rules.js'

import type { LevelItem } from './types.js'

const createText = (
  id: number,
  name: string,
  x: number,
  y: number,
): LevelItem => ({
  id,
  name,
  x,
  y,
  isText: true,
})

const toRuleKeys = (items: LevelItem[], width: number, height: number): string[] =>
  collectRules(items, width, height)
    .map(
      (rule) =>
        `${rule.subjectNegated ? '!' : ''}${rule.subject}:${rule.kind}:${
          rule.objectNegated ? '!' : ''
        }${rule.object}`,
    )
    .sort((a, b) => a.localeCompare(b))

test('collectRules supports AND on subject side', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'and', 1, 0),
    createText(3, 'rock', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you', 'rock:property:you'])
})

test('collectRules supports AND on object side', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'you', 2, 0),
    createText(4, 'and', 3, 0),
    createText(5, 'win', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:win', 'baba:property:you'])
})

test('collectRules creates cross product for subject/object AND chains', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'and', 1, 0),
    createText(3, 'rock', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
    createText(6, 'and', 5, 0),
    createText(7, 'win', 6, 0),
  ]

  const keys = toRuleKeys(items, 7, 1)

  assert.deepEqual(keys, [
    'baba:property:win',
    'baba:property:you',
    'rock:property:win',
    'rock:property:you',
  ])
})

test('collectRules supports HAS operator', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'has', 1, 0),
    createText(3, 'key', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, ['baba:has:key'])
})

test('collectRules expands NOT predicate for properties', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'not', 2, 0),
    createText(4, 'you', 3, 0),
  ]

  const keys = toRuleKeys(items, 4, 1)

  assert.equal(keys.includes('baba:property:!you'), true)
  assert.equal(keys.includes('baba:property:win'), false)
})

test('collectRules supports NOT on subject side', () => {
  const items = [
    createText(1, 'not', 0, 0),
    createText(2, 'baba', 1, 0),
    createText(3, 'is', 2, 0),
    createText(4, 'you', 3, 0),
  ]

  const keys = toRuleKeys(items, 4, 1)

  assert.deepEqual(keys, ['!baba:property:you'])
})


test('collectRules does not carry predicate list into following IS subject', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'and', 1, 0),
    createText(3, 'keke', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'rock', 4, 0),
    createText(6, 'and', 5, 0),
    createText(7, 'wall', 6, 0),
    createText(8, 'is', 7, 0),
    createText(9, 'door', 8, 0),
  ]

  const keys = toRuleKeys(items, 9, 1)

  assert.deepEqual(keys, [
    'baba:transform:rock',
    'baba:transform:wall',
    'keke:transform:rock',
    'keke:transform:wall',
    'wall:transform:door',
  ])
})
