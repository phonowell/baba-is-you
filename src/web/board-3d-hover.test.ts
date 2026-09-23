import assert from 'node:assert/strict'
import test from 'node:test'

import { Group, PerspectiveCamera } from 'three'

import {
  createBoardHoverVisual,
  pickBoardCell,
} from './board-3d-hover.js'

import type { Mesh } from 'three'

// Camera parked straight above the board looking down, matching the
// scene's orientation (world x → screen x, world -z → screen up).
const overheadCamera = (): PerspectiveCamera => {
  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.up.set(0, 0, -1)
  camera.position.set(0, 10, 0.001)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

const rect = { left: 0, top: 0, width: 1000, height: 1000 }

test('pickBoardCell maps a near-center point to the middle cell', () => {
  // The board centre sits exactly on a grid line for even sizes, so the
  // test point leans just into cell (5, 5).
  const cell = pickBoardCell(overheadCamera(), rect, 550, 550, 10, 10)
  assert.deepEqual(cell, { x: 5, y: 5 })
})

test('pickBoardCell resolves columns and rows around the grid', () => {
  const camera = overheadCamera()
  // fov 50 at ~10.2 units depth: 1 NDC x ≈ 4.77 world cells.
  assert.deepEqual(pickBoardCell(camera, rect, 700, 550, 10, 10), {
    x: 6,
    y: 5,
  })
  assert.deepEqual(pickBoardCell(camera, rect, 550, 60, 10, 10), {
    x: 5,
    y: 0,
  })
  assert.deepEqual(pickBoardCell(camera, rect, 550, 940, 10, 10), {
    x: 5,
    y: 9,
  })
})

test('pickBoardCell returns null off the grid or above the horizon', () => {
  const camera = overheadCamera()
  assert.equal(pickBoardCell(camera, rect, 1060, 550, 10, 10), null)
  assert.equal(pickBoardCell(camera, rect, -60, 550, 10, 10), null)

  const horizonCamera = new PerspectiveCamera(50, 1, 0.1, 100)
  horizonCamera.position.set(0, 5, 10)
  horizonCamera.lookAt(0, 5, 0)
  horizonCamera.updateMatrixWorld()
  horizonCamera.updateProjectionMatrix()
  // A ray pointing up can never meet the board plane.
  assert.equal(
    pickBoardCell(horizonCamera, rect, 500, 0, 10, 10),
    null,
  )
})

test('pickBoardCell rejects degenerate rects and boards', () => {
  const camera = overheadCamera()
  assert.equal(
    pickBoardCell(camera, { left: 0, top: 0, width: 0, height: 100 }, 0, 0, 4, 4),
    null,
  )
  assert.equal(pickBoardCell(camera, rect, 500, 500, 0, 4), null)
})

test('hover visual marks the cell centre and hides on clear/dispose', () => {
  const world = new Group()
  const visual = createBoardHoverVisual(world)
  const mesh = world.children[0] as Mesh

  assert.equal(mesh.visible, false)
  visual.setCell(2, 1, 8, 6)
  assert.equal(mesh.visible, true)
  assert.equal(mesh.position.x, -1.5)
  assert.equal(mesh.position.y, 1.5)

  visual.clear()
  assert.equal(mesh.visible, false)

  visual.setCell(0, 0, 8, 6)
  visual.dispose()
  assert.equal(world.children.length, 0)
})
