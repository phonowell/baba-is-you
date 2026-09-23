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

test('step SHIFT uses updated shifter dir within same cell chain', () => {
  const level: LevelData = {
    title: 'shift-shifter-dir-cascade',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 7, 0, false),
      { ...createItem(2, 'belt', 1, 0, false), dir: 'right' },
      { ...createItem(3, 'belt', 1, 0, false), dir: 'left' },
      createItem(4, 'wall', 2, 0, false),
      createItem(10, 'baba', 0, 2, true),
      createItem(11, 'is', 1, 2, true),
      createItem(12, 'you', 2, 2, true),
      createItem(13, 'belt', 3, 2, true),
      createItem(14, 'is', 4, 2, true),
      createItem(15, 'shift', 5, 2, true),
      createItem(16, 'wall', 3, 1, true),
      createItem(17, 'is', 4, 1, true),
      createItem(18, 'stop', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const beltA = result.state.items.find((item) => item.id === 2)
  const beltB = result.state.items.find((item) => item.id === 3)

  assert.equal(beltA?.x, 1)
  assert.equal(beltA?.dir, 'right')
  assert.equal(beltB?.x, 1)
  assert.equal(beltB?.dir, 'right')
})

test('step SHIFT chains through a queued stop object', () => {
  // Officially a shift mover blocked by a queued obstacle escalates and
  // re-checks once the obstacle's own move has drained; the obstacle is
  // then transparent and the whole column advances together.
  const level: LevelData = {
    title: 'shift-stop-chain',
    width: 3,
    height: 6,
    items: [
      { ...createItem(1, 'belt', 1, 1, false), dir: 'down' },
      createItem(2, 'cloud', 1, 1, false),
      { ...createItem(3, 'belt', 1, 2, false), dir: 'down' },
      createItem(4, 'cloud', 1, 2, false),
      createItem(10, 'belt', 0, 4, true),
      createItem(11, 'is', 1, 4, true),
      createItem(12, 'shift', 2, 4, true),
      createItem(13, 'cloud', 0, 5, true),
      createItem(14, 'is', 1, 5, true),
      createItem(15, 'stop', 2, 5, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const cloudA = result.state.items.find((item) => item.id === 2)
  const cloudB = result.state.items.find((item) => item.id === 4)

  assert.equal(cloudA?.y, 2)
  assert.equal(cloudB?.y, 3)
})

test('step SHIFT treats a prop-free queued occupant as transparent', () => {
  // A `you` unit with no push/stop/pull contributes nothing to the
  // obstacle verdict — a shift mover enters its cell even while the
  // occupant's own move is still unresolved.
  const level: LevelData = {
    title: 'shift-propfree-occupant',
    width: 3,
    height: 7,
    items: [
      { ...createItem(1, 'belt', 1, 1, false), dir: 'down' },
      createItem(2, 'cloud', 1, 1, false),
      { ...createItem(3, 'belt', 1, 2, false), dir: 'down' },
      createItem(4, 'me', 1, 2, false),
      createItem(5, 'wall', 1, 3, false),
      createItem(10, 'belt', 0, 4, true),
      createItem(11, 'is', 1, 4, true),
      createItem(12, 'shift', 2, 4, true),
      createItem(13, 'me', 0, 5, true),
      createItem(14, 'is', 1, 5, true),
      createItem(15, 'you', 2, 5, true),
      createItem(16, 'wall', 0, 6, true),
      createItem(17, 'is', 1, 6, true),
      createItem(18, 'stop', 2, 6, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const cloud = result.state.items.find((item) => item.id === 2)
  const me = result.state.items.find((item) => item.id === 4)

  assert.equal(cloud?.y, 2)
  assert.equal(me?.y, 2)
})

test('step SHIFT does not carry items on a different FLOAT layer', () => {
  const level: LevelData = {
    title: 'shift-float-layer',
    width: 6,
    height: 6,
    items: [
      { ...createItem(1, 'belt', 1, 0, false), dir: 'right' },
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'up', 1, 0, true),
      createItem(4, 'baba', 0, 0, false),
      createItem(10, 'baba', 0, 2, true),
      createItem(11, 'is', 1, 2, true),
      createItem(12, 'you', 2, 2, true),
      createItem(13, 'belt', 0, 3, true),
      createItem(14, 'is', 1, 3, true),
      createItem(15, 'shift', 2, 3, true),
      createItem(16, 'text', 0, 4, true),
      createItem(17, 'is', 1, 4, true),
      createItem(18, 'float', 2, 4, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const rock = result.state.items.find((item) => item.id === 2)
  const floatingText = result.state.items.find((item) => item.id === 3)

  assert.equal(rock?.x, 2)
  assert.equal(rock?.dir, 'right')
  assert.equal(floatingText?.x, 1)
  assert.equal(floatingText?.dir, undefined)
})

test('step SHIFT push chains inherit the shift dodge across queued belts', () => {
  // Regression for level 197 (Ab): a unit shifted left off its belt pushes
  // a text chain whose tail lands on a cell vacated by another belt's
  // downward shift in the same batch. Officially dopush propagates
  // reason="shift" down the push chain, so each pushed unit's own check
  // dodges the queued destination; without it the chain locks solid.
  const level: LevelData = {
    title: 'shift-cross-belts',
    width: 24,
    height: 14,
    items: [
      { ...createItem(1, 'baba', 3, 6, false), dir: 'down' },
      { ...createItem(2, 'belt', 3, 7, false), dir: 'down' },
      createItem(3, 'ab', 3, 8, true),
      createItem(4, 'a', 3, 9, true),
      createItem(5, 'wall', 1, 9, false),
      createItem(6, 'b', 2, 9, true),
      createItem(7, 'b', 4, 9, true),
      createItem(8, 'a', 5, 9, true),
      createItem(9, 'is', 6, 9, true),
      createItem(10, 'you', 7, 9, true),
      createItem(11, 'is', 8, 9, true),
      { ...createItem(12, 'belt', 8, 9, false), dir: 'left' },
      { ...createItem(13, 'belt', 6, 7, false), dir: 'down' },
      createItem(14, 'belt', 6, 7, true),
      createItem(15, 'hot', 6, 8, true),
      createItem(16, 'wall', 6, 10, false),
      createItem(17, 'wall', 7, 10, false),
      createItem(20, 'baba', 12, 1, true),
      createItem(21, 'is', 13, 1, true),
      createItem(22, 'you', 14, 1, true),
      createItem(23, 'belt', 12, 2, true),
      createItem(24, 'is', 13, 2, true),
      createItem(25, 'shift', 14, 2, true),
      createItem(29, 'text', 12, 3, true),
      createItem(30, 'is', 13, 3, true),
      createItem(31, 'push', 14, 3, true),
      createItem(32, 'wall', 12, 4, true),
      createItem(33, 'is', 13, 4, true),
      createItem(34, 'stop', 14, 4, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'down')
  const at = (name: string, x: number, y: number) =>
    result.state.items.some((item) => item.name === name && item.x === x && item.y === y)

  // The down-belt chain lands baba on 3,8 and pushes ab/a down to
  // 3,9/3,10; the left-belt chain carries the whole row-9 text chain one
  // cell left, its tail (b) stacking onto the just-arrived ab.
  assert.ok(at('baba', 3, 8))
  assert.ok(at('ab', 3, 9))
  assert.ok(at('b', 3, 9))
  assert.ok(at('a', 4, 9))
  assert.ok(at('is', 5, 9))
  assert.ok(at('you', 6, 9))
  assert.ok(at('is', 7, 9))
  assert.ok(at('belt', 6, 8))
  assert.ok(at('hot', 6, 9))
})
