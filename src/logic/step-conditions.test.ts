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
test('step FALL drops until blocked in one turn', () => {
  const level: LevelData = {
    title: 'fall-phase',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 2, 0, false),
      createItem(2, 'baba', 0, 3, true),
      createItem(3, 'is', 1, 3, true),
      createItem(4, 'you', 2, 3, true),
      createItem(5, 'and', 3, 3, true),
      createItem(6, 'fall', 4, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 2)
  assert.equal(baba?.y, 2)
})

test('step MORE duplicates object into adjacent cells', () => {
  const level: LevelData = {
    title: 'more-phase',
    width: 5,
    height: 5,
    items: [
      createItem(1, 'baba', 2, 2, false),
      createItem(2, 'baba', 0, 4, true),
      createItem(3, 'is', 1, 4, true),
      createItem(4, 'you', 2, 4, true),
      createItem(5, 'and', 3, 4, true),
      createItem(6, 'more', 4, 4, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const babas = result.state.items.filter(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(babas.length, 5)
})

test('step ON condition grants property only while sharing cell with target', () => {
  const level: LevelData = {
    title: 'on-condition',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 0, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'on', 1, 2, true),
      createItem(5, 'rock', 2, 2, true),
      createItem(6, 'is', 3, 2, true),
      createItem(7, 'you', 4, 2, true),
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

test('step ON does not treat object itself as ON target', () => {
  const level: LevelData = {
    title: 'on-self-not-match',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 1, true),
      createItem(3, 'on', 1, 1, true),
      createItem(4, 'baba', 2, 1, true),
      createItem(5, 'is', 3, 1, true),
      createItem(6, 'you', 4, 1, true),
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

test('step NEAR condition includes objects in the same cell', () => {
  const level: LevelData = {
    title: 'near-same-cell',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 0, 0, false),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'near', 1, 1, true),
      createItem(5, 'rock', 2, 1, true),
      createItem(6, 'is', 3, 1, true),
      createItem(7, 'you', 4, 1, true),
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

test('step FACING condition checks only the adjacent front cell', () => {
  const level: LevelData = {
    title: 'facing-adjacent-only',
    width: 7,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 2, 0, false),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'facing', 1, 1, true),
      createItem(5, 'rock', 2, 1, true),
      createItem(6, 'is', 3, 1, true),
      createItem(7, 'you', 4, 1, true),
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

test('step FACING direction condition matches object direction', () => {
  const level: LevelData = {
    title: 'facing-direction-word',
    width: 6,
    height: 2,
    items: [
      { ...createItem(1, 'baba', 1, 0, false), dir: 'left' },
      createItem(2, 'baba', 0, 1, true),
      createItem(3, 'facing', 1, 1, true),
      createItem(4, 'left', 2, 1, true),
      createItem(5, 'is', 3, 1, true),
      createItem(6, 'you', 4, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'left')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 0)
  assert.equal(baba?.y, 0)
})
