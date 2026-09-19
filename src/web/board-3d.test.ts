import assert from 'node:assert/strict'
import test from 'node:test'

import { PerspectiveCamera } from 'three'

import {
  cardLabelLines,
  cardSpecForItem,
  idleFloatEnabledForItem,
  idleFrameOffsetForItem,
  idlePhaseOffsetMsForItem,
  idleStretchEnabledForItem,
} from './board-3d-shared-item.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { buildCellGridPoints } from './board-3d-ground-shape.js'
import { buildEntityViews, computeEntityBaseTarget } from './board-3d-shared-layout.js'
import {
  idleFloatBob,
  idleMicroStretch,
  idleStretchBottomAnchorOffset,
} from './board-3d-shared-math.js'
import { applyNodePose } from './board-3d-node-pose.js'
import { SPRITE_FRAME_COUNT } from './pixel-sprites/derive.js'

import type { GameState } from '../logic/types.js'
import type { EntityNode } from './board-3d-node-types.js'

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

test('board-3d idle micro stretch loops every 1s', () => {
  const t0 = idleMicroStretch(250)
  const t1 = idleMicroStretch(1250)
  assert.ok(Math.abs(t0.scaleX - t1.scaleX) < 1e-9)
  assert.ok(Math.abs(t0.scaleY - t1.scaleY) < 1e-9)
})

test('board-3d idle stretch anchor offset follows stretch direction from bottom', () => {
  assert.equal(idleStretchBottomAnchorOffset(1, 1), 0)
  assert.equal(idleStretchBottomAnchorOffset(1, 1.03) > 0, true)
  assert.equal(idleStretchBottomAnchorOffset(1, 0.97) < 0, true)
})

test('board-3d idle stretch covers text cards only', () => {
  const groundHugSprite: GameState['items'][number] = {
    id: 1,
    name: 'tile',
    x: 0,
    y: 0,
    isText: false,
    props: ['push', 'you'],
  }
  const uprightSprite: GameState['items'][number] = {
    id: 2,
    name: 'baba',
    x: 0,
    y: 0,
    isText: false,
    props: ['you'],
  }
  const spriteLessObject: GameState['items'][number] = {
    id: 3,
    name: 'nonexistent-object',
    x: 0,
    y: 0,
    isText: false,
    props: [],
  }
  const uprightText: GameState['items'][number] = {
    id: 4,
    name: 'win',
    x: 0,
    y: 0,
    isText: true,
    props: [],
  }
  assert.equal(idleStretchEnabledForItem(groundHugSprite), false)
  assert.equal(idleStretchEnabledForItem(uprightSprite), false)
  assert.equal(idleStretchEnabledForItem(spriteLessObject), false)
  assert.equal(idleStretchEnabledForItem(uprightText), true)
})

const { FLOAT_BOB_CYCLE_MS, FLOAT_BOB_AMP } = BOARD3D_ANIMATION_CONFIG

test('board-3d float prop enables the idle bob on any card kind', () => {
  const floatingObject: GameState['items'][number] = {
    id: 1,
    name: 'baba',
    x: 0,
    y: 0,
    isText: false,
    props: ['float'],
  }
  const floatingText: GameState['items'][number] = {
    id: 2,
    name: 'win',
    x: 0,
    y: 0,
    isText: true,
    props: ['float'],
  }
  const grounded: GameState['items'][number] = {
    id: 3,
    name: 'rock',
    x: 0,
    y: 0,
    isText: false,
    props: ['you'],
  }
  assert.equal(idleFloatEnabledForItem(floatingObject), true)
  assert.equal(idleFloatEnabledForItem(floatingText), true)
  assert.equal(idleFloatEnabledForItem(grounded), false)
})

test('board-3d float bob is a bounded sine over its cycle', () => {
  const quarter = FLOAT_BOB_CYCLE_MS / 4
  assert.ok(Math.abs(idleFloatBob(0)) < 1e-9)
  assert.ok(Math.abs(idleFloatBob(quarter) - FLOAT_BOB_AMP) < 1e-9)
  assert.ok(Math.abs(idleFloatBob(quarter * 3) + FLOAT_BOB_AMP) < 1e-9)
  assert.ok(Math.abs(idleFloatBob(FLOAT_BOB_CYCLE_MS)) < 1e-9)
})

