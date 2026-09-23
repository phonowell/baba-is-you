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

test('step defeats YOU even when DEFEAT is on the same object', () => {
  const level: LevelData = {
    title: 'self-you-defeat',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'and', 3, 2, true),
      createItem(6, 'defeat', 4, 2, true),
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

test('step melts object when HOT and MELT are on the same object', () => {
  const level: LevelData = {
    title: 'self-hot-melt',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'baba', 8, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 3, 2, true),
      createItem(7, 'is', 4, 2, true),
      createItem(8, 'hot', 5, 2, true),
      createItem(9, 'and', 6, 2, true),
      createItem(10, 'melt', 7, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'left')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'rock'),
    false,
  )
})

test('step resolves blocking before pending dependency when both apply', () => {
  const level: LevelData = {
    title: 'block-over-defer',
    width: 9,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'key', 1, 0, false),
      createItem(4, 'box', 2, 0, false),
      createItem(10, 'baba', 0, 3, true),
      createItem(11, 'is', 1, 3, true),
      createItem(12, 'you', 2, 3, true),
      createItem(13, 'and', 3, 3, true),
      createItem(14, 'weak', 4, 3, true),
      createItem(20, 'rock', 0, 2, true),
      createItem(21, 'is', 1, 2, true),
      createItem(22, 'push', 2, 2, true),
      createItem(23, 'box', 3, 2, true),
      createItem(24, 'is', 4, 2, true),
      createItem(25, 'push', 5, 2, true),
      createItem(26, 'key', 6, 2, true),
      createItem(27, 'is', 7, 2, true),
      createItem(28, 'pull', 8, 2, true),
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

test('step MOVE open-shut destruction still pulls object behind', () => {
  const level: LevelData = {
    title: 'move-open-shut-pull-behind',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'key', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'door', 2, 0, false),
      createItem(4, 'baba', 8, 0, false),
      createItem(10, 'baba', 0, 2, true),
      createItem(11, 'is', 1, 2, true),
      createItem(12, 'you', 2, 2, true),
      createItem(13, 'key', 3, 2, true),
      createItem(14, 'is', 4, 2, true),
      createItem(15, 'pull', 5, 2, true),
      createItem(16, 'rock', 0, 1, true),
      createItem(17, 'is', 1, 1, true),
      createItem(18, 'move', 2, 1, true),
      createItem(19, 'and', 3, 1, true),
      createItem(20, 'open', 4, 1, true),
      createItem(21, 'door', 6, 1, true),
      createItem(22, 'is', 7, 1, true),
      createItem(23, 'shut', 8, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const key = result.state.items.find((item) => item.id === 1)

  assert.equal(key?.x, 1)
  assert.equal(key?.y, 0)
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'rock'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'door'),
    false,
  )
})

test('step MOVE drags pull cargo through an empty-is-pull column', () => {
  // Official check() treats a pullable unit-free cell as pseudo-unit 2:
  // the dragged empty pulls the cell behind IT, so the pull propagates
  // through consecutive pull-empties until it lands real cargo one cell
  // closer (Guardians level 70 — text_win crossing the empty column).
  const level: LevelData = {
    title: 'empty-pull-chain',
    width: 6,
    height: 9,
    items: [
      createItem(1, 'rock', 2, 1, false),
      createItem(2, 'baba', 2, 5, false),
      createItem(3, 'wall', 2, 6, false),
      createItem(10, 'baba', 0, 0, true),
      createItem(11, 'is', 0, 1, true),
      createItem(12, 'you', 0, 2, true),
      createItem(13, 'empty', 5, 0, true),
      createItem(14, 'is', 5, 1, true),
      createItem(15, 'pull', 5, 2, true),
      createItem(16, 'rock', 0, 8, true),
      createItem(17, 'is', 1, 8, true),
      createItem(18, 'pull', 2, 8, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'down')
  const at = (name: string, x: number, y: number) =>
    result.state.items.some(
      (item) => !item.isText && item.name === name && item.x === x && item.y === y,
    )

  // Baba steps onto the prop-free wall cell; the pull-empty column
  // (2,2)-(2,4) drags the rock one cell toward him.
  assert.ok(at('baba', 2, 6))
  assert.ok(at('rock', 2, 2))
})

test('step MOVE cannot enter a pullable empty cell', () => {
  // The same pseudo-unit is `estop` from the front: `empty is pull`
  // walls the cell off like a pull-only unit does.
  const level: LevelData = {
    title: 'empty-pull-blocks-entry',
    width: 6,
    height: 9,
    items: [
      createItem(1, 'rock', 2, 1, false),
      createItem(2, 'baba', 2, 6, false),
      createItem(10, 'baba', 0, 0, true),
      createItem(11, 'is', 0, 1, true),
      createItem(12, 'you', 0, 2, true),
      createItem(13, 'empty', 5, 0, true),
      createItem(14, 'is', 5, 1, true),
      createItem(15, 'pull', 5, 2, true),
      createItem(16, 'rock', 0, 8, true),
      createItem(17, 'is', 1, 8, true),
      createItem(18, 'pull', 2, 8, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')
  const baba = result.state.items.find((item) => item.id === 2)

  assert.equal(baba?.x, 2)
  assert.equal(baba?.y, 6)
})
