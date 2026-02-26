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

test('parity: YOU+WIN+DEFEAT on same object resolves to defeat first', () => {
  const level: LevelData = {
    title: 'parity-self-you-win-defeat',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'and', 3, 2, true),
      createItem(6, 'win', 4, 2, true),
      createItem(7, 'and', 5, 2, true),
      createItem(8, 'defeat', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')

  assert.equal(result.state.status, 'lose')
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
})

test('parity: sink interaction can cancel win when object also has YOU and WIN', () => {
  const level: LevelData = {
    title: 'parity-sink-over-win',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'win', 4, 2, true),
      createItem(8, 'and', 5, 2, true),
      createItem(9, 'sink', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')

  assert.equal(result.state.status, 'lose')
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'rock'),
    false,
  )
})

test('parity: object deleted by multiple causes still resolves HAS spawn once', () => {
  const level: LevelData = {
    title: 'parity-has-spawn-once',
    width: 10,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'sink', 4, 2, true),
      createItem(8, 'and', 5, 2, true),
      createItem(9, 'defeat', 6, 2, true),
      createItem(10, 'baba', 0, 1, true),
      createItem(11, 'has', 1, 1, true),
      createItem(12, 'key', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')

  const keys = result.state.items.filter(
    (item) => !item.isText && item.name === 'key',
  )
  assert.equal(keys.length, 1)
  assert.equal(keys[0]?.x, 1)
  assert.equal(keys[0]?.y, 0)
})

test('parity: open/shut pairing removes only min(open, shut) in one cell', () => {
  const level: LevelData = {
    title: 'parity-open-shut-min-pair',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'key', 1, 0, false),
      createItem(2, 'key', 1, 0, false),
      createItem(3, 'door', 1, 0, false),
      createItem(4, 'baba', 4, 0, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'key', 3, 2, true),
      createItem(9, 'is', 4, 2, true),
      createItem(10, 'open', 5, 2, true),
      createItem(11, 'door', 6, 2, true),
      createItem(12, 'is', 7, 2, true),
      createItem(13, 'shut', 8, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')

  const keyCount = result.state.items.filter(
    (item) => !item.isText && item.name === 'key',
  ).length
  const doorCount = result.state.items.filter(
    (item) => !item.isText && item.name === 'door',
  ).length
  assert.equal(keyCount, 1)
  assert.equal(doorCount, 0)
})
