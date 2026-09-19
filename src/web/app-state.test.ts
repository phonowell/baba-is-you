import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { mapGameCommandToAction } from './app-commands.js'
import { createWebAppController } from './app-controller.js'
import { createWebAppStore } from './app-store.js'

import type { LevelData, LevelIcon, LevelItem } from '../logic/types.js'
import type { WebAppEnvironment } from './app-model.js'

const levels = [
  parseLevel('title One; size 3x2; Baba 0,0; Baba 0,1; Is 1,1; You 2,1'),
  parseLevel('title Two; size 3x2; Rock 0,0; Baba 0,1; Is 1,1; You 2,1'),
]

const icon = (
  id: number,
  x: number,
  y: number,
  levelTarget: LevelIcon,
): LevelItem => ({ id, name: 'level', x, y, isText: false, levelTarget })

const line = (id: number, x: number, y: number): LevelItem => ({
  id,
  name: 'line',
  x,
  y,
  isText: false,
})

// A 3x3 cross of line cells with icons in the corners — every icon is a
// two-step rail-hop from the (1,1) selector spawn.
const mapLevel = (
  file: string,
  icons: LevelItem[],
  parentFile?: string,
): LevelData => ({
  title: file,
  width: 3,
  height: 3,
  items: [
    line(1, 1, 0),
    line(2, 0, 1),
    line(3, 1, 1),
    line(4, 2, 1),
    line(5, 1, 2),
    ...icons,
  ],
  meta: {
    palette: '',
    backgrounds: [],
    colorOverrides: {},
    textColorOverrides: {},
    map: {
      selector: [1, 1],
      ...(parentFile !== undefined ? { parentFile } : {}),
    },
  },
})

const rootMap = mapLevel('root', [
  icon(10, 0, 0, {
    kind: 'level',
    file: 'first-level',
    number: 0,
    style: 0,
    levelIndex: 0,
  }),
  icon(11, 2, 0, {
    kind: 'map',
    file: 'child',
    number: 0,
    style: -1,
    mapFile: 'child',
  }),
  icon(12, 2, 2, {
    kind: 'unresolved',
    file: 'missing-level',
    number: 0,
    style: 0,
  }),
])

const childMap = mapLevel(
  'child',
  [
    icon(10, 0, 0, {
      kind: 'map',
      file: 'root',
      number: 0,
      style: -1,
      mapFile: 'root',
    }),
    icon(11, 2, 2, {
      kind: 'level',
      file: 'second-level',
      number: 0,
      style: 0,
      levelIndex: 1,
    }),
  ],
  'root',
)

const mapData = new Map([
  ['root', rootMap],
  ['child', childMap],
])

const env: WebAppEnvironment = {
  levels,
  rootMapFile: 'root',
  mapFor: (file) => mapData.get(file),
}

const cursorAt = (
  items: readonly { name: string; x: number; y: number }[],
): { x: number; y: number } | undefined => {
  const cursor = items.find((item) => item.name === 'cursor')
  return cursor ? { x: cursor.x, y: cursor.y } : undefined
}

test('initial state opens on the root map with the cursor at the selector', () => {
  const state = createWebAppStore(env).getState()

  assert.equal(state.mode, 'map')
  assert.equal(state.mapFile, 'root')
  assert.equal(state.state.status, 'playing')
  assert.deepEqual(cursorAt(state.state.items), { x: 1, y: 1 })
})

test('cursor moves only onto line/level cells and counts real turns', () => {
  const store = createWebAppStore(env)
  const initial = store.getState()

  store.dispatch({ type: 'move', direction: 'up' })
  const moved = store.getState()
  assert.deepEqual(cursorAt(moved.state.items), { x: 1, y: 0 })
  assert.equal(moved.history.length, 1)

  // One more step up leaves the board — the reducer returns the same
  // state object so the press does not count as handled.
  const blocked = store.getState()
  store.dispatch({ type: 'move', direction: 'up' })
  assert.equal(store.getState(), blocked)
  assert.equal(initial.history.length, 0)
})

test('enter-node on a level icon opens the level and records the return', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'left' })
  store.dispatch({ type: 'move', direction: 'up' })
  store.dispatch({ type: 'enter-node' })
  const state = store.getState()

  assert.equal(state.mode, 'game')
  assert.equal(state.levelIndex, 0)
  assert.equal(state.state.title, 'One')
  assert.deepEqual(state.history, [])
  assert.equal(state.session.stack.length, 1)
  assert.deepEqual(state.session.stack[0]?.returnTo, {
    file: 'first-level',
    x: 0,
    y: 0,
  })
})

test('leave-node from a level restores the map cursor on its icon', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'left' })
  store.dispatch({ type: 'move', direction: 'up' })
  store.dispatch({ type: 'enter-node' })
  store.dispatch({ type: 'leave-node' })
  const state = store.getState()

  assert.equal(state.mode, 'map')
  assert.equal(state.mapFile, 'root')
  assert.deepEqual(cursorAt(state.state.items), { x: 0, y: 0 })
})

