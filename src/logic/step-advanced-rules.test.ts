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

test('step SWAP mover trades places with pushable targets', () => {
  // Official SWAP is bidirectional: a mover carrying `swap` swaps with
  // whatever it walks into — pushable or not (swap outranks push on the
  // counterpart). MATRIX-style boards rely on this to permute text on a
  // full grid where pushes can never complete.
  const level: LevelData = {
    title: 'swap-mover',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'baba', 4, 2, true),
      createItem(7, 'is', 5, 2, true),
      createItem(8, 'swap', 6, 2, true),
      createItem(9, 'rock', 0, 1, true),
      createItem(10, 'is', 1, 1, true),
      createItem(11, 'push', 2, 1, true),
    ],
  }

  const result = step(createInitialState(level, 0), 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  // `rock is push` + `baba is swap`: baba moves into the pushable rock —
  // swap wins over push, so they trade places instead.
  assert.equal(baba?.x, 1)
  assert.equal(rock?.x, 0)
})

test('step SWAP mover swaps with non-blocking win target', () => {
  // A swap mover can't land on a win flag — it trades places with it
  // (the flag leaves the cell), so no overlap means no win.
  const level: LevelData = {
    title: 'swap-win',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'baba', 4, 2, true),
      createItem(7, 'is', 5, 2, true),
      createItem(8, 'swap', 6, 2, true),
      createItem(9, 'flag', 0, 1, true),
      createItem(10, 'is', 1, 1, true),
      createItem(11, 'win', 2, 1, true),
    ],
  }

  const result = step(createInitialState(level, 0), 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const flag = result.state.items.find(
    (item) => !item.isText && item.name === 'flag',
  )

  assert.equal(baba?.x, 1)
  assert.equal(flag?.x, 0)
  assert.equal(result.state.status, 'playing')
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

test('step retries a blocked mover after a trailing push frees its cell', () => {
  // Official movement is a multi-pass state machine: a mover whose check
  // fails retries after later movers resolve. The front fruit is held by
  // the shut door until the rear fruit pushes the open key into it —
  // both vanish and the front fruit advances in the same turn.
  const level: LevelData = {
    title: 'retry-freed-cell',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'door', 0, 0, false),
      createItem(2, 'key', 0, 1, false),
      createItem(3, 'fruit', 0, 1, false),
      createItem(4, 'fruit', 0, 2, false),
      // rules: fruit is you / key is push / key is open / door is shut
      createItem(5, 'fruit', 2, 0, true),
      createItem(6, 'is', 3, 0, true),
      createItem(7, 'you', 4, 0, true),
      createItem(8, 'key', 2, 1, true),
      createItem(9, 'is', 3, 1, true),
      createItem(10, 'push', 4, 1, true),
      createItem(11, 'key', 2, 2, true),
      createItem(12, 'is', 3, 2, true),
      createItem(13, 'open', 4, 2, true),
      createItem(14, 'door', 2, 3, true),
      createItem(15, 'is', 3, 3, true),
      createItem(16, 'shut', 4, 3, true),
    ],
  }

  const result = step(createInitialState(level, 0), 'up')
  const fruits = result.state.items
    .filter((item) => !item.isText && item.name === 'fruit')
    .sort((a, b) => a.y - b.y)

  // door+key annihilated; both fruits advanced.
  assert.equal(
    result.state.items.some((item) => item.name === 'door' && !item.isText),
    false,
  )
  assert.equal(
    result.state.items.some((item) => item.name === 'key' && !item.isText),
    false,
  )
  assert.deepEqual(
    fruits.map((item) => [item.x, item.y]),
    [
      [0, 0],
      [0, 1],
    ],
  )
})

