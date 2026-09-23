import assert from 'node:assert/strict'
import test from 'node:test'

import { collectRuleInstances, collectRules } from './rules.js'

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
              : `[${rule.condition.negated ? '!' : ''}${rule.condition.kind}:${'objectNegated' in rule.condition && rule.condition.objectNegated ? '!' : ''}${rule.condition.object}]`
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

// `x not on y`: the `not` directly ahead of the condition word negates
// the condition itself — "fire that is not on a skull" (official TUNNEL
// rule), not "anything-but-fire on a skull".
test('collectRules binds NOT before a condition word to the condition', () => {
  const items = [
    createText(1, 'fire', 0, 0),
    createText(2, 'not', 1, 0),
    createText(3, 'on', 2, 0),
    createText(4, 'skull', 3, 0),
    createText(5, 'is', 4, 0),
    createText(6, 'defeat', 5, 0),
  ]

  const keys = toRuleKeys(items, 6, 1)

  assert.deepEqual(keys, ['fire:property:defeat[!on:skull]'])
})

// `x on not y`: `not` after the condition word negates the object —
// the unit must stand on a non-skull thing, which differs from "not on
// skull" (true while standing on nothing at all).
test('collectRules binds NOT after a condition word to its object', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'on', 1, 0),
    createText(3, 'not', 2, 0),
    createText(4, 'skull', 3, 0),
    createText(5, 'is', 4, 0),
    createText(6, 'win', 5, 0),
  ]

  const keys = toRuleKeys(items, 6, 1)

  assert.deepEqual(keys, ['baba:property:win[on:!skull]'])
})

// Infix conditions other than `feeling` officially take noun parameters
// (argtype {0}) — `stop` fails, and since a property word can never
// start its own sentence the whole phrase dies.
test('collectRules rejects a property word as condition object', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'on', 1, 0),
    createText(3, 'stop', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, [])
})

// `feeling` is the infix condition whose parameter is a property word
// (official argtype {2}).
test('collectRules accepts a property parameter for FEELING', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'feeling', 1, 0),
    createText(3, 'stop', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you[feeling:stop]'])
})

// `feeling` rejects nouns; officially the failed parameter reparses as
// its own sentence start, so `baba feeling keke is you` still yields
// `keke is you`.
test('collectRules reparses a noun after FEELING as a new sentence', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'feeling', 1, 0),
    createText(3, 'keke', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['keke:property:you'])
})

// `facing` officially accepts direction names on top of noun objects
// (argtype {0} + argextra right/up/left/down).
test('collectRules accepts a direction parameter for FACING', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'facing', 1, 0),
    createText(3, 'right', 2, 0),
    createText(4, 'is', 3, 0),
    createText(5, 'you', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, ['baba:property:you[facing:right]'])
})

// Postfix conditions still demand a noun subject — `lonely stop is you`
// officially dies at `stop`.
test('collectRules rejects a property subject before a postfix condition', () => {
  const items = [
    createText(1, 'lonely', 0, 0),
    createText(2, 'stop', 1, 0),
    createText(3, 'is', 2, 0),
    createText(4, 'you', 3, 0),
  ]

  const keys = toRuleKeys(items, 4, 1)

  assert.deepEqual(keys, [])
})

// `{cond|noun} noun is prop` with no subject ahead of the condition
// cell: the dead stacked word's resume and the failed condition parse
// land on the same sentence, and official `finals` dedupes identical
// unit-id sequences — the bare rule is emitted once. Multiplicity is
// behaviour (stacked `is move`/`is shift` count), so the count matters.
test('collectRuleInstances emits a subjectless dead-word promotion only once', () => {
  const items = [
    createText(1, 'near', 0, 0),
    createText(2, 'keke', 0, 0),
    createText(3, 'keke', 1, 0),
    createText(4, 'is', 2, 0),
    createText(5, 'push', 3, 0),
  ]

  const matches = collectRuleInstances(items, 4, 1).filter(
    (instance) =>
      instance.rule.subject === 'keke' &&
      !instance.rule.subjectNegated &&
      instance.rule.kind === 'is-property' &&
      instance.rule.object === 'push' &&
      !instance.rule.objectNegated &&
      instance.rule.condition === undefined,
  )

  assert.equal(matches.length, 1)
})

// The same stacked dead word behind a real subject keeps its promotion:
// the failed `keke` variant resumes on the would-be condition object and
// emits its own bare rule alongside the conditional one.
test('collectRules keeps dead-word promotion beside a real subject', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'near', 1, 0),
    createText(3, 'keke', 1, 0),
    createText(4, 'keke', 2, 0),
    createText(5, 'is', 3, 0),
    createText(6, 'push', 4, 0),
  ]

  const keys = toRuleKeys(items, 5, 1)

  assert.deepEqual(keys, [
    'baba:property:push[near:keke]',
    'keke:property:push',
  ])
})
