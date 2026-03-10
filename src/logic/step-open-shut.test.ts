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

test('step MOVE objects flip direction and retry on the same turn', () => {
  const level: LevelData = {
    title: 'move-flip-retry',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 5, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'wall', 2, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'rock', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'move', 5, 2, true),
      createItem(10, 'wall', 3, 1, true),
      createItem(11, 'is', 4, 1, true),
      createItem(12, 'stop', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'left')
})

test('step movement-phase OPEN/SHUT destruction still drops HAS targets', () => {
  const level: LevelData = {
    title: 'open-shut-has-drop',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'door', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'open', 4, 2, true),
      createItem(8, 'baba', 0, 1, true),
      createItem(9, 'has', 1, 1, true),
      createItem(10, 'key', 2, 1, true),
      createItem(11, 'door', 6, 0, true),
      createItem(12, 'is', 7, 0, true),
      createItem(13, 'shut', 8, 0, true),
      createItem(14, 'door', 6, 2, true),
      createItem(15, 'is', 7, 2, true),
      createItem(16, 'stop', 8, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const key = result.state.items.find(
    (item) => !item.isText && item.name === 'key',
  )

  assert.equal(key?.x, 0)
  assert.equal(key?.y, 0)
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'door'),
    false,
  )
})

test('step OPEN/SHUT destruction does not force blocked PUSH target to move', () => {
  const level: LevelData = {
    title: 'open-shut-do-not-force-push',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'door', 1, 0, false),
      createItem(3, 'rock', 1, 0, false),
      createItem(4, 'wall', 2, 0, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'and', 3, 2, true),
      createItem(9, 'open', 4, 2, true),
      createItem(10, 'door', 5, 2, true),
      createItem(11, 'is', 6, 2, true),
      createItem(12, 'shut', 7, 2, true),
      createItem(13, 'and', 3, 1, true),
      createItem(14, 'stop', 4, 1, true),
      createItem(15, 'rock', 5, 1, true),
      createItem(16, 'is', 6, 1, true),
      createItem(17, 'push', 7, 1, true),
      createItem(18, 'wall', 5, 0, true),
      createItem(19, 'is', 6, 0, true),
      createItem(20, 'stop', 7, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 1)
  assert.equal(rock?.y, 0)
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
})
