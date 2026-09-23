import assert from 'node:assert/strict'
import test from 'node:test'

import {
  Color,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'

import {
  createEntityBatches,
  createShadowBatch,
} from './board-3d-node-batches.js'
import { createEntityNode } from './board-3d-node-create.js'
import { BOARD3D_RULE_VISUAL_CONFIG } from './board-3d-config-visuals.js'

import type { CanvasTexture } from 'three'
import type { Item } from '../logic/types.js'
import type { EntityNode } from './board-3d-node-types.js'
import type { EntityVisual } from './board-3d-renderer-materials.js'

const { YOU_OUTLINE_SCALE } = BOARD3D_RULE_VISUAL_CONFIG

const item = (
  id: number,
  name: string,
  props: Item['props'],
): Item => ({ id, name, x: 0, y: 0, isText: false, props })

const cardGeometry = new PlaneGeometry(0.88, 0.88)
const cardMaterial = new MeshBasicMaterial()
const stubOutlineMaterial = new MeshBasicMaterial()
const stubOutlineTint = {
  base: new Color(0x112233),
  inverse: new Color(0xeeddcc),
}

const stubVisual = (key = 'stub'): EntityVisual => ({
  key,
  geometry: cardGeometry,
  material: cardMaterial,
  frameGeometries: [],
  facingYaw: undefined,
  fxColors: [],
  outlineMaterial: stubOutlineMaterial,
  outlineTint: stubOutlineTint,
})

const createDeps = (entityGroup: Group, key = 'stub') => ({
  entityGroup,
  shadowGeometry: new PlaneGeometry(1, 1),
  shadowTexture: {} as CanvasTexture,
  getVisual: () => stubVisual(key),
})

const instancedMeshes = (group: Group): InstancedMesh[] =>
  group.children.filter(
    (child): child is InstancedMesh => child instanceof InstancedMesh,
  )

test('board-3d batches merge same-spec cards into one instanced draw', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)
  const batches = createEntityBatches(entityGroup)
  const nodes = new Map<number, EntityNode>([
    [1, createEntityNode(deps, item(1, 'rock', []), 0)],
    [2, createEntityNode(deps, item(2, 'rock', []), 0)],
    [3, createEntityNode(deps, item(3, 'rock', []), 0)],
  ])

  const changed = batches.flush(nodes, null)
  assert.equal(changed, true)

  const draws = instancedMeshes(entityGroup)
  assert.equal(draws.length, 1)
  assert.equal(draws[0]?.count, 3)
  for (const node of nodes.values()) {
    assert.ok(node.cardSlot)
    assert.equal(node.cardSlot?.key.includes('stub'), true)
  }

  // Re-flush is stable: no churn, no new batches.
  assert.equal(batches.flush(nodes, null), false)
  assert.equal(instancedMeshes(entityGroup).length, 1)
})

test('board-3d batches migrate nodes when their spec key or geometry changes', () => {
  const entityGroup = new Group()
  let specKey = 'stub-a'
  const deps = createDeps(entityGroup)
  deps.getVisual = () => stubVisual(specKey)
  const batches = createEntityBatches(entityGroup)
  const node = createEntityNode(deps, item(1, 'rock', []), 0)
  const nodes = new Map<number, EntityNode>([[1, node]])

  batches.flush(nodes, null)
  const firstSlotKey = node.cardSlot?.key
  assert.equal(instancedMeshes(entityGroup).length, 1)

  // Spec swap → new key → migration to a second batch.
  specKey = 'stub-b'
  const visual = stubVisual(specKey)
  node.specKey = visual.key
  node.mesh.material = visual.material
  assert.equal(batches.flush(nodes, null), true)
  assert.equal(instancedMeshes(entityGroup).length, 2)
  assert.notEqual(node.cardSlot?.key, firstSlotKey)
})

test('board-3d batches free released slots for reuse', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)
  const batches = createEntityBatches(entityGroup)
  const nodes = new Map<number, EntityNode>([
    [1, createEntityNode(deps, item(1, 'rock', []), 0)],
    [2, createEntityNode(deps, item(2, 'rock', []), 0)],
  ])
  batches.flush(nodes, null)
  const mesh = instancedMeshes(entityGroup)[0]
  assert.ok(mesh)

  const node2 = nodes.get(2)
  assert.ok(node2)
  const index = node2.cardSlot?.index
  node2.cardSlot?.release()
  node2.cardSlot = null
  nodes.delete(2)

  const node3 = createEntityNode(deps, item(3, 'rock', []), 0)
  nodes.set(3, node3)
  batches.flush(nodes, null)
  // The freed slot is recycled before growing the water line.
  assert.equal(node3.cardSlot?.index, index)
  assert.equal(mesh.count, 2)
})

