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

test('step MOVE resolves opposite-direction PUSH movers in one batch', () => {
  const level: LevelData = {
    title: 'move-opposite-batch',
    width: 9,
    height: 4,
    items: [
      createItem(1, 'baba', 8, 0, false),
      { ...createItem(2, 'rock', 1, 0, false), dir: 'right' },
      { ...createItem(3, 'rock', 2, 0, false), dir: 'left' },
      createItem(4, 'baba', 0, 3, true),
      createItem(5, 'is', 1, 3, true),
      createItem(6, 'you', 2, 3, true),
      createItem(7, 'rock', 4, 3, true),
      createItem(8, 'is', 5, 3, true),
      createItem(9, 'move', 6, 3, true),
      createItem(10, 'and', 7, 3, true),
      createItem(11, 'push', 8, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rockA = result.state.items.find((item) => item.id === 2)
  const rockB = result.state.items.find((item) => item.id === 3)

  assert.equal(rockA?.x, 2)
  assert.equal(rockB?.x, 1)
})

test('step SHIFT resolves opposite-direction PUSH movers in one batch', () => {
  const level: LevelData = {
    title: 'shift-opposite-batch',
    width: 10,
    height: 4,
    items: [
      createItem(1, 'baba', 9, 0, false),
      { ...createItem(2, 'rock', 1, 0, false), dir: 'right' },
      { ...createItem(3, 'rock', 2, 0, false), dir: 'left' },
      { ...createItem(4, 'belt', 1, 0, false), dir: 'right' },
      { ...createItem(5, 'belt', 2, 0, false), dir: 'left' },
      createItem(6, 'baba', 0, 3, true),
      createItem(7, 'is', 1, 3, true),
      createItem(8, 'you', 2, 3, true),
      createItem(9, 'rock', 4, 3, true),
      createItem(10, 'is', 5, 3, true),
      createItem(11, 'push', 6, 3, true),
      createItem(12, 'belt', 7, 3, true),
      createItem(13, 'is', 8, 3, true),
      createItem(14, 'shift', 9, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rockA = result.state.items.find((item) => item.id === 2)
  const rockB = result.state.items.find((item) => item.id === 3)

  assert.equal(rockA?.x, 2)
  assert.equal(rockB?.x, 1)
})

test('step MOVE blocked on both sides keeps original dir', () => {
  const level: LevelData = {
    title: 'move-blocked-keep-dir',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 7, 0, false),
      { ...createItem(2, 'rock', 0, 0, false), dir: 'right' },
      createItem(3, 'wall', 1, 0, false),
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
  const rock = result.state.items.find((item) => item.id === 2)

  assert.equal(result.changed, false)
  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'right')
})

test('step SHIFT updates dir before movement even when blocked', () => {
  const level: LevelData = {
    title: 'shift-blocked-set-dir',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 7, 0, false),
      { ...createItem(2, 'rock', 0, 0, false), dir: 'right' },
      { ...createItem(3, 'belt', 0, 0, false), dir: 'left' },
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'belt', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'shift', 5, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => item.id === 2)

  assert.equal(result.changed, true)
  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'left')
})

test('step wins when same object has YOU and WIN', () => {
  const level: LevelData = {
    title: 'self-you-win',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'and', 3, 2, true),
      createItem(6, 'win', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'win')
})
