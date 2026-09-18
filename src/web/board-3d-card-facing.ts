import { Vector3 } from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'

import type { Camera, Mesh } from 'three'

const { CARD_FACE_CAMERA_BLEND } = BOARD3D_LAYOUT_CONFIG

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
