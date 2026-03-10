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
        const kind =
          rule.kind === 'is-property'
            ? 'property'
            : rule.kind === 'is-transform'
              ? 'transform'
              : rule.kind
        const condition = !rule.condition
          ? ''
          : rule.condition.kind === 'lonely'
            ? `[${rule.condition.negated ? '!' : ''}lonely]`
            : 'direction' in rule.condition
              ? `[facing:${rule.condition.negated ? '!' : ''}${rule.condition.direction}]`
              : `[${rule.condition.kind}:${rule.condition.negated ? '!' : ''}${rule.condition.object}]`
        return (
        `${rule.subjectNegated ? '!' : ''}${rule.subject}:${kind}:${
          rule.objectNegated ? '!' : ''
        }${rule.object}${condition}`
        )
      },
    )
    .sort((a, b) => a.localeCompare(b))

test('collectRules supports ON condition before IS', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'on', 1, 0),
    createText(3, 'rock', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you[on:rock]'])
})

test('collectRules keeps LEVEL as ON condition target noun', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'on', 1, 0),
    createText(3, 'level', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you[on:level]'])
})

test('collectRules keeps ALL as FACING condition target noun', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'facing', 1, 0),
    createText(3, 'all', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you[facing:all]'])
})

test('collectRules supports LONELY and NOT LONELY conditions', () => {
  const items = [
    createText(1, 'lonely', 0, 0),
    createText(2, 'baba', 1, 0),
    createText(3, 'is', 2, 0),
    createText(4, 'you', 3, 0),
    createText(5, 'not', 0, 1),
    createText(6, 'lonely', 1, 1),
    createText(7, 'keke', 2, 1),
    createText(8, 'is', 3, 1),
    createText(9, 'win', 4, 1),
  ]

  const keys = toRuleKeys(items, 5, 2)

  assert.deepEqual(keys, ['baba:property:you[lonely]', 'keke:property:win[!lonely]'])
})

test('collectRules supports NOT NOT LONELY as non-negated lonely', () => {
  const items = [
    createText(1, 'not', 0, 0),
    createText(2, 'not', 1, 0),
    createText(3, 'lonely', 2, 0),
    createText(4, 'baba', 3, 0),
    createText(5, 'is', 4, 0),
    createText(6, 'you', 5, 0),
  ]

  const keys = toRuleKeys(items, 6, 1)

  assert.deepEqual(keys, ['baba:property:you[lonely]'])
})

test('collectRules supports FACING condition before IS', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'facing', 1, 0),
    createText(3, 'rock', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you[facing:rock]'])
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