const createPoseNode = (): { node: EntityNode; zSamples: number[] } => {
  const zSamples: number[] = []
  const node = {
    mesh: {
      position: {
        set: (_x: number, _y: number, z: number) => {
          zSamples.push(z)
        },
      },
      rotation: { set: () => undefined },
      scale: { set: () => undefined },
    },
    shadow: {
      position: { set: () => undefined },
      scale: { set: () => undefined },
    },
    shadowMaterial: { opacity: 1 },
    specKey: '',
    frameGeometries: [],
    idleStretch: false,
    idleFloat: false,
    idlePhaseOffsetMs: 0,
    idleFrameOffset: 0,
    facesCamera: false,
    facingYaw: undefined,
    rotRoll: 0,
    rollStep: 0,
    fxColors: [],
    spawnFxDone: true,
    despawnFxDone: true,
    pulseStartMs: null,
    pulseKind: null,
    fromX: 0,
    fromY: 0,
    fromBaseZ: 0.23,
    fromRoll: 0,
    toX: 0,
    toY: 0,
    toBaseZ: 0.23,
    toRoll: 0,
    animStartMs: 0,
    animDurationMs: 1,
    moving: false,
    spawnStartMs: null,
    despawnStartMs: null,
    landStartMs: null,
  } as unknown as EntityNode
  return { node, zSamples }
}

test('board-3d pose bobs a float-prop card around its base z', () => {
  const { node, zSamples } = createPoseNode()
  node.idleFloat = true
  const camera = new PerspectiveCamera()

  applyNodePose(node, 0, camera)
  applyNodePose(node, FLOAT_BOB_CYCLE_MS / 4, camera)
  applyNodePose(node, (FLOAT_BOB_CYCLE_MS * 3) / 4, camera)

  const [zStart, zPeak, zTrough] = zSamples
  assert.ok(Math.abs(zStart! - node.toBaseZ) < 1e-9)
  assert.ok(Math.abs(zPeak! - (node.toBaseZ + FLOAT_BOB_AMP)) < 1e-9)
  assert.ok(Math.abs(zTrough! - (node.toBaseZ - FLOAT_BOB_AMP)) < 1e-9)
})

test('board-3d pose keeps a non-float card at its base z over the bob cycle', () => {
  const { node, zSamples } = createPoseNode()
  const camera = new PerspectiveCamera()

  applyNodePose(node, 0, camera)
  applyNodePose(node, FLOAT_BOB_CYCLE_MS / 4, camera)

  assert.equal(zSamples.length, 2)
  for (const z of zSamples) {
    assert.ok(Math.abs(z - node.toBaseZ) < 1e-9)
  }
})

test('board-3d idle phase offset is stable and within one cycle', () => {
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
  const a0 = idlePhaseOffsetMsForItem(itemA)
  const a1 = idlePhaseOffsetMsForItem(itemA)
  const b0 = idlePhaseOffsetMsForItem(itemB)
  assert.equal(a0 === a1, true)
  assert.equal(a0 >= 0 && a0 < 1000, true)
  assert.equal(b0 >= 0 && b0 < 1000, true)
  assert.equal(a0 !== b0, true)
})

test('board-3d idle frame offset quantizes the same phase into frame steps', () => {
  const items: GameState['items'] = [
    { id: 7, name: 'baba', x: 0, y: 0, isText: false, props: [] },
    { id: 8, name: 'keke', x: 0, y: 0, isText: false, props: [] },
    { id: 9, name: 'wall', x: 0, y: 0, isText: false, props: [] },
    { id: 10, name: 'rock', x: 0, y: 0, isText: false, props: [] },
  ]
  const offsets = items.map((item) => idleFrameOffsetForItem(item))
  for (const [index, offset] of offsets.entries()) {
    assert.equal(offset, idleFrameOffsetForItem(items[index]!))
    assert.equal(Number.isInteger(offset), true)
    assert.equal(offset >= 0 && offset < SPRITE_FRAME_COUNT, true)
    // Frame offset is the item's idle phase mapped onto frame steps.
    assert.equal(
      offset,
      Math.floor((idlePhaseOffsetMsForItem(items[index]!) / 1000) * SPRITE_FRAME_COUNT),
    )
  }
  // A spread of items must not collapse into one shared wobble phase.
  assert.equal(new Set(offsets).size > 1, true)
})

