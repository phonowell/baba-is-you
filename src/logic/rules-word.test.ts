import assert from 'node:assert/strict'
import test from 'node:test'

import { collectRuleRuntime } from './rule-runtime.js'
import { createInitialState } from './state.js'
import { step } from './step.js'

import type { Item, LevelData, LevelItem, Rule } from './types.js'

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

const createWordObject = (
  id: number,
  name: string,
  x: number,
  y: number,
): Item => ({
  id,
  name,
  x,
  y,
  isText: false,
  props: ['word'],
})

const ruleNames = (rules: readonly Rule[]): string[] =>
  rules.map(
    (rule) =>
      `${rule.subjectNegated ? 'not ' : ''}${rule.subject} is ${rule.object}`,
  )

// Official `findwordunits`: `x is word` spelled by a real `text_x` card
// marks the physical object as a word source, letting it spell further
// rules in the same fixpoint parse.
test('x is word from a text card lets the object spell its own rules', () => {
  const items: LevelItem[] = [
    createItem(1, 'belt', 0, 0, true),
    createItem(2, 'is', 1, 0, true),
    createItem(3, 'word', 2, 0, true),
    // The physical belt spells `belt is shift` once `belt is word` marks it.
    createItem(4, 'belt', 0, 1, false),
    createItem(5, 'is', 1, 1, true),
    createItem(6, 'shift', 2, 1, true),
  ]

  const rules = ruleNames(collectRuleRuntime(items, 8, 3).rules)
  assert.ok(rules.includes('belt is word'))
  assert.ok(rules.includes('belt is shift'))
})

// A `word`-prop object spelling the subject of its own `x is word` rule is
// unstable (rules.lua checkrecursion): with no `text_x`-sourced formation
// to rescue it, the rule is killed and the re-parse drops the word prop —
// taking every rule the object spelled down with it (level 222 Canister).
test('x is word spelled only by the word-object itself collapses', () => {
  const items: LevelItem[] = [
    createWordObject(1, 'belt', 0, 0),
    createItem(2, 'is', 1, 0, true),
    createItem(3, 'word', 2, 0, true),
    // `belt is shift` survives only while the belt keeps its word prop.
    createWordObject(4, 'belt', 0, 1),
    createItem(5, 'is', 1, 1, true),
    createItem(6, 'shift', 2, 1, true),
  ]

  const rules = ruleNames(collectRuleRuntime(items, 8, 3).rules)
  assert.ok(!rules.includes('belt is word'))
  assert.ok(!rules.includes('belt is shift'))
})

// A word-object-sourced formation survives while a parallel formation of
// the same rule cites a real `text_x` tile — the official rescue scan
// accepts any `text_x` id in the sibling rule's id list.
test('x is word stays alive while a text_x formation also spells it', () => {
  const items: LevelItem[] = [
    createItem(1, 'belt', 0, 0, true),
    createItem(2, 'is', 1, 0, true),
    createItem(3, 'word', 2, 0, true),
    createWordObject(4, 'belt', 0, 1),
    createItem(5, 'is', 1, 1, true),
    createItem(6, 'word', 2, 1, true),
  ]

  const rules = ruleNames(collectRuleRuntime(items, 8, 3).rules)
  assert.ok(rules.includes('belt is word'))
})

// The Canister (222) regression: pushing the `belt` card onto a shift belt
// leaves the physical belt as the only thing spelling `belt is word` —
// the unstable rule dies and `belt is shift` collapses with it, so the
// belt stops carrying the card away.
test('step: pushing the subject card off leaves no self-spelled word rule', () => {
  const level: LevelData = {
    title: 'unstable-word',
    width: 8,
    height: 8,
    items: [
      createItem(1, 'baba', 1, 1, false),
      createItem(2, 'belt', 2, 1, true),
      createItem(3, 'is', 3, 1, true),
      createItem(4, 'belt', 3, 1, false),
      createItem(5, 'word', 4, 1, true),
      createItem(6, 'baba', 1, 3, true),
      createItem(7, 'is', 2, 3, true),
      createItem(8, 'you', 3, 3, true),
      createItem(9, 'belt', 1, 5, false),
      createItem(10, 'is', 2, 5, true),
      createItem(11, 'shift', 3, 5, true),
    ],
  }
  level.items[3]!.dir = 'down'
  level.items[8]!.dir = 'down'

  const initial = createInitialState(level, 0)
  assert.ok(ruleNames(initial.rules).includes('belt is word'))
  assert.ok(ruleNames(initial.rules).includes('belt is shift'))

  // The push drops `text_belt` onto the downward belt, which immediately
  // carries it out of the sentence; the remaining `belt is word` is spelled
  // only by the physical belt unit and collapses.
  const after = step(initial, 'right').state
  const rules = ruleNames(after.rules)
  assert.ok(!rules.includes('belt is word'))
  assert.ok(!rules.includes('belt is shift'))
  assert.ok(rules.includes('baba is you'))
})
