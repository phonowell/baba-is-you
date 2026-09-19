import assert from 'node:assert/strict'
import test from 'node:test'

import { levelDataForMap } from './map-level.js'
import {
  applyEnter,
  applyLeave,
  createMapSession,
  moveCursor,
  placeCursor,
  resolveEnterTarget,
  topMapFrame,
} from './overworld.js'
import { createInitialState } from './state.js'
import { step } from './step.js'

import type {
  Item,
  LevelData,
  LevelIcon,
  LevelItem,
} from './types.js'

const createItem = (
  id: number,
  name: string,
  x: number,
  y: number,
  isText: boolean,
  levelTarget?: LevelIcon,
): LevelItem => ({
  id,
  name,
  x,
  y,
  isText,
  ...(levelTarget ? { levelTarget } : {}),
})

const icon = (
  kind: LevelIcon['kind'],
  file: string,
  extra: Partial<LevelIcon> = {},
): LevelIcon => ({ kind, file, number: 0, style: 0, ...extra })

const withProps = (items: LevelItem[]): Item[] =>
  items.map((item) => ({ ...item, props: [] }))

const cursorPos = (items: ReadonlyArray<Item>) => {
  const cursor = items.find((item) => item.name === 'cursor')
  return cursor ? { x: cursor.x, y: cursor.y } : undefined
}

test('placeCursor lands on the icon matching the target file', () => {
  const items = withProps([
    createItem(1, 'level', 0, 0, false, icon('level', '0level', { levelIndex: 0 })),
    createItem(2, 'level', 4, 0, false, icon('map', '16level', { mapFile: '16level' })),
  ])
  const result = placeCursor(items, '16level')
  assert.deepEqual(cursorPos(result), { x: 4, y: 0 })
})

test('placeCursor falls back to selector then first icon', () => {
  const items = withProps([
    createItem(1, 'level', 7, 7, false, icon('level', '0level', { levelIndex: 0 })),
  ])
  assert.deepEqual(cursorPos(placeCursor(items, undefined, [3, 3])), {
    x: 3,
    y: 3,
  })
  assert.deepEqual(cursorPos(placeCursor(items, 'missing')), { x: 7, y: 7 })
})

test('placeCursor lands on the exact icon cell when the file is duplicated', () => {
  const items = withProps([
    createItem(1, 'level', 1, 1, false, icon('level', '5level', { levelIndex: 5 })),
    createItem(2, 'level', 6, 2, false, icon('level', '5level', { levelIndex: 5 })),
  ])
  // A bare file picks the first match; an IconRef pins the entered cell.
  assert.deepEqual(cursorPos(placeCursor(items, '5level')), { x: 1, y: 1 })
  assert.deepEqual(
    cursorPos(placeCursor(items, { file: '5level', x: 6, y: 2 })),
    { x: 6, y: 2 },
  )
  // A stale position falls back to the file-only match rather than failing.
  assert.deepEqual(
    cursorPos(placeCursor(items, { file: '5level', x: 0, y: 0 })),
    { x: 1, y: 1 },
  )
})

test('cursor hops along lines and level icons but not bare cells', () => {
  const level: LevelData = {
    title: 'map',
    width: 5,
    height: 1,
    items: [
      createItem(1, 'cursor', 0, 0, false),
      createItem(2, 'line', 1, 0, false),
      createItem(3, 'level', 2, 0, false, icon('level', '1level', { levelIndex: 1 })),
      createItem(4, 'wall', 4, 0, false),
    ],
  }
  let state = createInitialState(level, 0)

  state = step(state, 'right').state
  assert.equal(cursorPos(state.items)?.x, 1)
  state = step(state, 'right').state
  const cursor = state.items.find((item) => item.name === 'cursor')
  assert.equal(cursor?.x, 2)
  assert.equal(cursor?.dir, 'right')

  const blocked = step(state, 'right')
  assert.equal(blocked.changed, false)
  assert.equal(cursorPos(blocked.state.items)?.x, 2)
})

test('cursor move is ignored on wait input', () => {
  const items = withProps([
    createItem(1, 'cursor', 0, 0, false),
    createItem(2, 'line', 1, 0, false),
  ])
  const result = moveCursor(items, 'up', 3, 1)
  assert.equal(result.changed, false)
})

test('a map board without you entities does not lose', () => {
  const level: LevelData = {
    title: 'map',
    width: 3,
    height: 1,
    items: [
      createItem(1, 'cursor', 0, 0, false),
      createItem(2, 'line', 1, 0, false),
    ],
  }
  const state = step(createInitialState(level, 0), 'up')
  assert.equal(state.state.status, 'playing')
})