test('board-3d belt cards always carry a facing direction and rotate their sprite', () => {
  const belt = { id: 1, name: 'belt', x: 0, y: 0, isText: false, props: [], dir: 'down' as const }
  const spec = cardSpecForItem(belt, 0)
  assert.equal(spec.facingDirection, 'down')
  assert.equal(spec.rotatesWithDirection, true)

  const rock = { id: 2, name: 'rock', x: 0, y: 0, isText: false, props: [] }
  const rockSpec = cardSpecForItem(rock, 0)
  assert.equal(rockSpec.facingDirection, null)
  assert.equal(rockSpec.rotatesWithDirection, false)
})

test('board-3d cell grid draws interior borders on cell boundaries', () => {
  const points = buildCellGridPoints(4, 3, -0.221)
  const segments: Array<[number, number, number, number]> = []
  for (let i = 0; i < points.length; i += 2) {
    const a = points.at(i)
    const b = points.at(i + 1)
    assert.ok(a && b)
    segments.push([a.x, a.y, b.x, b.y])
    assert.equal(a.z, -0.221)
    assert.equal(b.z, -0.221)
  }

  assert.deepEqual(segments, [
    [-1, -1.5, -1, 1.5],
    [0, -1.5, 0, 1.5],
    [1, -1.5, 1, 1.5],
    [-2, 0.5, 2, 0.5],
    [-2, -0.5, 2, -0.5],
  ])
})

test('board-3d cell grid stays empty for single-cell boards', () => {
  assert.equal(buildCellGridPoints(1, 1, -0.221).length, 0)
  assert.equal(buildCellGridPoints(1, 5, -0.221).length, 8)
})

test('board-3d marks overridden rule text with a crossed-out card', () => {
  const item = { id: 1, name: 'push', x: 0, y: 0, isText: true, props: [] }
  const normal = cardSpecForItem(item, 0)
  const overridden = cardSpecForItem(item, 0, true)

  assert.equal(overridden.strikethrough, true)
  assert.equal(typeof overridden.strikeColor, 'string')
  assert.equal(overridden.key !== normal.key, true)
  assert.equal(normal.strikethrough ?? false, false)
})

// Text plates share the level-select menu's pill chrome; only grammar
// words earn the ◆ flourish, and sprite/object cards stay off the pill.
test('board-3d text cards wear the menu pill chrome by category', () => {
  const syntax = cardSpecForItem(
    { id: 1, name: 'is', x: 0, y: 0, isText: true, props: [] },
    0,
  )
  assert.equal(typeof syntax.backgroundTop, 'string')
  assert.equal(typeof syntax.keylineColor, 'string')
  assert.equal(typeof syntax.diamondColor, 'string')

  const noun = cardSpecForItem(
    { id: 2, name: 'baba', x: 0, y: 0, isText: true, props: [] },
    0,
  )
  assert.equal(typeof noun.backgroundTop, 'string')
  assert.equal(typeof noun.keylineColor, 'string')
  assert.equal(noun.diamondColor, undefined)

  const overridden = cardSpecForItem(
    { id: 3, name: 'push', x: 0, y: 0, isText: true, props: [] },
    0,
    true,
  )
  assert.equal(typeof overridden.backgroundTop, 'string')
  assert.equal(typeof overridden.keylineColor, 'string')
  assert.equal(overridden.diamondColor, undefined)

  const object = cardSpecForItem(
    { id: 4, name: 'nonexistent-object', x: 0, y: 0, isText: false, props: [] },
    0,
  )
  assert.equal(object.backgroundTop, undefined)
  assert.equal(object.keylineColor, undefined)
  assert.equal(object.diamondColor, undefined)
})

// Long labels would shrink to unreadable sizes on one row, so they wrap
// near the middle: the shorter half rides on top unless an explicit cut
// keeps the second line pronounceable (EM/PTY would orphan "PTY").
test('board-3d wraps long text-card labels into two readable lines', () => {
  const specFor = (name: string, isText = true) =>
    cardSpecForItem({ id: 1, name, x: 0, y: 0, isText, props: [] }, 0)

  assert.deepEqual(cardLabelLines(specFor('you')), ['YOU'])
  assert.deepEqual(cardLabelLines(specFor('baba')), ['BA', 'BA'])
  assert.deepEqual(cardLabelLines(specFor('water')), ['WA', 'TER'])
  assert.deepEqual(cardLabelLines(specFor('seastar')), ['SEA', 'STAR'])
  assert.deepEqual(cardLabelLines(specFor('empty')), ['EMP', 'TY'])
  assert.deepEqual(cardLabelLines(specFor('foliage')), ['FOLI', 'AGE'])
  assert.deepEqual(cardLabelLines(specFor('nonexistent-object', false)), [
    'NO',
  ])
})
