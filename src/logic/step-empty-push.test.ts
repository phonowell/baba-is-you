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

test('step conditional EMPTY IS PUSH only applies where its condition holds', () => {
  // BABA THE CONDUCTOR regression: `empty near rock is push` used to mark
  // EVERY empty cell pushable (the resolver returned a board-wide union),
  // so walking into any empty ran a push chain that died at the board
  // edge and locked all movement. Officially each empty cell is its own
  // pseudo-unit — only cells beside the rock push.
  const level: LevelData = {
    title: 'empty-push-near-rock',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 1, false),
      createItem(2, 'rock', 8, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'empty', 4, 2, true),
      createItem(7, 'near', 5, 2, true),
      createItem(8, 'rock', 6, 2, true),
      createItem(9, 'is', 7, 2, true),
      createItem(10, 'push', 8, 2, true),
    ],
  }

  const babaAt = (items: LevelItem[]) =>
    items.find((item) => !item.isText && item.name === 'baba')

  // Far from the rock every empty is a plain cell — free movement.
  let state = createInitialState(level, 0)
  for (let i = 0; i < 6; i += 1) state = step(state, 'right').state
  assert.equal(babaAt(state.items)?.x, 6)

  // Cells 7,1/8,1 flank the rock — both pushable empties, so the push
  // chain runs off the board edge and the move is blocked.
  state = step(state, 'right').state
  assert.equal(babaAt(state.items)?.x, 6)
})

test('step EMPTY YOU+WIN requires both props on the same empty cell', () => {
  // Officially `empty is win` + `empty is you` wins because each empty
  // pseudo-unit holds both props at once. With conditional rules the
  // props can live on disjoint cells — then nothing carries both.
  const level: LevelData = {
    title: 'empty-conditional-win',
    width: 7,
    height: 4,
    items: [
      createItem(1, 'rock', 0, 0, false),
      createItem(2, 'skull', 6, 0, false),
      createItem(3, 'empty', 0, 2, true),
      createItem(4, 'near', 1, 2, true),
      createItem(5, 'rock', 2, 2, true),
      createItem(6, 'is', 3, 2, true),
      createItem(7, 'win', 4, 2, true),
      createItem(8, 'empty', 0, 3, true),
      createItem(9, 'near', 1, 3, true),
      createItem(10, 'skull', 2, 3, true),
      createItem(11, 'is', 3, 3, true),
      createItem(12, 'you', 4, 3, true),
    ],
  }

  const disjoint = step(createInitialState(level, 0), 'right')
  assert.equal(disjoint.state.status, 'playing')

  const everywhere: LevelData = {
    title: 'empty-everywhere-win',
    width: 4,
    height: 3,
    items: [
      createItem(1, 'empty', 0, 1, true),
      createItem(2, 'is', 1, 1, true),
      createItem(3, 'you', 2, 1, true),
      createItem(4, 'empty', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'win', 2, 2, true),
    ],
  }

  const merged = step(createInitialState(everywhere, 0), 'right')
  assert.equal(merged.state.status, 'win')
})
