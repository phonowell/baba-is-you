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
test('step SLEEP blocks YOU movement', () => {
  const level: LevelData = {
    title: 'sleep-you-block',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'and', 3, 2, true),
      createItem(6, 'sleep', 4, 2, true),
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

test('step LONELY condition requires sharing cell absence', () => {
  const level: LevelData = {
    title: 'lonely-condition',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 0, 0, false),
      createItem(3, 'lonely', 0, 2, true),
      createItem(4, 'baba', 1, 2, true),
      createItem(5, 'is', 2, 2, true),
      createItem(6, 'you', 3, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const blocked = step(state, 'right')
  const blockedBaba = blocked.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(blockedBaba?.x, 0)
  assert.equal(blockedBaba?.y, 0)
})

test('step keeps base rule when malformed FACING prefix appears before subject', () => {
  const level: LevelData = {
    title: 'facing-prefix-fallback',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'facing', 0, 1, true),
      createItem(3, 'baba', 1, 1, true),
      createItem(4, 'is', 2, 1, true),
      createItem(5, 'you', 3, 1, true),
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

test('step keeps base rule when malformed ON prefix appears before subject', () => {
  const level: LevelData = {
    title: 'on-prefix-fallback',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'on', 0, 1, true),
      createItem(3, 'baba', 1, 1, true),
      createItem(4, 'is', 2, 1, true),
      createItem(5, 'you', 3, 1, true),
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

test('step moves YOU objects in one direction without self-blocking order artifacts', () => {
  const level: LevelData = {
    title: 'you-column-simultaneous',
    width: 5,
    height: 6,
    items: [
      createItem(1, 'baba', 1, 1, false),
      createItem(2, 'baba', 1, 2, false),
      createItem(3, 'baba', 1, 3, false),
      createItem(4, 'baba', 0, 5, true),
      createItem(5, 'is', 1, 5, true),
      createItem(6, 'you', 2, 5, true),
      createItem(7, 'and', 3, 5, true),
      createItem(8, 'stop', 4, 5, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')
  const ys = result.state.items
    .filter((item) => !item.isText && item.name === 'baba')
    .map((item) => item.y)
    .sort((a, b) => a - b)

  assert.deepEqual(ys, [0, 1, 2])
})

test('step updates pushed MOVE object facing to push direction before MOVE phase', () => {
  const level: LevelData = {
    title: 'push-updates-move-facing',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'rock', 2, 3, false),
      createItem(2, 'baba', 2, 4, false),
      createItem(3, 'baba', 0, 5, true),
      createItem(4, 'is', 1, 5, true),
      createItem(5, 'you', 2, 5, true),
      createItem(6, 'rock', 2, 0, true),
      createItem(7, 'is', 3, 0, true),
      createItem(8, 'move', 4, 0, true),
      createItem(9, 'and', 5, 0, true),
      createItem(10, 'push', 6, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'up')
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(rock?.x, 2)
  assert.equal(rock?.y, 1)
  assert.equal(rock?.dir, 'up')
})

test('step moves a solid row of YOU+STOP objects once the far end is free', () => {
  const level: LevelData = {
    title: 'you-stop-row',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'wall', 1, 0, false),
      createItem(2, 'wall', 2, 0, false),
      createItem(3, 'wall', 3, 0, false),
      createItem(10, 'wall', 0, 2, true),
      createItem(11, 'is', 1, 2, true),
      createItem(12, 'you', 2, 2, true),
      createItem(13, 'and', 3, 2, true),
      createItem(14, 'stop', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const xs = result.state.items
    .filter((item) => !item.isText && item.name === 'wall')
    .map((item) => item.x)
    .sort((a, b) => a - b)

  assert.deepEqual(xs, [2, 3, 4])
})

test('step blocks a solid row of YOU+STOP objects when the far end is held', () => {
  const level: LevelData = {
    title: 'you-stop-row-blocked',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'wall', 1, 0, false),
      createItem(2, 'wall', 2, 0, false),
      createItem(3, 'wall', 3, 0, false),
      createItem(4, 'hedge', 4, 0, false),
      createItem(10, 'wall', 0, 2, true),
      createItem(11, 'is', 1, 2, true),
      createItem(12, 'you', 2, 2, true),
      createItem(13, 'and', 3, 2, true),
      createItem(14, 'stop', 4, 2, true),
      createItem(15, 'hedge', 0, 3, true),
      createItem(16, 'is', 1, 3, true),
      createItem(17, 'stop', 2, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const xs = result.state.items
    .filter((item) => !item.isText && item.name === 'wall')
    .map((item) => item.x)
    .sort((a, b) => a - b)

  assert.deepEqual(xs, [1, 2, 3])
})

test('step moves a unit twice when two identical IS MOVE rules are active', () => {
  // Official `been_seen` bumps `moves` once per matching rule instance:
  // two separate `crab is move` formations queue two moves per turn.
  const level: LevelData = {
    title: 'double-move-rule',
    width: 7,
    height: 7,
    items: [
      { ...createItem(1, 'crab', 1, 1, false), dir: 'right' },
      createItem(2, 'crab', 0, 4, true),
      createItem(3, 'is', 1, 4, true),
      createItem(4, 'move', 2, 4, true),
      createItem(5, 'crab', 0, 5, true),
      createItem(6, 'is', 1, 5, true),
      createItem(7, 'move', 2, 5, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const crab = result.state.items.find(
    (item) => !item.isText && item.name === 'crab',
  )

  assert.equal(crab?.x, 3)
  assert.equal(crab?.y, 1)
})

test('step does not flip an escalated MOVE mover on its blocked extra move', () => {
  // Officially a mover that needed a push retry re-enters the queue at
  // state 10 — pushes still resolve but the move flip does not run, so
  // the crab stops behind the blocked rock instead of walking back.
  const level: LevelData = {
    title: 'double-move-no-flip',
    width: 8,
    height: 8,
    items: [
      { ...createItem(1, 'crab', 1, 1, false), dir: 'right' },
      createItem(2, 'rock', 2, 1, false),
      createItem(3, 'wall', 4, 1, false),
      createItem(4, 'crab', 0, 6, true),
      createItem(5, 'is', 1, 6, true),
      createItem(6, 'move', 2, 6, true),
      createItem(7, 'crab', 0, 7, true),
      createItem(8, 'is', 1, 7, true),
      createItem(9, 'move', 2, 7, true),
      createItem(10, 'rock', 6, 5, true),
      createItem(11, 'is', 6, 6, true),
      createItem(12, 'push', 6, 7, true),
      createItem(13, 'wall', 7, 5, true),
      createItem(14, 'is', 7, 6, true),
      createItem(15, 'stop', 7, 7, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const crab = result.state.items.find(
    (item) => !item.isText && item.name === 'crab',
  )
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(crab?.x, 2)
  assert.equal(crab?.y, 1)
  assert.equal(crab?.dir, 'right')
  assert.equal(rock?.x, 3)
})

test('step turns a blocked YOU mover to face the input direction', () => {
  // Take-1 runs `updatedir(v, fdir)` at collection — the facing update
  // lands even when the move itself is blocked by a stop unit.
  const level: LevelData = {
    title: 'you-facing-on-block',
    width: 5,
    height: 6,
    items: [
      { ...createItem(1, 'baba', 2, 2, false), dir: 'left' },
      createItem(2, 'wall', 2, 3, false),
      createItem(3, 'baba', 0, 0, true),
      createItem(4, 'is', 1, 0, true),
      createItem(5, 'you', 2, 0, true),
      createItem(6, 'wall', 0, 5, true),
      createItem(7, 'is', 1, 5, true),
      createItem(8, 'stop', 2, 5, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'down')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 2)
  assert.equal(baba?.y, 2)
  assert.equal(baba?.dir, 'down')
})

test('step does not leak a second-pusher commit onto a chain that stops', () => {
  // The wall's move pushes {move,you} → {is,is} → {baba,hand,wall} →
  // stop water. While the `is` pair's own arrows are still pending, the
  // `you` text's arrow re-pushes them; officially the earlier queue only
  // counts once it lands — the chain fails atomically and both `is`
  // units stay put instead of one leaking into the blocked cell.
  const level: LevelData = {
    title: 'stopped-chain-no-leak',
    width: 20,
    height: 8,
    items: [
      createItem(9, 'water', 7, 6, false),
      createItem(10, 'baba', 8, 6, true),
      createItem(11, 'hand', 8, 6, true),
      createItem(12, 'wall', 8, 6, true),
      createItem(13, 'is', 9, 6, true),
      createItem(14, 'is', 9, 6, true),
      createItem(15, 'move', 10, 6, true),
      createItem(16, 'you', 10, 6, true),
      { ...createItem(17, 'wall', 11, 6, false), dir: 'left' },
      createItem(1, 'baba', 0, 0, false),
      createItem(20, 'water', 4, 2, true),
      createItem(21, 'is', 5, 2, true),
      createItem(22, 'stop', 6, 2, true),
      createItem(23, 'wall', 4, 3, true),
      createItem(24, 'is', 5, 3, true),
      createItem(25, 'move', 6, 3, true),
      createItem(26, 'baba', 7, 4, true),
      createItem(27, 'is', 8, 4, true),
      createItem(28, 'you', 9, 4, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const row = result.state.items.filter((item) => item.y === 6)
  const isXs = row
    .filter((item) => item.name === 'is')
    .map((item) => item.x)
    .sort()
  const subjXs = row
    .filter((item) => item.isText && ['baba', 'hand', 'wall'].includes(item.name))
    .map((item) => item.x)
    .sort()
  const wall = row.find((item) => !item.isText && item.name === 'wall')

  assert.deepEqual(isXs, [9, 9])
  assert.deepEqual(subjXs, [8, 8, 8])
  assert.ok((wall?.x ?? 0) > 11)
})
