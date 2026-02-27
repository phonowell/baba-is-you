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

const toRuleKeys = (
  items: LevelItem[],
  width: number,
  height: number,
): string[] =>
  collectRules(items, width, height)
    .map(
      (rule) => {
        const condition = !rule.condition
          ? ''
          : rule.condition.kind === 'lonely'
            ? `[${rule.condition.negated ? '!' : ''}lonely]`
            : `[${rule.condition.kind}:${
                rule.condition.objectNegated ? '!' : ''
              }${rule.condition.object}]`
        return (
        `${rule.subjectNegated ? '!' : ''}${rule.subject}:${rule.kind}:${
          rule.objectNegated ? '!' : ''
        }${rule.object}${condition}`
        )
      },
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

test('collectRules keeps valid object term when AND tail is dangling', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'you', 2, 0),
    createText(4, 'and', 3, 0),
  ]

  const keys = toRuleKeys(items, 4, 1)

  assert.deepEqual(keys, ['baba:property:you'])
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

test('collectRules supports MAKE operator', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'make', 1, 0),
    createText(3, 'rock', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, ['baba:make:rock'])
})

test('collectRules supports EAT operator', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'eat', 1, 0),
    createText(3, 'rock', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, ['baba:eat:rock'])
})

test('collectRules supports WRITE operator', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'write', 1, 0),
    createText(3, 'win', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, ['baba:write:win'])
})
