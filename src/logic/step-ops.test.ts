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

test('step MAKE spawns target object on source each turn', () => {
  const level: LevelData = {
    title: 'make-spawn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'baba', 4, 2, true),
      createItem(6, 'make', 5, 2, true),
      createItem(7, 'rock', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const spawnedRock = result.state.items.find(
    (item) =>
      !item.isText && item.name === 'rock' && item.x === 1 && item.y === 0,
  )

  assert.equal(spawnedRock !== undefined, true)
})

test('step MAKE does not duplicate target when already present in source cell', () => {
  const level: LevelData = {
    title: 'make-no-duplicate',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 0, 0, false),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'make', 1, 1, true),
      createItem(5, 'rock', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const turn1 = step(state, null).state
  const turn2 = step(turn1, null).state
  const rockCount1 = turn1.items.filter(
    (item) => !item.isText && item.name === 'rock',
  ).length
  const rockCount2 = turn2.items.filter(
    (item) => !item.isText && item.name === 'rock',
  ).length

  assert.equal(rockCount1, 1)
  assert.equal(rockCount2, 1)
})

test('step EAT removes eaten targets and keeps eater', () => {
  const level: LevelData = {
    title: 'eat-interaction',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'baba', 4, 2, true),
      createItem(7, 'eat', 5, 2, true),
      createItem(8, 'rock', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'rock'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    true,
  )
})
