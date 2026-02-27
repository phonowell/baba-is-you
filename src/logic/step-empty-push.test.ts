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

test('step EMPTY IS PUSH can push emptiness onto non-push STAR', () => {
  const level: LevelData = {
    title: 'empty-push-onto-star',
    width: 8,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'star', 2, 0, false),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'is', 1, 1, true),
      createItem(5, 'you', 2, 1, true),
      createItem(6, 'empty', 4, 1, true),
      createItem(7, 'is', 5, 1, true),
      createItem(8, 'push', 6, 1, true),
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

test('step EMPTY IS PUSH can push emptiness onto non-push BELT', () => {
  const level: LevelData = {
    title: 'empty-push-onto-belt',
    width: 8,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'belt', 2, 0, false),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'is', 1, 1, true),
      createItem(5, 'you', 2, 1, true),
      createItem(6, 'empty', 4, 1, true),
      createItem(7, 'is', 5, 1, true),
      createItem(8, 'push', 6, 1, true),
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

test('step EMPTY IS PUSH blocks when emptiness cannot be displaced in bounds', () => {
  const level: LevelData = {
    title: 'empty-push-no-target',
    width: 7,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 1, true),
      createItem(3, 'is', 1, 1, true),
      createItem(4, 'you', 2, 1, true),
      createItem(5, 'empty', 4, 1, true),
      createItem(6, 'is', 5, 1, true),
      createItem(7, 'push', 6, 1, true),
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

test('step EMPTY IS PUSH displaces PUSH chain when moving through emptiness', () => {
  const level: LevelData = {
    title: 'empty-push-displaces-chain',
    width: 12,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 2, 0, false),
      createItem(3, 'star', 3, 0, false),
      createItem(4, 'baba', 0, 1, true),
      createItem(5, 'is', 1, 1, true),
      createItem(6, 'you', 2, 1, true),
      createItem(7, 'empty', 4, 1, true),
      createItem(8, 'is', 5, 1, true),
      createItem(9, 'push', 6, 1, true),
      createItem(10, 'rock', 8, 1, true),
      createItem(11, 'is', 9, 1, true),
      createItem(12, 'push', 10, 1, true),
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

  assert.equal(baba?.x, 1)
  assert.equal(baba?.y, 0)
  assert.equal(rock?.x, 3)
  assert.equal(rock?.y, 0)
})

test('step MOVE batch honors EMPTY IS PUSH through PUSH chain', () => {
  const level: LevelData = {
    title: 'empty-push-batch-chain',
    width: 12,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 2, 0, false),
      createItem(3, 'star', 3, 0, false),
      createItem(4, 'baba', 0, 1, true),
      createItem(5, 'is', 1, 1, true),
      createItem(6, 'move', 2, 1, true),
      createItem(7, 'empty', 4, 1, true),
      createItem(8, 'is', 5, 1, true),
      createItem(9, 'push', 6, 1, true),
      createItem(10, 'rock', 8, 1, true),
      createItem(11, 'is', 9, 1, true),
      createItem(12, 'push', 10, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(baba?.x, 1)
  assert.equal(baba?.y, 0)
  assert.equal(rock?.x, 3)
  assert.equal(rock?.y, 0)
})
