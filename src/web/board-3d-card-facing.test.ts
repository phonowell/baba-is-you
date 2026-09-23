import assert from 'node:assert/strict'
import test from 'node:test'

import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'

import {
  applyCardOrientation,
  applyVolumeOrientation,
  cardFacingForParent,
} from './board-3d-card-facing.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { createEntityNode } from './board-3d-node-create.js'
import {
  applyNodePose,
  nodeRollAtMs,
  nodeYawAtMs,
} from './board-3d-node-pose.js'
import { syncEntityNodes } from './board-3d-node-sync.js'
import { cardFacesCamera } from './board-3d-shared-item.js'

import type { CanvasTexture } from 'three'
import type { GameState, Property } from '../logic/types.js'
import type { EntityNode } from './board-3d-node-types.js'

const EPSILON = 1e-6

const { CARD_FACE_CAMERA_BLEND } = BOARD3D_LAYOUT_CONFIG

// Rim shell fields every EntityVisual stub needs — opaque to these tests.
const stubOutlineMaterial = new MeshBasicMaterial()
const stubOutlineTint = {
  base: new Color(0x112233),
  inverse: new Color(0xeeddcc),
}

const createCamera = (): PerspectiveCamera => {
  const camera = new PerspectiveCamera(50, 1, 0.1, 180)
  camera.position.set(0, 8, 6)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}

const assertVectorNear = (
  actual: Vector3,
  expected: Vector3,
  epsilon = EPSILON,
): void => {
  assert.ok(
    Math.abs(actual.x - expected.x) < epsilon &&
      Math.abs(actual.y - expected.y) < epsilon &&
      Math.abs(actual.z - expected.z) < epsilon,
    `expected (${actual.x}, ${actual.y}, ${actual.z}) to be near (${expected.x}, ${expected.y}, ${expected.z})`,
  )
}

const createFacingRig = () => {
  const world = new Group()
  world.rotation.x = -Math.PI / 2
  const entityGroup = new Group()
  world.add(entityGroup)
  const mesh = new Mesh(
    new PlaneGeometry(0.88, 0.88),
    new MeshBasicMaterial(),
  )
  entityGroup.add(mesh)
  world.updateMatrixWorld(true)
  return { world, entityGroup, mesh }
}

const meshWorldNormal = (mesh: Mesh): Vector3 => {
  const quaternion = mesh.getWorldQuaternion(new Quaternion())
  return new Vector3(0, 0, 1).applyQuaternion(quaternion)
}

const meshWorldUpAxis = (mesh: Mesh): Vector3 => {
  const quaternion = mesh.getWorldQuaternion(new Quaternion())
  return new Vector3(0, 1, 0).applyQuaternion(quaternion)
}

const expectedFacingNormal = (camera: PerspectiveCamera): Vector3 => {
  const toCamera = camera.getWorldDirection(new Vector3()).negate()
  const horizontal = new Vector3(toCamera.x, 0, toCamera.z).normalize()
  return horizontal.lerp(toCamera, CARD_FACE_CAMERA_BLEND).normalize()
}

test('board-3d card faces camera: ground-hug items stay flat, others face camera', () => {
  const water = { id: 1, name: 'water', x: 0, y: 0, isText: false, props: [] }
  const lava = { id: 4, name: 'lava', x: 0, y: 0, isText: false, props: [] }
  const tile = { id: 5, name: 'tile', x: 0, y: 0, isText: false, props: [] }
  const importedTile = {
    id: 6,
    name: 'tile_5_10',
    x: 0,
    y: 0,
    isText: false,
    props: [],
  }
  const object = { id: 2, name: 'baba', x: 0, y: 0, isText: false, props: [] }
  const text = { id: 3, name: 'win', x: 0, y: 0, isText: true, props: [] }

  assert.equal(cardFacesCamera(water), false)
  assert.equal(cardFacesCamera(lava), false)
  assert.equal(cardFacesCamera(tile), false)
  assert.equal(cardFacesCamera(importedTile), false)
  assert.equal(cardFacesCamera(object), true)
  assert.equal(cardFacesCamera(text), true)
})

