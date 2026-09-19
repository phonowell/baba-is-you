import { Matrix4, Quaternion, Vector3 } from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'

import type { Camera, Mesh, Object3D } from 'three'

const { CARD_FACE_CAMERA_BLEND } = BOARD3D_LAYOUT_CONFIG

const HORIZONTAL_FALLBACK = new Vector3(0, 0, 1)
const MIN_DIRECTION_LENGTH_SQ = 1e-4

const toCamera = new Vector3()
const facingNormal = new Vector3()
const lookAtMatrix = new Matrix4()
const parentRotationMatrix = new Matrix4()
const parentQuaternion = new Quaternion()
const ORIGIN = new Vector3(0, 0, 0)
// Card meshes keep the default Object3D up axis — `lookAt` used it for the
// world basis, so the shared basis does too.
const CARD_UP = new Vector3(0, 1, 0)

// The orientation a camera-facing card takes: parentWorld⁻¹ ×
// lookAt(facingNormal). Both factors are identical for every mesh under
// `parent` — the lookAt direction never depended on the node's position —
// so one basis serves a whole frame of cards (and particles) instead of
// re-deriving it per node.
export type CardFacing = {
  quaternion: Quaternion
}

export const cardFacingForParent = (
  camera: Camera,
  parent: Object3D | null,
): CardFacing => {
  camera.getWorldDirection(toCamera).negate()
  facingNormal.set(toCamera.x, 0, toCamera.z)
  if (facingNormal.lengthSq() < MIN_DIRECTION_LENGTH_SQ) {
    facingNormal.copy(HORIZONTAL_FALLBACK)
  }
  facingNormal
    .normalize()
    .lerp(toCamera, CARD_FACE_CAMERA_BLEND)
    .normalize()
  // lookAt(eye = facingNormal, target = origin): the +Z column comes out
  // along facingNormal — the same world rotation `mesh.lookAt(pos + n)`
  // produced, minus the per-node position read.
  lookAtMatrix.lookAt(facingNormal, ORIGIN, CARD_UP)
  const quaternion = new Quaternion().setFromRotationMatrix(lookAtMatrix)
  if (parent) {
    // Same rotation extraction Object3D.lookAt applies, but freshened:
    // updateWorldMatrix covers the not-yet-rendered first frame.
    parent.updateWorldMatrix(true, false)
    parentRotationMatrix.extractRotation(parent.matrixWorld)
    quaternion.premultiply(
      parentQuaternion.setFromRotationMatrix(parentRotationMatrix).invert(),
    )
  }
  return { quaternion }
}

export const applyCardOrientation = (
  mesh: Mesh,
  roll: number,
  camera: Camera,
  facesCamera: boolean,
  facing?: CardFacing,
): void => {
  if (!facesCamera) {
    mesh.rotation.set(0, 0, roll)
    return
  }
  const basis = facing ?? cardFacingForParent(camera, mesh.parent)
  mesh.quaternion.copy(basis.quaternion)
  mesh.rotateZ(roll)
}

// Group-space vertical axis: entityGroup lives inside the world group that
// is pitched -90deg around X, so the group's +Z is true world up.
const BOARD_UP_AXIS = new Vector3(0, 0, 1)

// Volumetric models stand on the board like figurines instead of
// billboarding: the geometry's sprite-up (+Y) goes fully vertical and its
// front (+Z) faces the board-down direction, then `yaw` spins the whole
// model around the vertical axis so each facing shows a real side.
export const applyVolumeOrientation = (
  mesh: Mesh,
  roll: number,
  yaw: number,
): void => {
  mesh.rotation.set(Math.PI / 2, 0, 0)
  mesh.rotateOnWorldAxis(BOARD_UP_AXIS, yaw)
  mesh.rotateZ(roll)
}
