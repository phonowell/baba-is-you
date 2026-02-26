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

test('step TELE uses board-order pad scan, not insertion order', () => {
  const level: LevelData = {
    title: 'tele-pad-order',
    width: 12,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 5, 0, false),
      createItem(3, 'flag', 1, 0, false),
      createItem(4, 'flag', 3, 0, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'flag', 9, 2, true),
      createItem(9, 'is', 10, 2, true),
      createItem(10, 'tele', 11, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 3)
  assert.equal(baba?.y, 0)
})

test('step TELE RNG matches official oorandom seed behavior on turn 0', () => {
  const level: LevelData = {
    title: 'tele-rng-turn0',
    width: 14,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 11, 0, false),
      createItem(3, 'flag', 1, 0, false),
      createItem(4, 'flag', 3, 0, false),
      createItem(5, 'flag', 9, 0, false),
      createItem(6, 'flag', 5, 0, false),
      createItem(7, 'flag', 7, 0, false),
      createItem(8, 'baba', 0, 2, true),
      createItem(9, 'is', 1, 2, true),
      createItem(10, 'you', 2, 2, true),
      createItem(11, 'flag', 11, 2, true),
      createItem(12, 'is', 12, 2, true),
      createItem(13, 'tele', 13, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 7)
  assert.equal(baba?.y, 0)
})

test('step does not win across different FLOAT layers', () => {
  const level: LevelData = {
    title: 'float-win-layer',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'flag', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'playing')
})

test('step wins on same FLOAT layer when both are FLOAT', () => {
  const level: LevelData = {
    title: 'float-win-same-layer',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'flag', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'win', 2, 1, true),
      createItem(11, 'and', 3, 1, true),
      createItem(12, 'float', 4, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'win')
})

test('step does not apply SINK across different FLOAT layers', () => {
  const level: LevelData = {
    title: 'float-sink-layer',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'water', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'water', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'sink', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    true,
  )
})