test('board-3d upright card tilts toward the camera but keeps some standing feel', () => {
  const { mesh } = createFacingRig()
  const camera = createCamera()
  mesh.position.set(0, 0, 0.09)

  applyCardOrientation(mesh, 0, camera, true)

  const normal = meshWorldNormal(mesh)
  const toCamera = camera.getWorldDirection(new Vector3()).negate()
  assertVectorNear(normal, expectedFacingNormal(camera))
  assert.ok(normal.y > 0 && normal.y < toCamera.y)
})

test('board-3d cards share one facing direction regardless of board position', () => {
  const camera = createCamera()
  const center = createFacingRig()
  const edge = createFacingRig()
  center.mesh.position.set(0, 0, 0.09)
  edge.mesh.position.set(5, 3, 0.09)

  applyCardOrientation(center.mesh, 0, camera, true)
  applyCardOrientation(edge.mesh, 0, camera, true)

  const centerNormal = meshWorldNormal(center.mesh)
  const edgeNormal = meshWorldNormal(edge.mesh)
  assertVectorNear(centerNormal, expectedFacingNormal(camera))
  assertVectorNear(edgeNormal, centerNormal)
})

test('board-3d card roll rotates around the view axis without moving the normal', () => {
  const { mesh } = createFacingRig()
  const camera = createCamera()
  mesh.position.set(0, 0, 0.09)
  const roll = 0.5

  applyCardOrientation(mesh, 0, camera, true)
  const normalBefore = meshWorldNormal(mesh)
  const upBefore = meshWorldUpAxis(mesh)

  applyCardOrientation(mesh, roll, camera, true)
  const normalAfter = meshWorldNormal(mesh)
  const upAfter = meshWorldUpAxis(mesh)

  assertVectorNear(normalAfter, normalBefore)
  assert.ok(Math.abs(upBefore.dot(upAfter) - Math.cos(roll)) < EPSILON)
})

test('board-3d ground-hug card stays flat facing the sky', () => {
  const { mesh } = createFacingRig()
  const camera = createCamera()
  mesh.position.set(0, 0, -0.2)

  applyCardOrientation(mesh, 0, camera, false)

  assertVectorNear(meshWorldNormal(mesh), new Vector3(0, 1, 0))
})

test('board-3d shared facing basis yields the per-node lookAt orientation', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const hoisted = new Mesh(new PlaneGeometry(0.88, 0.88), new MeshBasicMaterial())
  const perNode = new Mesh(new PlaneGeometry(0.88, 0.88), new MeshBasicMaterial())
  entityGroup.add(hoisted)
  entityGroup.add(perNode)
  hoisted.position.set(-3, 1, 0.09)
  perNode.position.set(2, 4, 0.09)
  const roll = 0.35

  // The hoisted basis (one per parent per frame) must produce the exact
  // orientation the per-node path derives — position-independence is the
  // whole premise of the hoist.
  const facing = cardFacingForParent(camera, entityGroup)
  applyCardOrientation(hoisted, roll, camera, true, facing)
  applyCardOrientation(perNode, roll, camera, true)

  assertVectorNear(meshWorldNormal(hoisted), meshWorldNormal(perNode))
  assert.ok(
    Math.abs(hoisted.quaternion.x - perNode.quaternion.x) < EPSILON &&
      Math.abs(hoisted.quaternion.y - perNode.quaternion.y) < EPSILON &&
      Math.abs(hoisted.quaternion.z - perNode.quaternion.z) < EPSILON &&
      Math.abs(hoisted.quaternion.w - perNode.quaternion.w) < EPSILON,
  )
})

const createState = (items: GameState['items']): GameState => ({
  levelIndex: 0,
  title: 'card-facing-test',
  width: 1,
  height: 1,
  items,
  rules: [],
  status: 'playing',
  turn: 0,
})

const createSyncNode = (entityGroup: Group) => {
  const cardGeometry = new PlaneGeometry(0.88, 0.88)
  const shadowGeometry = new PlaneGeometry(1, 1)
  const material = new MeshStandardMaterial()
  return (item: GameState['items'][number], nowMs: number): EntityNode =>
    createEntityNode(
      {
        entityGroup,
        shadowGeometry,
        shadowTexture: {} as CanvasTexture,
        getVisual: () => ({
          key: 'stub',
          geometry: cardGeometry,
          material,
          frameGeometries: [],
          facingYaw: undefined,
          fxColors: [],
          outlineMaterial: stubOutlineMaterial,
          outlineTint: stubOutlineTint,
        }),
      },
      item,
      nowMs,
    )
}

