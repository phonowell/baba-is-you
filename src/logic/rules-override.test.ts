import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectOverriddenTextIds,
  partitionRuleInstances,
} from './rules-override.js'
import { collectRuleInstances } from './rules.js'
import { collectRuleRuntime } from './rule-runtime.js'

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

// `NOT X IS NOT P` veto: `keke is push` is overridden because a
// negated-subject no-rule vetoes positive rules whose subject differs.
test('partition overrides positive rule vetoed by NOT subject rule', () => {
  const items = [
    createText(1, 'not', 0, 0),
    createText(2, 'baba', 1, 0),
    createText(3, 'is', 2, 0),
    createText(4, 'not', 3, 0),
    createText(5, 'push', 4, 0),
    createText(6, 'keke', 0, 1),
    createText(7, 'is', 1, 1),
    createText(8, 'push', 2, 1),
  ]
  const { active, overridden } = partitionRuleInstances(
    collectRuleInstances(items, 5, 2),
  )
  const activeKeys = active.map(
    ({ rule: r }) =>
      `${r.subjectNegated ? '!' : ''}${r.subject}:${r.objectNegated ? '!' : ''}${r.object}`,
  )
  const overriddenKeys = overridden.map(
    ({ rule: r }) => `${r.subject}:${r.object}`,
  )
  assert.deepEqual(overriddenKeys, ['keke:push'])
  assert.ok(activeKeys.includes('!baba:!push'))
})

// Same-subject veto: `baba is not push` overrides `baba is push`.
test('partition overrides same-subject rule vetoed by NOT predicate', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'push', 2, 0),
    createText(4, 'baba', 0, 1),
    createText(5, 'is', 1, 1),
    createText(6, 'not', 2, 1),
    createText(7, 'push', 3, 1),
  ]
  const { overridden } = partitionRuleInstances(
    collectRuleInstances(items, 4, 2),
  )
  assert.deepEqual(
    overridden.map(({ rule: r }) => `${r.subject}:${r.object}`),
    ['baba:push'],
  )
})

// `x is x` keeps itself active and suppresses other transforms on the
// same positive subject, matching the predecessor's `is_noun` veto.
test('partition keeps x-is-x active while overriding other transforms', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'baba', 2, 0),
    createText(4, 'baba', 0, 1),
    createText(5, 'is', 1, 1),
    createText(6, 'keke', 2, 1),
  ]
  const { active, overridden } = partitionRuleInstances(
    collectRuleInstances(items, 3, 2),
  )
  const activeKeys = active.map(({ rule: r }) => `${r.subject}:${r.object}`)
  assert.ok(activeKeys.includes('baba:baba'))
  assert.deepEqual(
    overridden.map(({ rule: r }) => `${r.subject}:${r.object}`),
    ['baba:keke'],
  )
})

// Text shared by an active and an overridden rule stays lit; only the
// purely-overridden cells get struck.
test('overridden text ids exclude cells shared with active rules', () => {
  // `baba is baba and keke`: `baba is baba` stays active and suppresses
  // `baba is keke` — only the keke cell is struck while baba/is/and
  // participate in the active rule.
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'baba', 2, 0),
    createText(4, 'and', 3, 0),
    createText(5, 'keke', 4, 0),
  ]
  const ids = collectOverriddenTextIds(items, 5, 1)
  assert.deepEqual([...ids], [5])
})

test('collectOverriddenTextIds marks full phrase of a vetoed rule', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'push', 2, 0),
    createText(4, 'baba', 0, 1),
    createText(5, 'is', 1, 1),
    createText(6, 'not', 2, 1),
    createText(7, 'push', 3, 1),
  ]
  const ids = collectOverriddenTextIds(items, 4, 2)
  assert.deepEqual([...ids].sort(), [1, 2, 3])
})

// The runtime must exclude overridden rules so vetoed text cannot act.
test('rule runtime excludes overridden rules from active buckets', () => {
  const items = [
    createText(1, 'baba', 0, 0),
    createText(2, 'is', 1, 0),
    createText(3, 'push', 2, 0),
    createText(4, 'baba', 0, 1),
    createText(5, 'is', 1, 1),
    createText(6, 'not', 2, 1),
    createText(7, 'push', 3, 1),
  ]
  const runtime = collectRuleRuntime(items, 4, 2)
  assert.deepEqual(
    runtime.buckets.isProperty.map(
      (r) => `${r.subject}:${r.objectNegated ? '!' : ''}${r.object}`,
    ),
    ['baba:!push'],
  )
})
