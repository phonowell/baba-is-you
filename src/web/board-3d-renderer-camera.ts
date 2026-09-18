import type { PerspectiveCamera } from 'three'

import { selectClayCameraTier } from './clay-config.js'
import { BOARD3D_CAMERA_CONFIG } from './board-3d-config-camera.js'

const {
  CAMERA_PITCH_RAD,
  CAMERA_DISTANCE_SCALE,
  CAMERA_DISTANCE_MIN,
  CAMERA_LOOK_AT_OFFSET_Y,
  CAMERA_LOOK_AT_DEPTH_BIAS,
} = BOARD3D_CAMERA_CONFIG

type UpdateRendererCameraArgs = {
  camera: PerspectiveCamera
  boardWidth: number
  boardHeight: number
  viewportWidth: number
  viewportHeight: number
  updateLightRig: () => void
  updateBokehFocus: (focusDistance: number) => void
}

export const updateRendererCamera = (
  args: UpdateRendererCameraArgs,
): void => {
  const {
    camera,
    boardWidth,
    boardHeight,
    viewportWidth,
    viewportHeight,
    updateLightRig,
    updateBokehFocus,
  } = args

  const width = Math.max(1, boardWidth)
  const height = Math.max(1, boardHeight)
  const cameraTier = selectClayCameraTier(width, height)
  const aspect = viewportWidth / viewportHeight
  const spanX = width + cameraTier.spanPadding
  const spanY = height + cameraTier.spanPadding
  camera.fov = cameraTier.fov
  const halfFov = (camera.fov * Math.PI) / 360
  const distByHeight = spanY / (2 * Math.tan(halfFov))
  const distByWidth = spanX / (2 * Math.tan(halfFov) * aspect)
  const framingDistance =
    Math.max(distByWidth, distByHeight) + cameraTier.distancePadding
  const distance = Math.max(CAMERA_DISTANCE_MIN, framingDistance * CAMERA_DISTANCE_SCALE)

  const lookAtY = cameraTier.lookAtY + CAMERA_LOOK_AT_OFFSET_Y
  const lookAtZ = height * CAMERA_LOOK_AT_DEPTH_BIAS
  const cameraHeight = lookAtY + Math.tan(CAMERA_PITCH_RAD) * distance

  camera.aspect = aspect
  camera.position.set(0, cameraHeight, distance)
  camera.lookAt(0, lookAtY, lookAtZ)
  camera.updateProjectionMatrix()
  updateLightRig()
  // View depth of the board center: the camera looks at this point, so its
  // distance to the camera position is the bokeh focal distance. Using the
  // camera's z coordinate alone under-focuses by ~4x at this pitch.
  const focusDistance = Math.hypot(cameraHeight - lookAtY, distance - lookAtZ)
  updateBokehFocus(focusDistance)
}
