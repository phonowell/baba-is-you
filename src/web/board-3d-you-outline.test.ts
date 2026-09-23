import assert from 'node:assert/strict'
import test from 'node:test'

import {
  Color,
  Group,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
} from 'three'

import { BOARD3D_RULE_VISUAL_CONFIG } from './board-3d-config-visuals.js'
import { createBoard3dRendererMaterialStore } from './board-3d-renderer-materials.js'
import { createEntityNode } from './board-3d-node-create.js'
import { syncEntityNodes } from './board-3d-node-sync.js'
import { youOutlinePulse } from './board-3d-shared-math.js'
import { CLAY_PRESET } from './clay-config.js'

import type { CanvasTexture } from 'three'
import type { GameState, Item } from '../logic/types.js'
import type { EntityNode } from './board-3d-node-types.js'

const {
  YOU_OUTLINE_SCALE,
  YOU_OUTLINE_SCALE_SWELL,
  YOU_OUTLINE_PULSE_MS,
} = BOARD3D_RULE_VISUAL_CONFIG

const item = (
  id: number,
  name: string,
  props: Item['props'],
  extra: Partial<Item> = {},
): Item => ({ id, name, x: 0, y: 0, isText: false, props, ...extra })

const createState = (items: GameState['items']): GameState => ({
  levelIndex: 0,
  title: 'you-outline-test',
  width: 1,
  height: 1,
  items,
  rules: [],
  status: 'playing',
  turn: 0,
})

const cardGeometry = new PlaneGeometry(0.88, 0.88)
const cardMaterial = new MeshBasicMaterial()
const stubOutlineMaterial = new MeshBasicMaterial()
// 0x112233 ^ 0xffffff — the stub's card colour and its sRGB negative.
const stubOutlineTint = {
  base: new Color(0x112233),
  inverse: new Color(0xeeddcc),
}

const stubVisual = () => ({
  key: 'stub',
  geometry: cardGeometry,
  material: cardMaterial,
  frameGeometries: [],
  facingYaw: undefined,
  fxColors: [],
  outlineMaterial: stubOutlineMaterial,
  outlineTint: stubOutlineTint,
})

const createDeps = (entityGroup: Group) => ({
  entityGroup,
  shadowGeometry: new PlaneGeometry(1, 1),
  shadowTexture: {} as CanvasTexture,
  getVisual: stubVisual,
})

const createSyncDeps = (entityGroup: Group) => {
  const deps = createDeps(entityGroup)
  return {
    nodes: new Map<number, EntityNode>(),
    getVisual: deps.getVisual,
    createNode: (
      nodeItem: Item,
      nowMs: number,
      spawnDelayMs?: number,
      tileMask?: number,
    ) => createEntityNode(deps, nodeItem, nowMs, spawnDelayMs, tileMask),
    camera: new PerspectiveCamera(),
  }
}

test('board-3d you outline: control-layer cards carry a visible inflated shell', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)

  const you = createEntityNode(deps, item(1, 'baba', ['you']), 0)
  const you2 = createEntityNode(deps, item(2, 'keke', ['you2']), 0)
  const plain = createEntityNode(deps, item(3, 'rock', []), 0)

  assert.equal(you.outline.visible, true)
  assert.equal(you2.outline.visible, true)
  assert.equal(plain.outline.visible, false)

  // The rim is the card's own geometry inflated around its origin — the
  // inverted-hull shell — so it follows the silhouette for free. Its
  // material and tint ride the spec's visual entry.
  assert.equal(you.outline.parent, you.mesh)
  assert.equal(you.outline.geometry, you.mesh.geometry)
  assert.equal(you.outline.material, stubOutlineMaterial)
  assert.equal(you.outlineTint, stubOutlineTint)
  assert.equal(you.outline.scale.x, YOU_OUTLINE_SCALE)
})

test('board-3d you outline appears and clears with the control layer across syncs', () => {
  const entityGroup = new Group()
  const syncDeps = createSyncDeps(entityGroup)

  syncEntityNodes(
    createState([item(1, 'baba', ['you']), item(2, 'rock', [])]),
    syncDeps,
  )
  assert.equal(syncDeps.nodes.get(1)!.outline.visible, true)
  assert.equal(syncDeps.nodes.get(2)!.outline.visible, false)

  // The rule broke: same item id, no you — the rim goes with the prop.
  syncEntityNodes(
    createState([item(1, 'baba', []), item(2, 'rock', ['you'])]),
    syncDeps,
  )
  assert.equal(syncDeps.nodes.get(1)!.outline.visible, false)
  assert.equal(syncDeps.nodes.get(2)!.outline.visible, true)
})

