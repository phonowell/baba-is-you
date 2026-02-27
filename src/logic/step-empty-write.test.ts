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
test('step EMPTY IS YOU does not auto-lose when no physical YOU object exists', () => {
  const level: LevelData = {
    title: 'empty-you-survive',
    width: 4,
    height: 3,
    items: [
      createItem(1, 'empty', 0, 2, true),
      createItem(2, 'is', 1, 2, true),
      createItem(3, 'you', 2, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'playing')
})

test('step WRITE spawns text target on source object each turn', () => {
  const level: LevelData = {
    title: 'write-spawn-text',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 1, true),
      createItem(3, 'write', 1, 1, true),
      createItem(4, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const winText = result.state.items.find(
    (item) =>
      item.isText && item.name === 'win' && item.x === 0 && item.y === 0,
  )

  assert.equal(winText !== undefined, true)
})

test('step WRITE does not duplicate same text target in one cell', () => {
  const level: LevelData = {
    title: 'write-no-duplicate',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'win', 0, 0, true),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'write', 1, 1, true),
      createItem(5, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const wins = result.state.items.filter(
    (item) =>
      item.isText && item.name === 'win' && item.x === 0 && item.y === 0,
  )

  assert.equal(wins.length, 1)
})

test('step WRITE-created rule affects interactions in the same turn', () => {
  const level: LevelData = {
    title: 'write-rule-same-turn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'skull', 0, 0, false),
      createItem(3, 'is', 1, 0, true),
      createItem(4, 'defeat', 2, 0, true),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'baba', 4, 2, true),
      createItem(9, 'write', 5, 2, true),
      createItem(10, 'skull', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)

  assert.equal(result.state.status, 'lose')
  assert.equal(
    result.state.items.some(
      (item) =>
        !item.isText && item.name === 'baba' && item.props.includes('you'),
    ),
    false,
  )
})
