import type { FogExp2, PerspectiveCamera } from 'three'

import { selectClayCameraTier } from './clay-config.js'
import { BOARD3D_CAMERA_CONFIG } from './board-3d-config-camera.js'

const {
  CAMERA_PITCH_RAD,
  CAMERA_DISTANCE_SCALE,
  CAMERA_DISTANCE_MIN,
  CAMERA_LOOK_AT_OFFSET_Y,
  CAMERA_LOOK_AT_DEPTH_BIAS,
  FOG_REFERENCE_ASPECT,
} = BOARD3D_CAMERA_CONFIG

type UpdateRendererCameraArgs = {
  camera: PerspectiveCamera
  fog: FogExp2
  fogBaseDensity: number
  boardWidth: number
  boardHeight: number
  viewportWidth: number
  viewportHeight: number
  updateLightRig: () => void
}

export const updateRendererCamera = (
  args: UpdateRendererCameraArgs,
): void => {
  const {
    camera,
    fog,
    fogBaseDensity,
    boardWidth,
    boardHeight,
    viewportWidth,
    viewportHeight,
    updateLightRig,
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
  const distanceForAspect = (value: number): number => {
    const distByWidth = spanX / (2 * Math.tan(halfFov) * value)
    const framingDistance =
      Math.max(distByWidth, distByHeight) + cameraTier.distancePadding
    return Math.max(
      CAMERA_DISTANCE_MIN,
      framingDistance * CAMERA_DISTANCE_SCALE,
    )
  }
  const distance = distanceForAspect(aspect)

  const lookAtY = cameraTier.lookAtY + CAMERA_LOOK_AT_OFFSET_Y
  const lookAtZ = height * CAMERA_LOOK_AT_DEPTH_BIAS
  const cameraHeight = lookAtY + Math.tan(CAMERA_PITCH_RAD) * distance

  camera.aspect = aspect
  camera.position.set(0, cameraHeight, distance)
  camera.lookAt(0, lookAtY, lookAtZ)
  camera.updateProjectionMatrix()

  // FogExp2 thickens with view depth, so the extra distance narrow
  // viewports force would haze the whole board. Hold the fog factor at
  // the look-at point to its value at the tuned reference aspect.
  const viewDepthFor = (value: number): number =>
    Math.hypot(value - lookAtZ, Math.tan(CAMERA_PITCH_RAD) * value)
  fog.density =
    fogBaseDensity *
    (viewDepthFor(distanceForAspect(FOG_REFERENCE_ASPECT)) /
      viewDepthFor(distance))

  updateLightRig()
}
