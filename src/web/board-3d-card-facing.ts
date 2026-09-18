import { Vector3 } from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'

import type { Camera, Mesh } from 'three'

const { CARD_FACE_CAMERA_BLEND } = BOARD3D_LAYOUT_CONFIG
const { VOXEL_STAND_LEAN } = BOARD3D_VOXEL_CONFIG

const HORIZONTAL_FALLBACK = new Vector3(0, 0, 1)
const MIN_DIRECTION_LENGTH_SQ = 1e-4

const cardWorldPos = new Vector3()
const toCamera = new Vector3()
const facingNormal = new Vector3()

export const applyCardOrientation = (
  mesh: Mesh,
  roll: number,
  camera: Camera,
  facesCamera: boolean,
): void => {
  if (!facesCamera) {
    mesh.rotation.set(0, 0, roll)
    return
  }
  camera.getWorldDirection(toCamera).negate()
  facingNormal.set(toCamera.x, 0, toCamera.z)
  if (facingNormal.lengthSq() < MIN_DIRECTION_LENGTH_SQ) {
    facingNormal.copy(HORIZONTAL_FALLBACK)
  }
  facingNormal
    .normalize()
    .lerp(toCamera, CARD_FACE_CAMERA_BLEND)
    .normalize()
  mesh.getWorldPosition(cardWorldPos)
  mesh.lookAt(cardWorldPos.add(facingNormal))
  mesh.rotateZ(roll)
}

// Group-space vertical axis: entityGroup lives inside the world group that
// is pitched -90deg around X, so the group's +Z is true world up.
const BOARD_UP_AXIS = new Vector3(0, 0, 1)

// Volumetric models stand on the board like figurines instead of
// billboarding: the geometry's sprite-up (+Y) leans back just enough for the
// steep camera to read the face, its front (+Z) faces the board-down
// direction, then `yaw` spins the whole model around the vertical axis so
// each facing shows a real side and the lean stays behind the facing.
export const applyVolumeOrientation = (
  mesh: Mesh,
  roll: number,
  yaw: number,
): void => {
  mesh.rotation.set(Math.PI / 2 - VOXEL_STAND_LEAN, 0, 0)
  mesh.rotateOnWorldAxis(BOARD_UP_AXIS, yaw)
  mesh.rotateZ(roll)
}
