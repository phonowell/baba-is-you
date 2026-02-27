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
  assert.equal(
    result.state.items.some((item) => item.props.includes('you')),
    false,
  )
})

test('step preserves BABA IS YOU when trailing AND term is moved away', () => {
  const level: LevelData = {
    title: 'dangling-and-keeps-you',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 4, 1, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'sink', 4, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'down')
  const babas = result.state.items.filter(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(result.state.status, 'playing')
  assert.equal(
    result.state.rules.some(
      (rule) =>
        rule.subject === 'baba' &&
        rule.kind === 'property' &&
        rule.object === 'you' &&
        !rule.subjectNegated &&
        !rule.objectNegated,
    ),
    true,
  )
  assert.equal(
    babas.every((item) => item.props.includes('you')),
    true,
  )
  assert.equal(
    babas.some((item) => item.props.includes('sink')),
    false,
  )
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
  const crab = result.state.items.find(
    (item) => !item.isText && item.name === 'crab',
  )

  assert.equal(crab?.x, 2)
  assert.equal(crab?.y, 1)
})

test('step supports wait turn without moving YOU', () => {
  const level: LevelData = {
    title: 'wait-turn',
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
  const result = step(state, null)
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )
  const crab = result.state.items.find(
    (item) => !item.isText && item.name === 'crab',
  )

  assert.equal(result.changed, true)
  assert.equal(baba?.x, 0)
  assert.equal(baba?.y, 0)
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

test('step MAKE spawns target object on source each turn', () => {
  const level: LevelData = {
    title: 'make-spawn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 2, true),
      createItem(3, 'is', 1, 2, true),
      createItem(4, 'you', 2, 2, true),
      createItem(5, 'baba', 4, 2, true),
      createItem(6, 'make', 5, 2, true),
      createItem(7, 'rock', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const spawnedRock = result.state.items.find(
    (item) =>
      !item.isText && item.name === 'rock' && item.x === 1 && item.y === 0,
  )

  assert.equal(spawnedRock !== undefined, true)
})

test('step MAKE does not duplicate target when already present in source cell', () => {
  const level: LevelData = {
    title: 'make-no-duplicate',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 0, 0, false),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'make', 1, 1, true),
      createItem(5, 'rock', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const turn1 = step(state, null).state
  const turn2 = step(turn1, null).state
  const rockCount1 = turn1.items.filter(
    (item) => !item.isText && item.name === 'rock',
  ).length
  const rockCount2 = turn2.items.filter(
    (item) => !item.isText && item.name === 'rock',
  ).length

  assert.equal(rockCount1, 1)
  assert.equal(rockCount2, 1)
})

test('step EAT removes eaten targets and keeps eater', () => {
  const level: LevelData = {
    title: 'eat-interaction',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'baba', 4, 2, true),
      createItem(7, 'eat', 5, 2, true),
      createItem(8, 'rock', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'rock'),
    false,
  )
  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    true,
  )
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

test('step EMPTY IS YOU does not auto-lose when no physical YOU object exists', () => {
  const level: LevelData = {
    title: 'empty-you-survive',
    width: 4,
    height: 3,
    items: [
      createItem(1, 'empty', 0, 2, true),
      createItem(2, 'is', 1, 2, true),
      createItem(3, 'you', 2, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'playing')
})

test('step EMPTY IS PUSH blocks entering empty cells', () => {
  const level: LevelData = {
    title: 'empty-push-blocks',
    width: 8,
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

test('step WRITE spawns text target on source object each turn', () => {
  const level: LevelData = {
    title: 'write-spawn-text',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'baba', 0, 1, true),
      createItem(3, 'write', 1, 1, true),
      createItem(4, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const winText = result.state.items.find(
    (item) =>
      item.isText && item.name === 'win' && item.x === 0 && item.y === 0,
  )

  assert.equal(winText !== undefined, true)
})

test('step WRITE does not duplicate same text target in one cell', () => {
  const level: LevelData = {
    title: 'write-no-duplicate',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'win', 0, 0, true),
      createItem(3, 'baba', 0, 1, true),
      createItem(4, 'write', 1, 1, true),
      createItem(5, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)
  const wins = result.state.items.filter(
    (item) =>
      item.isText && item.name === 'win' && item.x === 0 && item.y === 0,
  )

  assert.equal(wins.length, 1)
})

test('step WRITE-created rule affects interactions in the same turn', () => {
  const level: LevelData = {
    title: 'write-rule-same-turn',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'skull', 0, 0, false),
      createItem(3, 'is', 1, 0, true),
      createItem(4, 'defeat', 2, 0, true),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'baba', 4, 2, true),
      createItem(9, 'write', 5, 2, true),
      createItem(10, 'skull', 6, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, null)

  assert.equal(result.state.status, 'lose')
  assert.equal(
    result.state.items.some(
      (item) =>
        !item.isText && item.name === 'baba' && item.props.includes('you'),
    ),
    false,
  )
})