test('board-3d shadow batch writes opacity per slot and zeroes hidden shadows', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)
  const shadowBatch = createShadowBatch(
    entityGroup,
    deps.shadowGeometry,
    deps.shadowTexture,
  )
  const nodes = new Map<number, EntityNode>([
    [1, createEntityNode(deps, item(1, 'rock', []), 0)],
    [2, createEntityNode(deps, item(2, 'keke', []), 0)],
  ])
  const node1 = nodes.get(1)
  const node2 = nodes.get(2)
  assert.ok(node1 && node2)
  node1.shadowMaterial.opacity = 0.9
  node2.shadow.visible = false
  node2.shadowMaterial.opacity = 0.4

  shadowBatch.flush(nodes, null)

  const draws = instancedMeshes(entityGroup)
  assert.equal(draws.length, 1)
  assert.equal(draws[0]?.count, 2)
  const opacity = deps.shadowGeometry.getAttribute('aOpacity')
  assert.ok(opacity)
  const near = (index: number, expected: number) =>
    Math.abs(opacity.getX(index) - expected) < 1e-6
  assert.ok(near(node1.shadowSlot?.index ?? -1, 0.9))
  assert.ok(near(node2.shadowSlot?.index ?? -1, 0))

  // Visible shadows take the carrier material's live opacity.
  node2.shadow.visible = true
  shadowBatch.flush(nodes, null)
  assert.ok(near(node2.shadowSlot?.index ?? -1, 0.4))
})

test('board-3d rim anchors replay node transforms while visible', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)
  const batches = createEntityBatches(entityGroup)
  const node = createEntityNode(deps, item(1, 'baba', ['you']), 0)
  const nodes = new Map<number, EntityNode>([[1, node]])

  node.outline.visible = true
  node.mesh.position.set(3, -2, 0.5)
  node.mesh.scale.setScalar(2)

  batches.flush(nodes, null)

  const anchor = node.outlineAnchor
  assert.ok(anchor)
  assert.equal(anchor.parent, entityGroup)
  assert.equal(node.outline.parent, anchor)
  assert.equal(anchor.position.x, 3)
  assert.equal(anchor.position.y, -2)
  assert.equal(anchor.scale.x, 2)
  // The rim keeps its own inflation factor on top of the anchor transform.
  assert.equal(node.outline.scale.x, YOU_OUTLINE_SCALE)
})

test('board-3d batches grow capacity and keep matrices through rebuild', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)
  const batches = createEntityBatches(entityGroup)
  const nodes = new Map<number, EntityNode>()
  for (let i = 0; i < 70; i += 1) {
    const node = createEntityNode(deps, item(i, 'rock', []), 0)
    node.mesh.position.set(i, 0, 0)
    nodes.set(i, node)
  }
  batches.flush(nodes, null)

  const draws = instancedMeshes(entityGroup)
  assert.equal(draws.length, 1)
  assert.equal(draws[0]?.count, 70)
  assert.equal(draws[0]?.instanceMatrix.count, 128)
  // Slot order survives the capacity rebuild: the node's translation
  // (mat4 element 12) must land in its own slot.
  const node5 = nodes.get(5)
  assert.ok(node5)
  const matrix = draws[0]?.instanceMatrix
  assert.ok(matrix)
  const index5 = node5.cardSlot?.index ?? -1
  assert.equal(matrix.array[index5 * 16 + 12], 5)
})

test('board-3d batches scope matrix writes to the dirty set', () => {
  const entityGroup = new Group()
  const deps = createDeps(entityGroup)
  const batches = createEntityBatches(entityGroup)
  const nodes = new Map<number, EntityNode>([
    [1, createEntityNode(deps, item(1, 'rock', []), 0)],
    [2, createEntityNode(deps, item(2, 'rock', []), 0)],
  ])
  batches.flush(nodes, null)
  const mesh = instancedMeshes(entityGroup)[0]
  assert.ok(mesh)
  // The renderer consumes updateRanges on upload — simulate that drain.
  mesh.instanceMatrix.clearUpdateRanges()

  const node1 = nodes.get(1)
  const node2 = nodes.get(2)
  assert.ok(node1 && node2)
  node1.mesh.position.set(7, 0, 0)
  node2.mesh.position.set(9, 0, 0)

  // An empty dirty set writes nothing — the buffer keeps last tick's
  // matrices and no upload range is booked.
  assert.equal(batches.flush(nodes, new Set()), false)
  assert.equal(mesh.instanceMatrix.updateRanges.length, 0)

  // Only the posed node's slot gets rewritten and booked for upload.
  assert.equal(batches.flush(nodes, new Set([node1])), false)
  const index1 = node1.cardSlot?.index ?? -1
  const index2 = node2.cardSlot?.index ?? -1
  assert.equal(mesh.instanceMatrix.array[index1 * 16 + 12], 7)
  assert.equal(mesh.instanceMatrix.array[index2 * 16 + 12], 0)
  const range = mesh.instanceMatrix.updateRanges.at(-1)
  assert.ok(range)
  assert.equal(range.start, index1 * 16)
  assert.equal(range.count, 16)
})
