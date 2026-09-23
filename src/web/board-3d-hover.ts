import { Color, Mesh, MeshBasicMaterial, ShapeGeometry, Vector3 } from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { buildRoundedRectShape } from './board-3d-ground-shape.js'

import type { Camera, Group } from 'three'

const {
  HOVER_CELL_Z,
  HOVER_CELL_HALF_SIZE,
  HOVER_CELL_COLOR,
  HOVER_CELL_OPACITY,
  GROUND_ACTIVE_FILL_Z,
} = BOARD3D_LAYOUT_CONFIG

// Container-space rect — in app coordinates, not viewport coordinates
// (the forced-landscape frame can rotate the app; callers map first).
export type BoardPickRect = {
  left: number
  top: number
  width: number
  height: number
}

export type BoardHoverVisual = {
  setCell: (
    cellX: number,
    cellY: number,
    boardWidth: number,
    boardHeight: number,
  ) => void
  clear: () => void
  dispose: () => void
}

const rayOrigin = new Vector3()
const rayPoint = new Vector3()

// Screen point → board cell: the pointer ray is unprojected and dropped
// onto the play-area plane. The world group lies rotated -90° around X
// (BOARD3D_CAMERA_CONFIG.WORLD_ROTATION_X), so board-local x/y land on
// world x/z and board-local z becomes world height.
export const pickBoardCell = (
  camera: Camera,
  rect: BoardPickRect,
  clientX: number,
  clientY: number,
  boardWidth: number,
  boardHeight: number,
): { x: number; y: number } | null => {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    boardWidth <= 0 ||
    boardHeight <= 0
  ) {
    return null
  }
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1)
  const origin = rayOrigin.setFromMatrixPosition(camera.matrixWorld)
  const dir = rayPoint.set(ndcX, ndcY, 0.5).unproject(camera).sub(origin)
  // Rays that don't head down to the board plane (sky, horizon) can never
  // produce a cell.
  if (!(dir.y < 0)) return null
  const t = (GROUND_ACTIVE_FILL_Z - origin.y) / dir.y
  const hitX = origin.x + dir.x * t
  const hitZ = origin.z + dir.z * t
  const cellX = Math.floor(hitX + boardWidth / 2)
  const cellY = Math.floor(hitZ + boardHeight / 2)
  if (cellX < 0 || cellX >= boardWidth || cellY < 0 || cellY >= boardHeight) {
    return null
  }
  return { x: cellX, y: cellY }
}

export const createBoardHoverVisual = (world: Group): BoardHoverVisual => {
  const geometry = new ShapeGeometry(
    buildRoundedRectShape(HOVER_CELL_HALF_SIZE, HOVER_CELL_HALF_SIZE),
  )
  // Basic material — the marker reads as a light wash on the cell, so it
  // skips lighting/shadows; `fog: false` keeps the faint fill legible in
  // the hazed far rows.
  const material = new MeshBasicMaterial({
    color: new Color(HOVER_CELL_COLOR),
    transparent: true,
    opacity: HOVER_CELL_OPACITY,
    depthWrite: false,
    fog: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.z = HOVER_CELL_Z
  mesh.visible = false
  world.add(mesh)

  return {
    setCell: (cellX, cellY, boardWidth, boardHeight) => {
      mesh.position.x = cellX - (boardWidth - 1) / 2
      mesh.position.y = (boardHeight - 1) / 2 - cellY
      mesh.visible = true
    },
    clear: () => {
      mesh.visible = false
    },
    dispose: () => {
      world.remove(mesh)
      geometry.dispose()
      material.dispose()
    },
  }
}
