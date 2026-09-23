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
          : 'direction' in rule.condition
            ? `[facing:${rule.condition.negated ? '!' : ''}${rule.condition.direction}]`
            : !('object' in rule.condition)
              ? `[${rule.condition.negated ? '!' : ''}${rule.condition.kind}]`
              : `[${rule.condition.kind}:${rule.condition.negated ? '!' : ''}${rule.condition.object}]`
        return (
        `${rule.subjectNegated ? '!' : ''}${rule.subject}:${kind}:${
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

test('collectRules keeps LEVEL as HAS target noun', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'has', 1, 0),
    createText(3, 'level', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, ['baba:has:level'])
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

// Officially only type-0 noun words can open a sentence — property words
// (type 2) like `stop` fail at sentence start, so the rule never forms.
test('collectRules rejects a property word as subject', () => {
  const items = [
    createText(1, 'stop', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'wall', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, [])
})

// `not x` subjects match every non-x non-text item, so a bogus negated
// subject would transform the whole board — not just pollute the HUD.
test('collectRules rejects a NOT property word as subject', () => {
  const items = [
    createText(1, 'not', 0, 0),
    createText(2, 'stop', 1, 0),
    createText(3, 'is', 2, 0),
    createText(4, 'wall', 3, 0),
  ]

  const keys = toRuleKeys(items, 4, 1)

  assert.deepEqual(keys, [])
})

// A property conjunct kills the whole AND chain — officially the
// sentence dies at `stop` and `stop` itself can never start a sentence.
test('collectRules rejects a property conjunct in an AND subject chain', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'and', 1, 0),
    createText(3, 'stop', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, [])
})

// `is`/`write` are the only verbs whose object may be a property
// (official argtype {0,2}); every other verb takes nouns only ({0}).
test('collectRules keeps a property object after IS', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'stop', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, ['baba:property:stop'])
})

test('collectRules rejects a property object after HAS', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'has', 1, 0),
    createText(3, 'stop', 2, 0),
  ]

  const keys = toRuleKeys(items, 3, 1)

  assert.deepEqual(keys, [])
})
