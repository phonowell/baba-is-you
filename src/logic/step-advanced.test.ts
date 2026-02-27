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
test('step SLEEP blocks YOU movement', () => {
  const level: LevelData = {
    title: 'sleep-you-block',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'and', 3, 2, true),
      createItem(6, 'sleep', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 0)
  assert.equal(baba?.y, 0)
})

test('step LONELY condition requires sharing cell absence', () => {
  const level: LevelData = {
    title: 'lonely-condition',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 0, 0, false),
      createItem(3, 'lonely', 0, 2, true),
      createItem(4, 'baba', 1, 2, true),
      createItem(5, 'is', 2, 2, true),
      createItem(6, 'you', 3, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const blocked = step(state, 'right')
  const blockedBaba = blocked.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(blockedBaba?.x, 0)
  assert.equal(blockedBaba?.y, 0)
})

test('step keeps base rule when malformed FACING prefix appears before subject', () => {
  const level: LevelData = {
    title: 'facing-prefix-fallback',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'facing', 0, 1, true),
      createItem(3, 'baba', 1, 1, true),
      createItem(4, 'is', 2, 1, true),
      createItem(5, 'you', 3, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 1)
  assert.equal(baba?.y, 0)
})

test('step keeps base rule when malformed ON prefix appears before subject', () => {
  const level: LevelData = {
    title: 'on-prefix-fallback',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'on', 0, 1, true),
      createItem(3, 'baba', 1, 1, true),
      createItem(4, 'is', 2, 1, true),
      createItem(5, 'you', 3, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 1)
  assert.equal(baba?.y, 0)
})

test('step moves YOU objects in one direction without self-blocking order artifacts', () => {
  const level: LevelData = {
    title: 'you-column-simultaneous',
    width: 5,
    height: 6,
    items: [
      createItem(1, 'baba', 1, 1, false),
      createItem(2, 'baba', 1, 2, false),
      createItem(3, 'baba', 1, 3, false),
      createItem(4, 'baba', 0, 5, true),
      createItem(5, 'is', 1, 5, true),
      createItem(6, 'you', 2, 5, true),
      createItem(7, 'and', 3, 5, true),
      createItem(8, 'stop', 4, 5, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')
  const ys = result.state.items
    .filter((item) => !item.isText && item.name === 'baba')
    .map((item) => item.y)
    .sort((a, b) => a - b)

  assert.deepEqual(ys, [0, 1, 2])
})

test('step updates pushed MOVE object facing to push direction before MOVE phase', () => {
  const level: LevelData = {
    title: 'push-updates-move-facing',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'rock', 2, 3, false),
      createItem(2, 'baba', 2, 4, false),
      createItem(3, 'baba', 0, 5, true),
      createItem(4, 'is', 1, 5, true),
      createItem(5, 'you', 2, 5, true),
      createItem(6, 'rock', 2, 0, true),
      createItem(7, 'is', 3, 0, true),
      createItem(8, 'move', 4, 0, true),
      createItem(9, 'and', 5, 0, true),
      createItem(10, 'push', 6, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 2)
  assert.equal(rock?.y, 1)
  assert.equal(rock?.dir, 'up')
})