test('board-3d sync orients a spawned upright card toward the camera', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const nodes = new Map<number, EntityNode>()

  syncEntityNodes(
    createState([
      { id: 1, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
    ]),
    {
      nodes,
      getVisual: () => ({
        key: 'stub',
        geometry: new PlaneGeometry(0.88, 0.88),
        material: new MeshStandardMaterial(),
        frameGeometries: [],
        facingYaw: undefined,
        fxColors: [],
        outlineMaterial: stubOutlineMaterial,
        outlineTint: stubOutlineTint,
      }),
      createNode: createSyncNode(entityGroup),
      camera,
    },
  )

  const node = nodes.get(1)
  assert.ok(node)
  assertVectorNear(meshWorldNormal(node.mesh), expectedFacingNormal(camera))
})

test('board-3d pose keeps a moving card tilted at the camera', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const nodes = new Map<number, EntityNode>()
  const state = createState([
    { id: 1, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
  ])

  syncEntityNodes(state, {
    nodes,
    getVisual: () => ({
      key: 'stub',
      geometry: new PlaneGeometry(0.88, 0.88),
      material: new MeshStandardMaterial(),
      frameGeometries: [],
      facingYaw: undefined,
      fxColors: [],
      outlineMaterial: stubOutlineMaterial,
      outlineTint: stubOutlineTint,
    }),
    createNode: createSyncNode(entityGroup),
    camera,
  })
  const node = nodes.get(1)
  assert.ok(node)

  node.fromY = node.toY
  node.toY = node.toY + 1
  node.animStartMs = 0
  node.animDurationMs = 200
  node.moving = true

  applyNodePose(node, 100, camera)

  assertVectorNear(meshWorldNormal(node.mesh), expectedFacingNormal(camera))
})

test('board-3d volume model stands upright and turns to each board direction', () => {
  const { mesh } = createFacingRig()
  mesh.position.set(0, 0, 0.09)

  // The model stands fully vertical; yaw alone decides which side faces
  // the board-down direction.
  const cases: [number, Vector3][] = [
    [0, new Vector3(0, 0, 1)],
    [Math.PI / 2, new Vector3(1, 0, 0)],
    [Math.PI, new Vector3(0, 0, -1)],
    [-Math.PI / 2, new Vector3(-1, 0, 0)],
  ]
  for (const [yaw, expectedFront] of cases) {
    applyVolumeOrientation(mesh, 0, yaw)
    assertVectorNear(meshWorldNormal(mesh), expectedFront)
    // The model never lies down: its up axis stays vertical.
    assert.ok(Math.abs(meshWorldUpAxis(mesh).y - 1) < EPSILON)
  }
})

test('board-3d volume model eases into a new facing instead of snapping', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const nodes = new Map<number, EntityNode>()
  let facingYaw: number | undefined = 0
  const syncDeps = {
    nodes,
    getVisual: () => ({
      key: 'stub',
      geometry: new PlaneGeometry(0.88, 0.88),
      material: new MeshStandardMaterial(),
      frameGeometries: [],
      facingYaw,
      fxColors: [],
      outlineMaterial: stubOutlineMaterial,
      outlineTint: stubOutlineTint,
    }),
    createNode: createSyncNode(entityGroup),
    camera,
  }
  const state = createState([
    { id: 1, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
  ])

  syncEntityNodes(state, syncDeps)
  const node = nodes.get(1)
  assert.ok(node)
  node.spawnStartMs = null

  const down = new Vector3(0, 0, 1)
  const right = new Vector3(1, 0, 0)

  facingYaw = Math.PI / 2
  syncEntityNodes(state, syncDeps)

  // The turn tweens from the old facing: even the sync's own idle re-pose
  // leaves the mesh at the previous yaw instead of snapping to the target.
  assertVectorNear(meshWorldNormal(node.mesh), down)

  const midStep = applyNodePose(
    node,
    node.yawStartMs + node.yawDurationMs / 2,
    camera,
  )
  assert.equal(midStep.animating, true)
  const midNormal = meshWorldNormal(node.mesh)
  assert.ok(midNormal.x > EPSILON && midNormal.z > EPSILON)

  const endStep = applyNodePose(
    node,
    node.yawStartMs + node.yawDurationMs,
    camera,
  )
  assert.equal(endStep.animating, false)
  assertVectorNear(meshWorldNormal(node.mesh), right)
})

