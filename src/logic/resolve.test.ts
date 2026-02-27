import assert from 'node:assert/strict'
import test from 'node:test'

import { applyTransforms } from './resolve.js'
import { createRuleRuntime } from './rule-runtime.js'

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

const runtimeFor = (
  items: LevelItem[],
  rules: Rule[],
  width: number,
  height: number,
) => createRuleRuntime(items, rules, width, height)

test('applyTransforms returns changed=false for identity transform', () => {
  const items = [createItem(1, 'baba', 1, 1, false)]
  const rules: Rule[] = [{ subject: 'baba', object: 'baba', kind: 'transform' }]

  const result = applyTransforms(items, runtimeFor(items, rules, 5, 5))

  assert.equal(result.changed, false)
  assert.deepEqual(result.items, items)
})

test('applyTransforms returns changed=true when target changes', () => {
  const items = [createItem(1, 'baba', 1, 1, false)]
  const rules: Rule[] = [{ subject: 'baba', object: 'rock', kind: 'transform' }]

  const result = applyTransforms(items, runtimeFor(items, rules, 5, 5))

  assert.equal(result.changed, true)
  assert.equal(result.items[0]?.name, 'rock')
})

test('applyTransforms keeps identity and appends non-identity target', () => {
  const items = [createItem(1, 'baba', 1, 1, false)]
  const rules: Rule[] = [
    { subject: 'baba', object: 'baba', kind: 'transform' },
    { subject: 'baba', object: 'rock', kind: 'transform' },
  ]

  const result = applyTransforms(items, runtimeFor(items, rules, 5, 5))
  const signatures = result.items
    .map((item) => `${item.isText ? '1' : '0'}:${item.name}`)
    .sort()

  assert.equal(result.changed, true)
  assert.deepEqual(signatures, ['0:baba', '0:rock'])
})

test('applyTransforms spawns objects for EMPTY IS noun', () => {
  const items = [createItem(1, 'wall', 0, 0, false)]
  const rules: Rule[] = [
    { subject: 'empty', object: 'baba', kind: 'transform' },
  ]

  const result = applyTransforms(items, runtimeFor(items, rules, 2, 1))

  assert.equal(result.changed, true)
  assert.equal(
    result.items.some(
      (item) => !item.isText && item.name === 'baba' && item.x === 1,
    ),
    true,
  )
})

test('applyTransforms does not drop HAS target when transform removes source', () => {
  const items = [createItem(1, 'baba', 1, 0, false)]
  const rules: Rule[] = [
    { subject: 'baba', object: 'empty', kind: 'transform' },
    { subject: 'baba', object: 'key', kind: 'has' },
  ]

  const result = applyTransforms(items, runtimeFor(items, rules, 3, 1))

  assert.equal(
    result.items.some((item) => item.name === 'baba'),
    false,
  )
  assert.equal(
    result.items.some(
      (item) => !item.isText && item.name === 'key' && item.x === 1,
    ),
    false,
  )
})

test('applyTransforms applies NOT transform constraints', () => {
  const items = [createItem(1, 'baba', 1, 0, false)]
  const rules: Rule[] = [
    { subject: 'baba', object: 'rock', kind: 'transform' },
    { subject: 'baba', object: 'rock', kind: 'transform', objectNegated: true },
  ]

  const result = applyTransforms(items, runtimeFor(items, rules, 3, 1))

  assert.equal(result.changed, false)
  assert.equal(result.items[0]?.name, 'baba')
})

test('applyTransforms applies NOT TEXT subject to non-text only', () => {
  const items = [
    createItem(1, 'baba', 1, 0, false),
    createItem(2, 'rock', 2, 0, true),
  ]
  const rules: Rule[] = [
    { subject: 'text', subjectNegated: true, object: 'key', kind: 'transform' },
  ]

  const result = applyTransforms(items, runtimeFor(items, rules, 4, 1))

  const baba = result.items.find((item) => item.id === 1)
  const textRock = result.items.find((item) => item.id === 2)

  assert.equal(baba?.name, 'key')
  assert.equal(baba.isText, false)
  assert.equal(textRock?.name, 'rock')
  assert.equal(textRock.isText, true)
})

test('applyTransforms supports ALL target by expanding into present object set', () => {
  const items = [
    createItem(1, 'baba', 1, 0, false),
    createItem(2, 'rock', 2, 0, false),
  ]
  const rules: Rule[] = [{ subject: 'baba', object: 'all', kind: 'transform' }]

  const result = applyTransforms(items, runtimeFor(items, rules, 4, 1))
  const rock = result.items.find(
    (item) => item.id !== 2 && item.name === 'rock',
  )

  assert.equal(result.changed, true)
  assert.equal(rock !== undefined, true)
})

test('applyTransforms supports LEVEL target as concrete object transform', () => {
  const items = [createItem(1, 'baba', 1, 0, false)]
  const rules: Rule[] = [
    { subject: 'baba', object: 'level', kind: 'transform' },
  ]

  const result = applyTransforms(items, runtimeFor(items, rules, 3, 1))

  assert.equal(result.changed, true)
  assert.equal(result.items[0]?.name, 'level')
  assert.equal(result.items[0].isText, false)
})
