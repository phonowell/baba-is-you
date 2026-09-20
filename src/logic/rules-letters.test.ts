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
      (rule) =>
        `${rule.subjectNegated ? '!' : ''}${rule.subject}:${
          rule.kind === 'is-property'
            ? 'property'
            : rule.kind === 'is-transform'
              ? 'transform'
              : rule.kind
        }:${rule.objectNegated ? '!' : ''}${rule.object}`,
    )
    .sort((a, b) => a.localeCompare(b))

test('letter run spells a noun subject: L O V E IS YOU', () => {
  const items = [
    createText(1, 'l', 0, 0),
    createText(2, 'o', 1, 0),
    createText(3, 'v', 2, 0),
    createText(4, 'e', 3, 0),
    createText(5, 'is', 4, 0),
    createText(6, 'you', 5, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 6, 1), ['love:property:you'])
})

test('letter run spells the object word: BABA IS M E', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'm', 2, 0),
    createText(4, 'e', 3, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 4, 1), ['baba:transform:me'])
})

test('letter run spells subject and object together: L O V E IS M E', () => {
  const items = [
    createText(1, 'l', 0, 0),
    createText(2, 'o', 1, 0),
    createText(3, 'v', 2, 0),
    createText(4, 'e', 3, 0),
    createText(5, 'is', 4, 0),
    createText(6, 'm', 5, 0),
    createText(7, 'e', 6, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 7, 1), ['love:transform:me'])
})

test('letter run spells an operator: BABA I S YOU', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'i', 1, 0),
    createText(3, 's', 2, 0),
    createText(4, 'you', 3, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 4, 1), ['baba:property:you'])
})

test('vertical letter run spells a word', () => {
  const items = [
    createText(1, 'm', 0, 0),
    createText(2, 'e', 0, 1),
    createText(3, 'is', 0, 2),
    createText(4, 'you', 0, 3),
  ]

  assert.deepEqual(toRuleKeys(items, 1, 4), ['me:property:you'])
})

test('a lone letter never forms a word', () => {
  const items = [
    createText(1, 'e', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'you', 2, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 3, 1), [])
})

test('letters do not join a run across a gap', () => {
  const items = [
    createText(1, 'm', 0, 0),
    createText(2, 'e', 2, 0),
    createText(3, 'is', 3, 0),
    createText(4, 'you', 4, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 5, 1), [])
})

test('letter runs only read along their own direction', () => {
  // Vertical run m/e next to a horizontal `is you` — `me` is vertical, so
  // the horizontal scan cannot read it as a subject.
  const items = [
    createText(1, 'm', 0, 0),
    createText(2, 'e', 0, 1),
    createText(3, 'is', 1, 0),
    createText(4, 'you', 2, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 3, 2), [])
})

test('a word needs the whole dictionary word: L O V is not a subject', () => {
  const items = [
    createText(1, 'l', 0, 0),
    createText(2, 'o', 1, 0),
    createText(3, 'v', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 5, 1), [])
})

test('overlapping words coexist: N O T spells `not` and `no`', () => {
  // `baba` `is` then n-o-t + `you` => baba is not you; the `no` substring
  // is a real dictionary word too and officially also parses.
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'n', 2, 0),
    createText(4, 'o', 3, 0),
    createText(5, 't', 4, 0),
    createText(6, 'you', 5, 0),
  ]

  assert.deepEqual(toRuleKeys(items, 6, 1), [
    'baba:property:!you',
    'baba:transform:no',
  ])
})