test('board-3d node yaw takes the shortest arc across the ±π seam', () => {
  const node = {
    facingYaw: -Math.PI / 2,
    fromYaw: Math.PI,
    yawStartMs: 0,
    yawDurationMs: 200,
  } as EntityNode

  // Up (π) → left (-π/2): the short way turns +90° through 5π/4, not the
  // long way back through yaw 0.
  const mid = nodeYawAtMs(node, 100)
  assert.ok(mid !== undefined && mid > Math.PI)
  assert.equal(nodeYawAtMs(node, 0), Math.PI)
  assert.equal(nodeYawAtMs(node, 200), Math.PI * 1.5)
})

test('board-3d volume roll rocks around the facing axis without tumbling', () => {
  const { mesh } = createFacingRig()
  mesh.position.set(0, 0, 0.09)
  const roll = 0.5

  applyVolumeOrientation(mesh, 0, Math.PI / 2)
  const frontBefore = meshWorldNormal(mesh)
  const upBefore = meshWorldUpAxis(mesh)
  applyVolumeOrientation(mesh, roll, Math.PI / 2)

  assertVectorNear(meshWorldNormal(mesh), frontBefore)
  assert.ok(Math.abs(upBefore.dot(meshWorldUpAxis(mesh)) - Math.cos(roll)) < EPSILON)
})

test('board-3d spawn pops past full size before settling', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const node = createSyncNode(entityGroup)(
    { id: 1, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
    0,
  )
  node.spawnStartMs = 0

  // Mid-animation the back-out ease overshoots 1; the card pops.
  applyNodePose(node, 140, camera)
  assert.ok(node.mesh.scale.y > 1)

  applyNodePose(node, 500, camera)
  assert.equal(node.mesh.scale.y, 1)
  assert.equal(node.spawnStartMs, null)
})

test('board-3d delayed spawn stays hidden until its stagger slot', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const node = createSyncNode(entityGroup)(
    { id: 1, name: 'baba', x: 0, y: 0, isText: false, props: [] },
    0,
  )
  node.spawnStartMs = 200

  applyNodePose(node, 50, camera)
  assert.ok(Math.abs(node.mesh.scale.y) < 1e-9)

  applyNodePose(node, 300, camera)
  assert.ok(node.mesh.scale.y > 0)
})

test('board-3d win hop lifts the card, lose slump squashes it', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const baseZ = 0.09

  const hopNode = createSyncNode(entityGroup)(
    { id: 1, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
    0,
  )
  hopNode.spawnStartMs = null
  hopNode.pulseStartMs = 0
  hopNode.pulseKind = 'hop'
  applyNodePose(hopNode, 215, camera)
  assert.ok(hopNode.mesh.position.z > baseZ)

  const slumpNode = createSyncNode(entityGroup)(
    { id: 2, name: 'baba', x: 0, y: 0, isText: false, props: [] },
    0,
  )
  slumpNode.spawnStartMs = null
  slumpNode.pulseStartMs = 0
  slumpNode.pulseKind = 'slump'
  applyNodePose(slumpNode, 215, camera)
  assert.ok(slumpNode.mesh.scale.y < 1)

  applyNodePose(slumpNode, 600, camera)
  assert.equal(slumpNode.pulseStartMs, null)
})

test('board-3d node roll interpolates along the eased move progress', () => {
  const node = {
    animStartMs: 0,
    animDurationMs: 200,
    fromRoll: 0,
    toRoll: 0.4,
  } as EntityNode

  assert.ok(Math.abs(nodeRollAtMs(node, 200) - 0.4) < EPSILON)
  assert.ok(Math.abs(nodeRollAtMs(node, 0)) < EPSILON)
  const mid = nodeRollAtMs(node, 100)
  assert.ok(mid > 0.2 && mid < 0.4)
})