test('enter-node on a map icon dives into the sub-map facing back', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'right' })
  store.dispatch({ type: 'move', direction: 'up' })
  store.dispatch({ type: 'enter-node' })
  const state = store.getState()

  assert.equal(state.mode, 'map')
  assert.equal(state.mapFile, 'child')
  assert.equal(state.session.stack.length, 2)
  // The child map's icon pointing back at 'root' is where the cursor
  // lands — entering a map always faces the way back.
  assert.deepEqual(cursorAt(state.state.items), { x: 0, y: 0 })
})

test('leave-node on a sub-map returns to the parent icon', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'right' })
  store.dispatch({ type: 'move', direction: 'up' })
  store.dispatch({ type: 'enter-node' })
  store.dispatch({ type: 'leave-node' })
  const state = store.getState()

  assert.equal(state.mode, 'map')
  assert.equal(state.mapFile, 'root')
  assert.equal(state.session.stack.length, 1)
  assert.deepEqual(cursorAt(state.state.items), { x: 2, y: 0 })
})

test('enter-node on an unresolved icon is a no-op', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'down' })
  store.dispatch({ type: 'move', direction: 'right' })
  const before = store.getState()
  store.dispatch({ type: 'enter-node' })

  assert.equal(store.getState(), before)
})

test('enter-node on a bare line cell is a no-op', () => {
  const store = createWebAppStore(env)
  const before = store.getState()
  store.dispatch({ type: 'enter-node' })

  assert.equal(store.getState(), before)
})

test('leave-node on the root map stays put', () => {
  const store = createWebAppStore(env)
  const before = store.getState()
  store.dispatch({ type: 'leave-node' })

  assert.equal(store.getState(), before)
})

test('mapGameCommandToAction routes map-mode commands', () => {
  const state = createWebAppStore(env).getState()

  assert.deepEqual(mapGameCommandToAction({ type: 'move', direction: 'up' }, state), {
    type: 'move',
    direction: 'up',
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'enter' }, state), {
    type: 'enter-node',
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'next' }, state), {
    type: 'enter-node',
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'back' }, state), {
    type: 'leave-node',
  })
  assert.equal(mapGameCommandToAction({ type: 'wait' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'undo' }, state), null)
})

test('mapGameCommandToAction routes game-mode commands', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'left' })
  store.dispatch({ type: 'move', direction: 'up' })
  store.dispatch({ type: 'enter-node' })
  const playing = store.getState()
  const won = {
    ...playing,
    state: { ...playing.state, status: 'win' as const },
  }

  assert.equal(mapGameCommandToAction({ type: 'enter' }, playing), null)
  assert.equal(mapGameCommandToAction({ type: 'next' }, playing), null)
  assert.deepEqual(mapGameCommandToAction({ type: 'next' }, won), {
    type: 'leave-node',
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'back' }, playing), {
    type: 'leave-node',
  })
  assert.deepEqual(
    mapGameCommandToAction({ type: 'wait' }, playing),
    { type: 'move', direction: null },
  )
})

test('createWebAppController reports handled commands by real state change', () => {
  const store = createWebAppStore(env)
  const controller = createWebAppController({ store })

  const moved = controller.handleGameCommand({ type: 'move', direction: 'left' })
  const blockedEnter = controller.handleGameCommand({ type: 'enter' })
  const cursor = cursorAt(store.getState().state.items)

  assert.equal(moved, true)
  assert.equal(blockedEnter, false)
  assert.deepEqual(cursor, { x: 0, y: 1 })
})

test('createWebAppStore notifies subscribers only on snapshot-visible changes', () => {
  const store = createWebAppStore(env)
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })

  store.dispatch({ type: 'mark-game-action-handled', nowMs: 1234 })
  store.dispatch({ type: 'enter-node' })
  store.dispatch({ type: 'move', direction: 'left' })

  unsubscribe()

  assert.equal(calls, 1)
})

test('createWebAppStore records game action timestamp through explicit action', () => {
  const store = createWebAppStore(env)
  const before = store.getState().lastGameActionMs

  store.dispatch({ type: 'mark-game-action-handled', nowMs: 1234 })

  const after = store.getState().lastGameActionMs
  assert.equal(before, 0)
  assert.equal(after, 1234)
})

test('game-mode moves still push history and undo rewinds it', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'move', direction: 'left' })
  store.dispatch({ type: 'move', direction: 'up' })
  store.dispatch({ type: 'enter-node' })

  store.dispatch({ type: 'move', direction: 'right' })
  const moved = store.getState()
  assert.equal(moved.state.turn, 1)
  assert.equal(moved.history.length, 1)

  store.dispatch({ type: 'undo' })
  const undone = store.getState()
  assert.equal(undone.state.turn, 0)
  assert.equal(undone.history.length, 0)
})
