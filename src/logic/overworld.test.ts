import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyEnter,
  applyLeave,
  createOverworldSession,
  moveCursor,
  placeCursor,
  resolveEnterTarget,
} from './overworld.js'
import { createInitialState } from './state.js'
import { step } from './step.js'

import type {
  Item,
  LevelData,
  LevelItem,
  LevelName,
} from './types.js'
import type { OverworldGraph } from './overworld.js'

const createItem = (
  id: number,
  name: string,
  x: number,
  y: number,
  isText: boolean,
  levelTarget?: LevelName,
): LevelItem => ({
  id,
  name,
  x,
  y,
  isText,
  ...(levelTarget ? { levelTarget } : {}),
})

const withProps = (items: LevelItem[]): Item[] =>
  items.map((item) => ({ ...item, props: [] }))

test('placeCursor prefers the parent icon when entering a map fresh', () => {
  const items = withProps([
    createItem(1, 'level', 0, 0, false, { kind: 'number', n: 0 }),
    createItem(2, 'level', 2, 0, false, { kind: 'parent' }),
  ])
  const result = placeCursor(items, undefined)
  const cursor = result.find((item) => item.name === 'cursor')
  assert.deepEqual({ x: cursor?.x, y: cursor?.y }, { x: 2, y: 0 })
})

test('placeCursor lands on the finished level icon when returning', () => {
  const items = withProps([
    createItem(1, 'level', 0, 0, false, { kind: 'number', n: 0 }),
    createItem(2, 'level', 2, 0, false, { kind: 'parent' }),
    createItem(3, 'level', 4, 0, false, { kind: 'number', n: 3 }),
  ])
  const result = placeCursor(items, { kind: 'number', n: 3 })
  const cursor = result.find((item) => item.name === 'cursor')
  assert.deepEqual({ x: cursor?.x, y: cursor?.y }, { x: 4, y: 0 })
})

test('placeCursor falls back to level 0 without a matching icon', () => {
  const items = withProps([
    createItem(1, 'level', 1, 1, false, { kind: 'number', n: 0 }),
  ])
  const result = placeCursor(items, { kind: 'number', n: 9 })
  const cursor = result.find((item) => item.name === 'cursor')
  assert.deepEqual({ x: cursor?.x, y: cursor?.y }, { x: 1, y: 1 })
})

test('cursor hops along lines and level icons but not bare cells', () => {
  const level: LevelData = {
    title: 'map',
    width: 5,
    height: 1,
    items: [
      createItem(1, 'cursor', 0, 0, false),
      createItem(2, 'line', 1, 0, false),
      createItem(3, 'level', 2, 0, false, { kind: 'number', n: 1 }),
      // x=3 is bare ground, x=4 holds a wall: neither is walkable
      createItem(4, 'wall', 4, 0, false),
    ],
  }
  let state = createInitialState(level, 0)

  state = step(state, 'right').state // onto line
  assert.equal(
    state.items.find((item) => item.name === 'cursor')?.x,
    1,
  )
  state = step(state, 'right').state // onto level icon
  const cursor = state.items.find((item) => item.name === 'cursor')
  assert.equal(cursor?.x, 2)
  assert.equal(cursor?.dir, 'right')

  const blocked = step(state, 'right')
  assert.equal(blocked.changed, false) // bare cell rejects the hop
  assert.equal(
    blocked.state.items.find((item) => item.name === 'cursor')?.x,
    2,
  )
})

test('cursor move is ignored on wait input', () => {
  const items = withProps([
    createItem(1, 'cursor', 0, 0, false),
    createItem(2, 'line', 1, 0, false),
  ])
  const result = moveCursor(items, 'up', 3, 1)
  assert.equal(result.changed, false)
})

test('resolveEnterTarget returns the level icon under the cursor', () => {
  const items = [
    createItem(1, 'cursor', 1, 0, false),
    createItem(2, 'level', 1, 0, false, { kind: 'subworld', n: 2, icon: 'island' }),
    createItem(3, 'level', 3, 0, false, { kind: 'number', n: 4 }),
  ]
  assert.deepEqual(resolveEnterTarget(items), {
    kind: 'subworld',
    n: 2,
    icon: 'island',
  })
  assert.equal(
    resolveEnterTarget([createItem(1, 'cursor', 0, 0, false)]),
    undefined,
  )
})

const graph = (): OverworldGraph => ({
  file: 'index.txt',
  children: new Map([
    ['n0', { file: '0-a.txt', children: new Map() }],
    [
      's1',
      {
        file: '1-sub/index.txt',
        children: new Map([
          ['n1', { file: '1-sub/1-b.txt', children: new Map() }],
        ]),
      },
    ],
  ]),
})

test('session enter dives into a subworld and return restores the icon', () => {
  let session = createOverworldSession(graph())

  const entered = applyEnter(session, {
    kind: 'subworld',
    n: 1,
    icon: 'lake',
  })
  assert.equal(entered.transition.type, 'enter')
  assert.equal(entered.session.stack.length, 2)
  assert.equal(
    entered.session.stack[0]?.returnTo &&
      'n' in entered.session.stack[0].returnTo &&
      entered.session.stack[0].returnTo.n,
    1,
  )
  session = entered.session

  const left = applyLeave(session)
  assert.equal(left.transition.type, 'return')
  assert.equal(left.session.stack.length, 1)
  assert.deepEqual(
    left.transition.type === 'return' ? left.transition.returnTo : null,
    { kind: 'subworld', n: 1, icon: 'lake' },
  )
})

test('session enter on the parent icon pops to the parent map', () => {
  let session = createOverworldSession(graph())
  session = applyEnter(session, { kind: 'number', n: 0 }).session
  assert.equal(session.stack.length, 2)

  const back = applyEnter(session, { kind: 'parent' })
  assert.equal(back.transition.type, 'return')
  assert.equal(back.session.stack.length, 1)
})

test('session enter exits cleanly at the root or on unknown targets', () => {
  const session = createOverworldSession(graph())
  assert.equal(
    applyEnter(session, { kind: 'parent' }).transition.type,
    'exit-map',
  )
  assert.equal(
    applyEnter(session, { kind: 'number', n: 9 }).transition.type,
    'exit-map',
  )
})