const ruleState = (
  items: GameState['items'],
  activeIds: readonly number[],
  width = 1,
  height = 1,
  overriddenIds: readonly number[] = [],
): GameState => ({
  ...createState(items),
  width,
  height,
  activeTextIds: new Set(activeIds),
  overriddenTextIds: new Set(overriddenIds),
})

const createRuleSyncDeps = (entityGroup: Group, nodes: Map<number, EntityNode>) => ({
  nodes,
  getVisual: () => ({
    key: 'stub',
    geometry: new PlaneGeometry(0.88, 0.88),
    material: new MeshStandardMaterial(),
    frameGeometries: [],
    facingYaw: undefined,
    fxColors: [],
    outlineMaterial: stubOutlineMaterial,
    outlineTint: stubOutlineTint,
  }),
  createNode: createSyncNode(entityGroup),
  camera: createCamera(),
})

test('board-3d sync pulses a text card when it joins or leaves an active rule', () => {
  const { entityGroup } = createFacingRig()
  const nodes = new Map<number, EntityNode>()
  const deps = createRuleSyncDeps(entityGroup, nodes)
  const item = { id: 1, name: 'baba', x: 0, y: 0, isText: true, props: [] }

  // Board entry records the rule state silently — the spawn sweep already
  // carries the card in; a pulse storm on top would read as noise.
  syncEntityNodes(ruleState([item], [1]), deps)
  const node = nodes.get(1)
  assert.ok(node)
  assert.equal(node.ruleActive, true)
  assert.equal(node.pulseStartMs, null)

  // Same marks re-synced: nothing re-arms.
  syncEntityNodes(ruleState([item], [1]), deps)
  assert.equal(node.pulseStartMs, null)

  // Dropping out of the active rule arms the sag once.
  syncEntityNodes(ruleState([item], []), deps)
  assert.equal(node.ruleActive, false)
  assert.equal(node.pulseKind, 'rule-off')
  assert.equal(node.ruleFxDone, false)
  const armedAt = node.pulseStartMs
  assert.ok(armedAt !== null)

  // An unchanged resync must not re-arm or restart the pulse.
  syncEntityNodes(ruleState([item], []), deps)
  assert.equal(node.pulseStartMs, armedAt)

  // Rejoining pops the card back up.
  syncEntityNodes(ruleState([item], [1]), deps)
  assert.equal(node.pulseKind, 'rule-on')
  assert.equal(node.ruleFxDone, false)

  // A veto strike (active → overridden-only) sags through the same
  // boundary crossing; being freed from the strike pops again.
  node.pulseStartMs = null
  node.pulseKind = null
  node.ruleFxDone = true
  syncEntityNodes(ruleState([item], [], 1, 1, [1]), deps)
  assert.equal(node.pulseKind, 'rule-off')
  assert.equal(node.ruleOverridden, true)
  node.pulseStartMs = null
  node.pulseKind = null
  node.ruleFxDone = true
  syncEntityNodes(ruleState([item], []), deps)
  assert.equal(node.pulseKind, 'rule-on')
  assert.equal(node.ruleOverridden, false)
})

test('board-3d sync staggers simultaneous rule pulses in view order', () => {
  const { entityGroup } = createFacingRig()
  const nodes = new Map<number, EntityNode>()
  const deps = createRuleSyncDeps(entityGroup, nodes)
  const items = [
    { id: 1, name: 'baba', x: 0, y: 0, isText: true, props: [] },
    { id: 2, name: 'is', x: 1, y: 0, isText: true, props: [] },
    { id: 3, name: 'you', x: 2, y: 0, isText: true, props: [] },
  ]

  syncEntityNodes(ruleState(items, [], 3, 1), deps)
  syncEntityNodes(ruleState(items, [1, 2, 3], 3, 1), deps)

  const starts = [1, 2, 3].map((id) => {
    const node = nodes.get(id)
    assert.equal(node?.pulseKind, 'rule-on')
    return node?.pulseStartMs ?? -1
  })
  // A formed rule sweeps card to card: every start is distinct and the
  // spread matches the configured stagger.
  assert.equal(new Set(starts).size, 3)
  assert.ok(Math.abs(Math.max(...starts) - Math.min(...starts) - 110) < EPSILON)
})

