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

test('step treats NOT property as exclusion instead of complement expansion', () => {
  const level: LevelData = {
    title: 'not-runtime',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'not', 0, 0, true),
      createItem(2, 'baba', 1, 0, true),
      createItem(3, 'is', 2, 0, true),
      createItem(4, 'you', 3, 0, true),
      createItem(5, 'baba', 4, 0, false),
      createItem(6, 'rock', 5, 0, false),
    ],
  }

  const state = createInitialState(level, 0)
  const baba = state.items.find((item) => !item.isText && item.name === 'baba')
  const rock = state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(baba?.props.includes('you'), false)
  assert.equal(rock?.props.includes('you'), true)
})

test('step blocks moving into PULL object from the front', () => {
  const level: LevelData = {
    title: 'pull-front-block',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 3, 2, true),
      createItem(7, 'is', 4, 2, true),
      createItem(8, 'pull', 5, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(baba?.x, 0)
  assert.equal(rock?.x, 1)
})

test('step does not auto-move objects with RIGHT unless they are MOVE', () => {
  const level: LevelData = {
    title: 'right-not-move',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 2, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 0, 1, true),
      createItem(7, 'is', 1, 1, true),
      createItem(8, 'right', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 2)
  assert.equal(rock?.y, 0)
})

test('step applies newly formed MOVE rule starting next turn', () => {
  const level: LevelData = {
    title: 'move-rule-next-turn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'rock', 0, 0, false),
      createItem(2, 'baba', 4, 1, false),
      createItem(3, 'rock', 0, 1, true),
      createItem(4, 'is', 1, 1, true),
      createItem(5, 'move', 3, 1, true),
      createItem(6, 'baba', 0, 2, true),
      createItem(7, 'is', 1, 2, true),
      createItem(8, 'you', 2, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'left')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 0)
  assert.equal(
    result.state.rules.some(
      (rule) =>
        rule.subject === 'rock' &&
        rule.kind === 'property' &&
        rule.object === 'move' &&
        !rule.subjectNegated &&
        !rule.objectNegated,
    ),
    true,
  )
})

test('step transforms after move phase, so transformed MOVE objects wait one turn', () => {
  const level: LevelData = {
    title: 'transform-after-move',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'baba', 0, 1, true),
      createItem(6, 'is', 1, 1, true),
      createItem(7, 'rock', 2, 1, true),
      createItem(8, 'rock', 6, 0, true),
      createItem(9, 'is', 6, 1, true),
      createItem(10, 'move', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 1)
  assert.equal(rock?.y, 0)
})
