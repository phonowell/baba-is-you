import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialState } from './state.js'
import { step } from './step.js'

import type { LevelData, LevelItem } from './types.js'

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
test('step does not report changed for blocked move with BABA IS BABA', () => {
  const level: LevelData = {
    title: 'identity-transform-blocked',
    width: 5,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'wall', 1, 0, false),
      createItem(3, 'wall', 0, 1, true),
      createItem(4, 'is', 1, 1, true),
      createItem(5, 'stop', 2, 1, true),
      createItem(6, 'baba', 0, 2, true),
      createItem(7, 'is', 1, 2, true),
      createItem(8, 'you', 2, 2, true),
      createItem(9, 'baba', 4, 0, true),
      createItem(10, 'is', 4, 1, true),
      createItem(11, 'baba', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.changed, false)
})

test('step sets status lose when all YOU are defeated', () => {
  const level: LevelData = {
    title: 'lose-on-defeat',
    width: 5,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'skull', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'skull', 0, 1, true),
      createItem(7, 'is', 1, 1, true),
      createItem(8, 'defeat', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'lose')
  assert.equal(
    result.state.items.some((item) => item.props.includes('you')),
    false,
  )
})

test('step preserves BABA IS YOU when trailing AND term is moved away', () => {
  const level: LevelData = {
    title: 'dangling-and-keeps-you',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 4, 1, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'sink', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'down')
  const babas = result.state.items.filter(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(result.state.status, 'playing')
  assert.equal(
    result.state.rules.some(
      (rule) =>
        rule.subject === 'baba' &&
        rule.kind === 'property' &&
        rule.object === 'you' &&
        !rule.subjectNegated &&
        !rule.objectNegated,
    ),
    true,
  )
  assert.equal(
    babas.every((item) => item.props.includes('you')),
    true,
  )
  assert.equal(
    babas.some((item) => item.props.includes('sink')),
    false,
  )
})

test('step auto-moves MOVE objects each turn', () => {
  const level: LevelData = {
    title: 'auto-move',
    width: 7,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'crab', 1, 1, false),
      createItem(3, 'baba', 0, 3, true),
      createItem(4, 'is', 1, 3, true),
      createItem(5, 'you', 2, 3, true),
      createItem(6, 'crab', 4, 3, true),
      createItem(7, 'is', 5, 3, true),
      createItem(8, 'move', 6, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const crab = result.state.items.find(
    (item) => !item.isText && item.name === 'crab',
  )

  assert.equal(crab?.x, 2)
  assert.equal(crab?.y, 1)
})

test('step supports wait turn without moving YOU', () => {
  const level: LevelData = {
    title: 'wait-turn',
    width: 7,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'crab', 1, 1, false),
      createItem(3, 'baba', 0, 3, true),
      createItem(4, 'is', 1, 3, true),
      createItem(5, 'you', 2, 3, true),
      createItem(6, 'crab', 4, 3, true),
      createItem(7, 'is', 5, 3, true),
      createItem(8, 'move', 6, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const crab = result.state.items.find(
    (item) => !item.isText && item.name === 'crab',
  )

  assert.equal(result.changed, true)
  assert.equal(baba?.x, 0)
  assert.equal(baba?.y, 0)
  assert.equal(crab?.x, 2)
  assert.equal(crab?.y, 1)
})