test('board-3d you outline swaps geometry when the card spec changes', () => {
  const entityGroup = new Group()
  const geometryRight = new PlaneGeometry(0.5, 0.5)
  const geometryLeft = new PlaneGeometry(0.7, 0.7)
  const visualFor = (visualItem: Item) => ({
    key: `dir:${visualItem.dir ?? 'none'}`,
    geometry: visualItem.dir === 'left' ? geometryLeft : geometryRight,
    material: cardMaterial,
    frameGeometries: [],
    facingYaw: undefined,
    fxColors: [],
    outlineMaterial: stubOutlineMaterial,
    outlineTint: stubOutlineTint,
  })
  const deps = {
    entityGroup,
    shadowGeometry: new PlaneGeometry(1, 1),
    shadowTexture: {} as CanvasTexture,
    getVisual: visualFor,
  }
  const nodes = new Map<number, EntityNode>()
  const syncDeps = {
    nodes,
    getVisual: visualFor,
    createNode: (
      nodeItem: Item,
      nowMs: number,
      spawnDelayMs?: number,
      tileMask?: number,
    ) => createEntityNode(deps, nodeItem, nowMs, spawnDelayMs, tileMask),
    camera: new PerspectiveCamera(),
  }

  syncEntityNodes(
    createState([item(1, 'baba', ['you'], { dir: 'right' })]),
    syncDeps,
  )
  const node = nodes.get(1)!
  assert.equal(node.mesh.geometry, geometryRight)
  assert.equal(node.outline.geometry, geometryRight)

  syncEntityNodes(
    createState([item(1, 'baba', ['you'], { dir: 'left' })]),
    syncDeps,
  )
  assert.equal(node.mesh.geometry, geometryLeft)
  assert.equal(node.outline.geometry, geometryLeft)
})

test('board-3d you outline pulse sweeps card colour and its inverse on one shared wave', () => {
  // Quarter phase peaks the sine, three-quarter bottoms it — the rim must
  // sweep both its tint and its thickness, not just fade.
  assert.equal(youOutlinePulse(YOU_OUTLINE_PULSE_MS / 4), 1)
  assert.equal(youOutlinePulse((YOU_OUTLINE_PULSE_MS * 3) / 4), 0)

  const store = createBoard3dRendererMaterialStore({
    preset: CLAY_PRESET,
    textureAnisotropy: 1,
  })
  // baba's palette leads with white — the rim's negative is pure black.
  const visual = store.getVisual(item(1, 'baba', ['you']))
  assert.equal(visual.outlineTint.base.getHex(), 0xffffff)
  assert.equal(visual.outlineTint.inverse.getHex(), 0x000000)

  const scales: number[] = []
  const scaleProbe = {
    setScalar: (value: number) => {
      scales.push(value)
    },
  }
  const shell = (visible: boolean) => ({
    outline: {
      visible,
      scale: scaleProbe,
      material: visual.outlineMaterial,
    },
    outlineTint: visual.outlineTint,
  })
  const nodes = new Map([[1, shell(true)], [2, shell(false)]]) as never

  const colorHex = () => visual.outlineMaterial.color.getHex()

  assert.equal(store.advanceYouOutline(nodes, YOU_OUTLINE_PULSE_MS / 4), 1)
  assert.equal(colorHex(), 0xffffff)
  assert.equal(scales.at(-1), YOU_OUTLINE_SCALE * (1 + YOU_OUTLINE_SCALE_SWELL))

  assert.equal(store.advanceYouOutline(nodes, (YOU_OUTLINE_PULSE_MS * 3) / 4), 1)
  assert.equal(colorHex(), 0x000000)
  assert.equal(scales.at(-1), YOU_OUTLINE_SCALE)

  // Hidden rims are never touched — a card that drops the control layer
  // keeps its last scale instead of pulsing invisible geometry.
  assert.equal(scales.length, 2)
  store.dispose()
})
