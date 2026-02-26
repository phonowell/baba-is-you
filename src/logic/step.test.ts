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

test('step resolves OPEN and SHUT by removing both objects', () => {
  const level: LevelData = {
    title: 'open-shut',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'door', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'baba', 4, 0, true),
      createItem(7, 'is', 4, 1, true),
      createItem(8, 'open', 4, 2, true),
      createItem(9, 'door', 5, 0, true),
      createItem(10, 'is', 5, 1, true),
      createItem(11, 'shut', 5, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'door'),
    false,
  )
})

test('step spawns HAS target when source object is destroyed', () => {
  const level: LevelData = {
    title: 'has-spawn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'box', 1, 0, false),
      createItem(3, 'water', 2, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'box', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'push', 5, 2, true),
      createItem(10, 'box', 3, 1, true),
      createItem(11, 'has', 4, 1, true),
      createItem(12, 'key', 5, 1, true),
      createItem(13, 'water', 3, 0, true),
      createItem(14, 'is', 4, 0, true),
      createItem(15, 'sink', 5, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const key = result.state.items.find(
    (item) => !item.isText && item.name === 'key',
  )

  assert.equal(key?.x, 2)
  assert.equal(key?.y, 0)
})
