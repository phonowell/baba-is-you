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

test('step does not report changed for blocked move with BABA IS BABA', () => {
  const level: LevelData = {
    title: 'identity-transform-blocked',
    width: 5,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'wall', 1, 0, false),
      createItem(3, 'wall', 0, 1, true),
      createItem(4, 'is', 1, 1, true),
      createItem(5, 'stop', 2, 1, true),
      createItem(6, 'baba', 0, 2, true),
      createItem(7, 'is', 1, 2, true),
      createItem(8, 'you', 2, 2, true),
      createItem(9, 'baba', 4, 0, true),
      createItem(10, 'is', 4, 1, true),
      createItem(11, 'baba', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.changed, false)
})

test('step sets status lose when all YOU are defeated', () => {
  const level: LevelData = {
    title: 'lose-on-defeat',
    width: 5,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'skull', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'skull', 0, 1, true),
      createItem(7, 'is', 1, 1, true),
      createItem(8, 'defeat', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'lose')
  assert.equal(result.state.items.some((item) => item.props.includes('you')), false)
})

test('step auto-moves MOVE objects each turn', () => {
  const level: LevelData = {
    title: 'auto-move',
    width: 7,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'crab', 1, 1, false),
      createItem(3, 'baba', 0, 3, true),
      createItem(4, 'is', 1, 3, true),
      createItem(5, 'you', 2, 3, true),
      createItem(6, 'crab', 4, 3, true),
      createItem(7, 'is', 5, 3, true),
      createItem(8, 'move', 6, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const crab = result.state.items.find((item) => !item.isText && item.name === 'crab')

  assert.equal(crab?.x, 2)
  assert.equal(crab?.y, 1)
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
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

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
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

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
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(baba?.x, 1)
  assert.equal(rock?.x, 0)
})

test('step teleports objects that enter TELE cells', () => {
  const level: LevelData = {
    title: 'tele',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'flag', 5, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'flag', 4, 2, true),
      createItem(8, 'is', 5, 2, true),
      createItem(9, 'tele', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

  assert.equal(baba?.x, 5)
  assert.equal(baba?.y, 0)
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
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

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

test('step treats NOT property as exclusion instead of complement expansion', () => {
  const level: LevelData = {
    title: 'not-runtime',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'not', 0, 0, true),
      createItem(2, 'baba', 1, 0, true),
      createItem(3, 'is', 2, 0, true),
      createItem(4, 'you', 3, 0, true),
      createItem(5, 'baba', 4, 0, false),
      createItem(6, 'rock', 5, 0, false),
    ],
  }

  const state = createInitialState(level, 0)
  const baba = state.items.find((item) => !item.isText && item.name === 'baba')
  const rock = state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(baba?.props.includes('you'), false)
  assert.equal(rock?.props.includes('you'), true)
})

test('step blocks moving into PULL object from the front', () => {
  const level: LevelData = {
    title: 'pull-front-block',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 3, 2, true),
      createItem(7, 'is', 4, 2, true),
      createItem(8, 'pull', 5, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(baba?.x, 0)
  assert.equal(rock?.x, 1)
})

test('step does not auto-move objects with RIGHT unless they are MOVE', () => {
  const level: LevelData = {
    title: 'right-not-move',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 2, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'rock', 0, 1, true),
      createItem(7, 'is', 1, 1, true),
      createItem(8, 'right', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(rock?.x, 2)
  assert.equal(rock?.y, 0)
})

test('step applies newly formed MOVE rule starting next turn', () => {
  const level: LevelData = {
    title: 'move-rule-next-turn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'rock', 0, 0, false),
      createItem(2, 'baba', 4, 1, false),
      createItem(3, 'rock', 0, 1, true),
      createItem(4, 'is', 1, 1, true),
      createItem(5, 'move', 3, 1, true),
      createItem(6, 'baba', 0, 2, true),
      createItem(7, 'is', 1, 2, true),
      createItem(8, 'you', 2, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'left')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(rock?.x, 0)
  assert.equal(
    result.state.rules.some(
      (rule) =>
        rule.subject === 'rock' &&
        rule.kind === 'property' &&
        rule.object === 'move' &&
        !rule.subjectNegated &&
        !rule.objectNegated,
    ),
    true,
  )
})

test('step transforms after move phase, so transformed MOVE objects wait one turn', () => {
  const level: LevelData = {
    title: 'transform-after-move',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'baba', 0, 1, true),
      createItem(6, 'is', 1, 1, true),
      createItem(7, 'rock', 2, 1, true),
      createItem(8, 'rock', 6, 0, true),
      createItem(9, 'is', 6, 1, true),
      createItem(10, 'move', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(rock?.x, 1)
  assert.equal(rock?.y, 0)
})

test('step MOVE objects flip direction and retry on the same turn', () => {
  const level: LevelData = {
    title: 'move-flip-retry',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 5, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'wall', 2, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'rock', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'move', 5, 2, true),
      createItem(10, 'wall', 3, 1, true),
      createItem(11, 'is', 4, 1, true),
      createItem(12, 'stop', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'left')
})

test('step resolves OPEN into SHUT during blocked movement', () => {
  const level: LevelData = {
    title: 'open-shut-collision',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'door', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'baba', 3, 1, true),
      createItem(7, 'is', 4, 1, true),
      createItem(8, 'open', 5, 1, true),
      createItem(9, 'door', 3, 0, true),
      createItem(10, 'is', 4, 0, true),
      createItem(11, 'shut', 5, 0, true),
      createItem(12, 'door', 3, 2, true),
      createItem(13, 'is', 4, 2, true),
      createItem(14, 'stop', 5, 2, true),
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

test('step movement-phase OPEN/SHUT destruction still drops HAS targets', () => {
  const level: LevelData = {
    title: 'open-shut-has-drop',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'door', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'open', 4, 2, true),
      createItem(8, 'baba', 0, 1, true),
      createItem(9, 'has', 1, 1, true),
      createItem(10, 'key', 2, 1, true),
      createItem(11, 'door', 6, 0, true),
      createItem(12, 'is', 7, 0, true),
      createItem(13, 'shut', 8, 0, true),
      createItem(14, 'door', 6, 2, true),
      createItem(15, 'is', 7, 2, true),
      createItem(16, 'stop', 8, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const key = result.state.items.find((item) => !item.isText && item.name === 'key')

  assert.equal(key?.x, 0)
  assert.equal(key?.y, 0)
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'door'),
    false,
  )
})

test('step OPEN/SHUT destruction does not force blocked PUSH target to move', () => {
  const level: LevelData = {
    title: 'open-shut-do-not-force-push',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'door', 1, 0, false),
      createItem(3, 'rock', 1, 0, false),
      createItem(4, 'wall', 2, 0, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'and', 3, 2, true),
      createItem(9, 'open', 4, 2, true),
      createItem(10, 'door', 5, 2, true),
      createItem(11, 'is', 6, 2, true),
      createItem(12, 'shut', 7, 2, true),
      createItem(13, 'and', 3, 1, true),
      createItem(14, 'stop', 4, 1, true),
      createItem(15, 'rock', 5, 1, true),
      createItem(16, 'is', 6, 1, true),
      createItem(17, 'push', 7, 1, true),
      createItem(18, 'wall', 5, 0, true),
      createItem(19, 'is', 6, 0, true),
      createItem(20, 'stop', 7, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

  assert.equal(rock?.x, 1)
  assert.equal(rock?.y, 0)
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    false,
  )
})

test('step TELE uses board-order pad scan, not insertion order', () => {
  const level: LevelData = {
    title: 'tele-pad-order',
    width: 12,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 5, 0, false),
      createItem(3, 'flag', 1, 0, false),
      createItem(4, 'flag', 3, 0, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'flag', 9, 2, true),
      createItem(9, 'is', 10, 2, true),
      createItem(10, 'tele', 11, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

  assert.equal(baba?.x, 3)
  assert.equal(baba?.y, 0)
})

test('step TELE RNG matches official oorandom seed behavior on turn 0', () => {
  const level: LevelData = {
    title: 'tele-rng-turn0',
    width: 14,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 11, 0, false),
      createItem(3, 'flag', 1, 0, false),
      createItem(4, 'flag', 3, 0, false),
      createItem(5, 'flag', 9, 0, false),
      createItem(6, 'flag', 5, 0, false),
      createItem(7, 'flag', 7, 0, false),
      createItem(8, 'baba', 0, 2, true),
      createItem(9, 'is', 1, 2, true),
      createItem(10, 'you', 2, 2, true),
      createItem(11, 'flag', 11, 2, true),
      createItem(12, 'is', 12, 2, true),
      createItem(13, 'tele', 13, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

  assert.equal(baba?.x, 7)
  assert.equal(baba?.y, 0)
})

test('step does not win across different FLOAT layers', () => {
  const level: LevelData = {
    title: 'float-win-layer',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'flag', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'playing')
})

test('step wins on same FLOAT layer when both are FLOAT', () => {
  const level: LevelData = {
    title: 'float-win-same-layer',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'flag', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'win', 2, 1, true),
      createItem(11, 'and', 3, 1, true),
      createItem(12, 'float', 4, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'win')
})

test('step does not apply SINK across different FLOAT layers', () => {
  const level: LevelData = {
    title: 'float-sink-layer',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'water', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'water', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'sink', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    true,
  )
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
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

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
  const baba = result.state.items.find((item) => !item.isText && item.name === 'baba')

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
  const rock = result.state.items.find((item) => !item.isText && item.name === 'rock')

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

test('step MOVE resolves opposite-direction PUSH movers in one batch', () => {
  const level: LevelData = {
    title: 'move-opposite-batch',
    width: 9,
    height: 4,
    items: [
      createItem(1, 'baba', 8, 0, false),
      { ...createItem(2, 'rock', 1, 0, false), dir: 'right' },
      { ...createItem(3, 'rock', 2, 0, false), dir: 'left' },
      createItem(4, 'baba', 0, 3, true),
      createItem(5, 'is', 1, 3, true),
      createItem(6, 'you', 2, 3, true),
      createItem(7, 'rock', 4, 3, true),
      createItem(8, 'is', 5, 3, true),
      createItem(9, 'move', 6, 3, true),
      createItem(10, 'and', 7, 3, true),
      createItem(11, 'push', 8, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rockA = result.state.items.find((item) => item.id === 2)
  const rockB = result.state.items.find((item) => item.id === 3)

  assert.equal(rockA?.x, 2)
  assert.equal(rockB?.x, 1)
})

test('step SHIFT resolves opposite-direction PUSH movers in one batch', () => {
  const level: LevelData = {
    title: 'shift-opposite-batch',
    width: 10,
    height: 4,
    items: [
      createItem(1, 'baba', 9, 0, false),
      { ...createItem(2, 'rock', 1, 0, false), dir: 'right' },
      { ...createItem(3, 'rock', 2, 0, false), dir: 'left' },
      { ...createItem(4, 'belt', 1, 0, false), dir: 'right' },
      { ...createItem(5, 'belt', 2, 0, false), dir: 'left' },
      createItem(6, 'baba', 0, 3, true),
      createItem(7, 'is', 1, 3, true),
      createItem(8, 'you', 2, 3, true),
      createItem(9, 'rock', 4, 3, true),
      createItem(10, 'is', 5, 3, true),
      createItem(11, 'push', 6, 3, true),
      createItem(12, 'belt', 7, 3, true),
      createItem(13, 'is', 8, 3, true),
      createItem(14, 'shift', 9, 3, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rockA = result.state.items.find((item) => item.id === 2)
  const rockB = result.state.items.find((item) => item.id === 3)

  assert.equal(rockA?.x, 2)
  assert.equal(rockB?.x, 1)
})


test('step MOVE blocked on both sides keeps original dir', () => {
  const level: LevelData = {
    title: 'move-blocked-keep-dir',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 7, 0, false),
      { ...createItem(2, 'rock', 0, 0, false), dir: 'right' },
      createItem(3, 'wall', 1, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'rock', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'move', 5, 2, true),
      createItem(10, 'wall', 3, 1, true),
      createItem(11, 'is', 4, 1, true),
      createItem(12, 'stop', 5, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => item.id === 2)

  assert.equal(result.changed, false)
  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'right')
})

test('step SHIFT updates dir before movement even when blocked', () => {
  const level: LevelData = {
    title: 'shift-blocked-set-dir',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 7, 0, false),
      { ...createItem(2, 'rock', 0, 0, false), dir: 'right' },
      { ...createItem(3, 'belt', 0, 0, false), dir: 'left' },
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'belt', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'shift', 5, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const rock = result.state.items.find((item) => item.id === 2)

  assert.equal(result.changed, true)
  assert.equal(rock?.x, 0)
  assert.equal(rock?.dir, 'left')
})


test('step wins when same object has YOU and WIN', () => {
  const level: LevelData = {
    title: 'self-you-win',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'and', 3, 2, true),
      createItem(6, 'win', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'win')
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

test('step destroys object when OPEN and SHUT are on the same object', () => {
  const level: LevelData = {
    title: 'self-open-shut',
    width: 9,
    height: 3,
    items: [
      createItem(1, 'baba', 8, 0, false),
      createItem(2, 'key', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'key', 3, 2, true),
      createItem(7, 'is', 4, 2, true),
      createItem(8, 'open', 5, 2, true),
      createItem(9, 'and', 6, 2, true),
      createItem(10, 'shut', 7, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'left')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'key'),
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