test('resolveEnterTarget returns the icon under the cursor', () => {
  const target = icon('map', '207level', { mapFile: '207level', icon: 'island' })
  const items = [
    createItem(1, 'cursor', 1, 0, false),
    createItem(2, 'level', 1, 0, false, target),
    createItem(3, 'level', 3, 0, false, icon('level', '4level', { levelIndex: 4 })),
  ]
  assert.deepEqual(resolveEnterTarget(items), { icon: target, x: 1, y: 0 })
  assert.equal(
    resolveEnterTarget([createItem(1, 'cursor', 0, 0, false)]),
    undefined,
  )
})

test('enter on a level icon records the return icon and opens the level', () => {
  const session = createMapSession('106level')
  const entered = applyEnter(session, {
    icon: icon('level', '42level', { levelIndex: 7 }),
    x: 5,
    y: 6,
  })
  assert.deepEqual(entered.transition, { type: 'enter-level', levelIndex: 7 })
  assert.deepEqual(topMapFrame(entered.session)?.returnTo, {
    file: '42level',
    x: 5,
    y: 6,
  })
})

test('enter on a map icon dives and a return icon pops back', () => {
  let session = createMapSession('106level')
  const entered = applyEnter(session, {
    icon: icon('map', '177level', { mapFile: '177level' }),
    x: 2,
    y: 3,
  })
  assert.deepEqual(entered.transition, {
    type: 'enter-map',
    mapFile: '177level',
    fromMapFile: '106level',
  })
  assert.equal(entered.session.stack.length, 2)
  assert.deepEqual(entered.session.stack[0]?.returnTo, {
    file: '177level',
    x: 2,
    y: 3,
  })
  session = entered.session

  const back = applyEnter(session, {
    icon: icon('map', '106level', { mapFile: '106level' }),
    x: 0,
    y: 0,
  })
  assert.deepEqual(back.transition, {
    type: 'return-map',
    mapFile: '106level',
    returnTo: { file: '177level', x: 2, y: 3 },
  })
  assert.equal(back.session.stack.length, 1)
})

test('enter on unresolved or self icons is a no-op', () => {
  const session = createMapSession('106level')
  assert.equal(
    applyEnter(session, { icon: icon('unresolved', '4level'), x: 1, y: 1 })
      .transition.type,
    'stay',
  )
  assert.equal(
    applyEnter(session, {
      icon: icon('map', '106level', { mapFile: '106level' }),
      x: 1,
      y: 1,
    }).transition.type,
    'stay',
  )
  assert.equal(applyEnter(session, undefined).transition.type, 'stay')
})

test('leave pops the stack or follows the declared parent link', () => {
  let session = createMapSession('106level')
  session = applyEnter(session, {
    icon: icon('map', '16level', { mapFile: '16level' }),
    x: 4,
    y: 4,
  }).session

  const popped = applyLeave(session, undefined)
  assert.deepEqual(popped.transition, {
    type: 'return-map',
    mapFile: '106level',
    returnTo: { file: '16level', x: 4, y: 4 },
  })

  const root = createMapSession('106level')
  const ascended = applyLeave(root, '200level')
  assert.deepEqual(ascended.transition, {
    type: 'enter-map',
    mapFile: '200level',
    fromMapFile: '106level',
  })
  // The parent link replaces the stack — a further leave on the parent
  // must not bounce back into the child we just climbed out of.
  assert.equal(ascended.session.stack.length, 1)
  assert.equal(
    applyLeave(ascended.session, undefined).transition.type,
    'stay',
  )

  assert.equal(applyLeave(root, undefined).transition.type, 'stay')
})

test('levelDataForMap emits level items carrying resolved targets', () => {
  const data = levelDataForMap({
    file: '106level',
    title: 'MAP',
    selector: [9, 15],
    parentFile: '200level',
    body: `
Title MAP;
Size 33x18;
line@right 1,1 2,1;
    `,
    icons: [
      { x: 2, y: 1, file: '177level', number: 0, style: -1, icon: 'lake', mapFile: '177level' },
      { x: 1, y: 1, file: '4level', number: 3, style: 0 },
    ],
  })
  assert.equal(data.width, 33)
  const icons = data.items.filter((item) => item.name === 'level')
  assert.equal(icons.length, 2)
  assert.equal(icons[0]?.levelTarget?.kind, 'map')
  assert.equal(icons[0]?.levelTarget?.icon, 'lake')
  assert.equal(icons[1]?.levelTarget?.kind, 'unresolved')
  assert.deepEqual(data.meta?.map, {
    selector: [9, 15],
    parentFile: '200level',
  })
})
