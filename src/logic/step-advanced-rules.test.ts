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

test('step pulls PULL objects from behind the mover', () => {
  const level: LevelData = {
    title: 'pull',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'rock', 0, 0, false),
      createItem(2, 'baba', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 4, 2, true),
      createItem(7, 'is', 5, 2, true),
      createItem(8, 'pull', 6, 2, true),
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

  assert.equal(baba?.x, 2)
  assert.equal(rock?.x, 1)
})

test('step shifts objects standing on SHIFT tiles', () => {
  const level: LevelData = {
    title: 'shift',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'belt', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'belt', 4, 2, true),
      createItem(7, 'is', 5, 2, true),
      createItem(8, 'shift', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 2)
})

test('step swaps mover with SWAP target', () => {
  const level: LevelData = {
    title: 'swap',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 4, 2, true),
      createItem(7, 'is', 5, 2, true),
      createItem(8, 'swap', 6, 2, true),
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
  assert.equal(rock?.x, 0)
})

test('step teleports across different TELE object types', () => {
  const level: LevelData = {
    title: 'tele-cross-type',
    width: 8,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'rock', 5, 0, false),
      createItem(4, 'baba', 0, 3, true),
      createItem(5, 'is', 1, 3, true),
      createItem(6, 'you', 2, 3, true),
      createItem(7, 'flag', 4, 3, true),
      createItem(8, 'is', 5, 3, true),
      createItem(9, 'tele', 6, 3, true),
      createItem(10, 'rock', 4, 2, true),
      createItem(11, 'is', 5, 2, true),
      createItem(12, 'tele', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 5)
  assert.equal(baba?.y, 0)
})

test('step applies NOT TEXT subject to all non-text objects', () => {
  const level: LevelData = {
    title: 'not-text-subject',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'not', 0, 0, true),
      createItem(2, 'text', 1, 0, true),
      createItem(3, 'is', 2, 0, true),
      createItem(4, 'you', 3, 0, true),
      createItem(5, 'baba', 0, 1, false),
      createItem(6, 'rock', 1, 1, false),
      createItem(7, 'wall', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)

  assert.equal(
    state.items
      .filter((item) => !item.isText)
      .every((item) => item.props.includes('you')),
    true,
  )
  assert.equal(
    state.items
      .filter((item) => item.isText)
      .some((item) => item.props.includes('you')),
    false,
  )
})
