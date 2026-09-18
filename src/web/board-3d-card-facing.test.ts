import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
} from './board-3d-card-facing.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import { createEntityNode } from './board-3d-node-create.js'
import { applyNodePose, nodeRollAtMs } from './board-3d-node-pose.js'
import { syncEntityNodes } from './board-3d-node-sync.js'
import { cardFacesCamera } from './board-3d-shared-item.js'

import type { CanvasTexture } from 'three'
import type { GameState } from '../logic/types.js'
import type { EntityNode } from './board-3d-node-types.js'

const EPSILON = 1e-6

const { CARD_FACE_CAMERA_BLEND } = BOARD3D_LAYOUT_CONFIG

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
  const groundHug = { id: 1, name: 'water', x: 0, y: 0, isText: false, props: [] }
  const object = { id: 2, name: 'baba', x: 0, y: 0, isText: false, props: [] }
  const text = { id: 3, name: 'win', x: 0, y: 0, isText: true, props: [] }

  assert.equal(cardFacesCamera(groundHug), false)
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

  // The model leans back by VOXEL_STAND_LEAN so the steep camera reads its
  // face; yaw then points the lean away from the facing direction.
  const lean = BOARD3D_VOXEL_CONFIG.VOXEL_STAND_LEAN
  const sinL = Math.sin(lean)
  const cosL = Math.cos(lean)
  const cases: [number, Vector3][] = [
    [0, new Vector3(0, sinL, cosL)],
    [Math.PI / 2, new Vector3(cosL, sinL, 0)],
    [Math.PI, new Vector3(0, sinL, -cosL)],
    [-Math.PI / 2, new Vector3(-cosL, sinL, 0)],
  ]
  for (const [yaw, expectedFront] of cases) {
    applyVolumeOrientation(mesh, 0, yaw)
    assertVectorNear(meshWorldNormal(mesh), expectedFront)
    // The model never lies down: its up axis stays mostly vertical.
    assert.ok(Math.abs(meshWorldUpAxis(mesh).y - cosL) < EPSILON)
  }
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
