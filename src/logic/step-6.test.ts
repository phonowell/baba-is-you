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

test('step TELE requires matching FLOAT layer with TELE source', () => {
  const level: LevelData = {
    title: 'tele-float-layer',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'flag', 5, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'and', 3, 2, true),
      createItem(8, 'float', 4, 2, true),
      createItem(9, 'flag', 5, 2, true),
      createItem(10, 'is', 6, 2, true),
      createItem(11, 'tele', 7, 2, true),
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

test('step SHIFT uses shifter dir before UP/DOWN/LEFT/RIGHT rotate phase', () => {
  const level: LevelData = {
    title: 'shift-before-rotate',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'belt', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'belt', 3, 2, true),
      createItem(7, 'is', 4, 2, true),
      createItem(8, 'shift', 5, 2, true),
      createItem(9, 'belt', 3, 1, true),
      createItem(10, 'is', 4, 1, true),
      createItem(11, 'up', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 2)
  assert.equal(baba?.y, 0)
})

test('step removes WEAK YOU when blocked during movement', () => {
  const level: LevelData = {
    title: 'weak-blocked-you',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'wall', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'weak', 4, 2, true),
      createItem(8, 'wall', 3, 1, true),
      createItem(9, 'is', 4, 1, true),
      createItem(10, 'stop', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
  assert.equal(result.state.status, 'lose')
})

test('step keeps WEAK MOVE object when blocked', () => {
  const level: LevelData = {
    title: 'weak-move-blocked',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 6, 0, false),
      { ...createItem(2, 'rock', 0, 0, false), dir: 'right' },
      createItem(3, 'wall', 1, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'rock', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'move', 5, 2, true),
      createItem(10, 'rock', 3, 1, true),
      createItem(11, 'is', 4, 1, true),
      createItem(12, 'weak', 5, 1, true),
      createItem(13, 'wall', 3, 0, true),
      createItem(14, 'is', 4, 0, true),
      createItem(15, 'stop', 5, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'right')
})

test('step removes WEAK object when sharing a cell', () => {
  const level: LevelData = {
    title: 'weak-occupied',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'weak', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'rock'),
    true,
  )
})