test('step pulls a stacked cell breadth-first so siblings move together', () => {
  // Official `addaction` resolves pulls breadth-first: every pull target
  // in the vacated cell updates before any drags the cell behind it.
  // Depth-first lets a pulled unit's own pull run ahead of its siblings
  // and swap-shuffles the stack backwards.
  const level: LevelData = {
    title: 'pull-bfs',
    width: 13,
    height: 3,
    items: [
      createItem(1, 'text_text', 6, 0, true),
      createItem(2, 'and', 7, 0, true),
      createItem(3, 'is', 7, 0, true),
      createItem(4, 'pull', 8, 0, true),
      createItem(5, 'swap', 8, 0, true),
      createItem(6, 'win', 8, 0, true),
      createItem(7, 'skull', 9, 0, false),
      // rules: skull is you / text is pull / text is swap / text is push
      createItem(8, 'skull', 0, 2, true),
      createItem(9, 'is', 1, 2, true),
      createItem(10, 'you', 2, 2, true),
      createItem(11, 'text', 4, 2, true),
      createItem(12, 'is', 5, 2, true),
      createItem(13, 'pull', 6, 2, true),
      createItem(14, 'text', 8, 2, true),
      createItem(15, 'is', 9, 2, true),
      createItem(16, 'swap', 10, 2, true),
      createItem(17, 'text', 0, 1, true),
      createItem(18, 'is', 1, 1, true),
      createItem(19, 'push', 2, 1, true),
    ],
  }

  const result = step(createInitialState(level, 0), 'right')
  const row = result.state.items
    .filter((item) => item.y === 0)
    .sort((a, b) => a.x - b.x)

  assert.deepEqual(
    row.map((item) => `${item.name}@${item.x}`),
    [
      'text_text@7',
      'and@8',
      'is@8',
      'pull@9',
      'swap@9',
      'win@9',
      'skull@10',
    ],
  )
})

test('step swaps with a push+swap target instead of pushing it', () => {
  // Official `check` gates the push branch on `isswap == nil`: a
  // swap-prop target is never pushed — it trades into the mover's origin
  // cell. A push+swap unit at the map edge would block outright if push
  // won, so the swap is the only way through.
  const level: LevelData = {
    title: 'swap-beats-push',
    width: 4,
    height: 4,
    items: [
      createItem(1, 'rock', 0, 0, false),
      createItem(2, 'baba', 1, 0, false),
      // rules: baba is you / rock is push / rock is swap
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 0, 3, true),
      createItem(7, 'is', 1, 3, true),
      createItem(8, 'push', 2, 3, true),
      createItem(9, 'rock', 0, 1, true),
      createItem(10, 'is', 1, 1, true),
      createItem(11, 'swap', 2, 1, true),
    ],
  }

  const result = step(createInitialState(level, 0), 'left')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  assert.equal(baba?.x, 0)
  assert.equal(rock?.x, 1)
})

test('step steers a unit resting on a shift belt to the belt facing', () => {
  // Official `moveblock` re-runs at the end of the turn: a unit standing
  // on a `shift` belt adopts THAT belt's facing — the belt it was
  // delivered onto, not the one that carried it. This is what steers a
  // `x is move` unit along a conveyor turn.
  const level: LevelData = {
    title: 'belt-steer',
    width: 4,
    height: 3,
    items: [
      createItem(1, 'belt', 1, 0, false), // dir=right, shifts the rock
      createItem(2, 'belt', 2, 0, false), // dir=down, receives the rock
      createItem(3, 'rock', 1, 0, false),
      // rules: belt is shift
      createItem(4, 'belt', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'shift', 2, 2, true),
    ],
  }
  level.items[0]!.dir = 'right'
  level.items[1]!.dir = 'down'

  const result = step(createInitialState(level, 0), null)
  const rock = result.state.items.find(
    (item) => !item.isText && item.name === 'rock',
  )

  // Belt@1,0 carries the rock onto belt@2,0; the end-of-turn steer then
  // aims it down — belt@1,0's `right` does not survive.
  assert.equal(rock?.x, 2)
  assert.equal(rock?.y, 0)
  assert.equal(rock?.dir, 'down')
})
