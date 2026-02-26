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
