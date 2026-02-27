import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildEntityViews,
  computeEntityBaseTarget,
  emojiBottomAnchorOffset,
  emojiMicroStretch,
  emojiPhaseOffsetMsForItem,
  emojiStretchEnabledForItem,
} from './board-3d.js'

import type { GameState } from '../logic/types.js'

const createState = (items: GameState['items']): GameState => ({
  levelIndex: 0,
  title: 'board-3d-stack-test',
  width: 1,
  height: 1,
  items,
  rules: [],
  status: 'playing',
  turn: 0,
})

test('board-3d uses strict upright stack order', () => {
  const state = createState([
    { id: 10, name: 'skull', x: 0, y: 0, isText: false, props: ['defeat'] },
    { id: 11, name: 'door', x: 0, y: 0, isText: false, props: ['open'] },
    { id: 12, name: 'rock', x: 0, y: 0, isText: false, props: ['pull'] },
    { id: 13, name: 'ghost', x: 0, y: 0, isText: false, props: ['fall'] },
    { id: 14, name: 'baba', x: 0, y: 0, isText: true, props: [] },
    { id: 15, name: 'keke', x: 0, y: 0, isText: false, props: ['you'] },
  ])

  const views = buildEntityViews(state)
  const byId = new Map(views.map((view) => [view.item.id, view]))
  const rankIds = [15, 14, 13, 12, 11, 10]
  const stackIndices = rankIds.map((id) => byId.get(id)?.stackIndex ?? -1)
  const priorities = rankIds.map((id) => byId.get(id)?.layerPriority ?? -1)

  assert.deepEqual(stackIndices, [0, 1, 2, 3, 4, 5])
  assert.deepEqual(priorities, [5, 4, 3, 2, 1, 0])
})

test('board-3d excludes ground-hug items from upright stack order', () => {
  const state = createState([
    { id: 1, name: 'rock', x: 0, y: 0, isText: false, props: ['pull'] },
    { id: 2, name: 'skull', x: 0, y: 0, isText: false, props: ['defeat'] },
    { id: 3, name: 'tile', x: 0, y: 0, isText: false, props: ['you', 'push'] },
  ])

  const views = buildEntityViews(state)
  const pullView = views.find((view) => view.item.id === 1)
  const defeatView = views.find((view) => view.item.id === 2)
  const tileView = views.find((view) => view.item.id === 3)

  assert.ok(pullView)
  assert.ok(defeatView)
  assert.ok(tileView)
  assert.equal(pullView.stackIndex, 0)
  assert.equal(defeatView.stackIndex, 1)
  assert.equal(pullView.displayStackCount, 2)
  assert.equal(defeatView.displayStackCount, 2)
  assert.equal(tileView.displayStackCount, 1)
  assert.equal(tileView.layerPriority, 0)
})

test('board-3d places higher-priority stack item in front along depth axis', () => {
  const state = createState([
    { id: 1, name: 'rock', x: 0, y: 0, isText: false, props: ['pull'] },
    { id: 2, name: 'skull', x: 0, y: 0, isText: false, props: ['defeat'] },
  ])

  const views = buildEntityViews(state)
  const pullView = views.find((view) => view.item.id === 1)
  const defeatView = views.find((view) => view.item.id === 2)

  assert.ok(pullView)
  assert.ok(defeatView)
  const pullTarget = computeEntityBaseTarget(state, pullView)
  const defeatTarget = computeEntityBaseTarget(state, defeatView)
  assert.equal(pullTarget.y < defeatTarget.y, true)
})

test('board-3d emoji micro stretch loops every 1s', () => {
  const t0 = emojiMicroStretch(250)
  const t1 = emojiMicroStretch(1250)
  assert.ok(Math.abs(t0.scaleX - t1.scaleX) < 1e-9)
  assert.ok(Math.abs(t0.scaleY - t1.scaleY) < 1e-9)
})

test('board-3d emoji anchor offset follows stretch direction from bottom', () => {
  assert.equal(emojiBottomAnchorOffset(1, 1), 0)
  assert.equal(emojiBottomAnchorOffset(1, 1.03) > 0, true)
  assert.equal(emojiBottomAnchorOffset(1, 0.97) < 0, true)
})

test('board-3d emoji stretch excludes ground-hug items', () => {
  const groundHugEmoji: GameState['items'][number] = {
    id: 1,
    name: 'tile',
    x: 0,
    y: 0,
    isText: false,
    props: ['push', 'you'],
  }
  const uprightEmoji: GameState['items'][number] = {
    id: 2,
    name: 'baba',
    x: 0,
    y: 0,
    isText: false,
    props: ['you'],
  }
  assert.equal(emojiStretchEnabledForItem(groundHugEmoji), false)
  assert.equal(emojiStretchEnabledForItem(uprightEmoji), true)
})

test('board-3d emoji phase offset is stable and within one cycle', () => {
  const itemA: GameState['items'][number] = {
    id: 7,
    name: 'baba',
    x: 0,
    y: 0,
    isText: false,
    props: [],
  }
  const itemB: GameState['items'][number] = {
    id: 8,
    name: 'keke',
    x: 0,
    y: 0,
    isText: false,
    props: [],
  }
  const a0 = emojiPhaseOffsetMsForItem(itemA)
  const a1 = emojiPhaseOffsetMsForItem(itemA)
  const b0 = emojiPhaseOffsetMsForItem(itemB)
  assert.equal(a0 === a1, true)
  assert.equal(a0 >= 0 && a0 < 1000, true)
  assert.equal(b0 >= 0 && b0 < 1000, true)
  assert.equal(a0 !== b0, true)
})