test('board-3d sync ripples object entities when rules change their props', () => {
  const { entityGroup } = createFacingRig()
  const nodes = new Map<number, EntityNode>()
  const deps = createRuleSyncDeps(entityGroup, nodes)
  const wallRow = (props: readonly Property[]): GameState['items'] =>
    [1, 2, 3].map((id, x) => ({
      id,
      name: 'wall',
      x,
      y: 0,
      isText: false,
      props: [...props],
    }))

  // Board entry records props silently — no pulse storm on mount.
  syncEntityNodes(ruleState(wallRow(['stop']), [], 3, 1), deps)
  for (const id of [1, 2, 3]) {
    assert.equal(nodes.get(id)?.pulseStartMs, null)
    assert.equal(nodes.get(id)?.propSig, 'stop')
  }

  // `wall is stop` broke: every wall sags through the same boundary
  // crossing — the object layer answers the text row's farewell.
  syncEntityNodes(ruleState(wallRow([]), [], 3, 1), deps)
  for (const id of [1, 2, 3]) {
    const node = nodes.get(id)
    assert.equal(node?.pulseKind, 'rule-off')
    assert.ok(node?.pulseStartMs !== null)
    assert.equal(node?.ruleFxDone, false)
  }

  // Same props re-synced: nothing re-arms.
  const armedAt = nodes.get(1)?.pulseStartMs
  syncEntityNodes(ruleState(wallRow([]), [], 3, 1), deps)
  assert.equal(nodes.get(1)?.pulseStartMs, armedAt)

  // Re-formed rule pops every wall back up.
  nodes.forEach((node) => {
    node.pulseStartMs = null
    node.pulseKind = null
    node.ruleFxDone = true
  })
  syncEntityNodes(ruleState(wallRow(['stop']), [], 3, 1), deps)
  for (const id of [1, 2, 3]) {
    assert.equal(nodes.get(id)?.pulseKind, 'rule-on')
  }
})

test('board-3d sync ignores reorder-only prop list churn', () => {
  const { entityGroup } = createFacingRig()
  const nodes = new Map<number, EntityNode>()
  const deps = createRuleSyncDeps(entityGroup, nodes)
  const wall = (props: readonly Property[]): GameState['items'] => [
    { id: 1, name: 'wall', x: 0, y: 0, isText: false, props: [...props] },
  ]

  syncEntityNodes(ruleState(wall(['push', 'stop']), [], 1, 1), deps)
  const node = nodes.get(1)
  assert.ok(node)
  assert.equal(node.pulseStartMs, null)

  // Same set, different array order — the sorted signature is stable.
  syncEntityNodes(ruleState(wall(['stop', 'push']), [], 1, 1), deps)
  assert.equal(node.pulseStartMs, null)

  // A same-size swap (stop → pull) reads as a gain: the new nature pops.
  syncEntityNodes(ruleState(wall(['pull', 'push']), [], 1, 1), deps)
  assert.equal(node.pulseKind, 'rule-on')
})

test('board-3d rule pulse pops a joining card and sags a leaving one', () => {
  const { entityGroup } = createFacingRig()
  const camera = createCamera()
  const baseZ = 0.09

  const onNode = createSyncNode(entityGroup)(
    { id: 1, name: 'baba', x: 0, y: 0, isText: true, props: [] },
    0,
  )
  onNode.spawnStartMs = null
  onNode.pulseStartMs = 0
  onNode.pulseKind = 'rule-on'
  applyNodePose(onNode, 215, camera)
  assert.ok(onNode.mesh.position.z > baseZ)
  assert.ok(onNode.mesh.scale.y > 1)

  const offNode = createSyncNode(entityGroup)(
    { id: 2, name: 'baba', x: 0, y: 0, isText: true, props: [] },
    0,
  )
  offNode.spawnStartMs = null
  offNode.pulseStartMs = 0
  offNode.pulseKind = 'rule-off'
  applyNodePose(offNode, 215, camera)
  assert.ok(offNode.mesh.scale.y < 1)
  // A sag does not hop: the card deflates in place.
  assert.ok(offNode.mesh.position.z <= baseZ + EPSILON)
})
