import type { DirectionalLight } from 'three'

import {
  BOARD3D_CAMERA_CONFIG,
  BOARD3D_LIGHTING_CONFIG,
  BOARD3D_SHADOW_CONFIG,
} from './board-3d-config.js'

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

const {
  CAMERA_LOOK_AT_DEPTH_BIAS,
} = BOARD3D_CAMERA_CONFIG

const {
  LIGHT_HEIGHT_Y_BASE,
  LIGHT_HEIGHT_Y_SPAN_MUL,
  SIDE_LIGHT_OFFSET_X_BASE,
  SIDE_LIGHT_OFFSET_X_MUL,
  SIDE_LIGHT_OFFSET_Z_BASE,
  SIDE_LIGHT_OFFSET_Z_MUL,
  LIGHT_CAMERA_SIDE_TILT_RAD,
  LIGHT_HEIGHT_Y_EXTRA,
  LIGHT_DROP_Y_MIN,
  LIGHT_DROP_Y_SUB,
  LIGHT_TARGET_Y,
} = BOARD3D_LIGHTING_CONFIG

const {
  SHADOW_FRUSTUM_BASE,
  SHADOW_FRUSTUM_SPAN_MUL,
  SHADOW_FAR_PADDING,
  SHADOW_FRUSTUM_DISTANCE_SCALE,
  SHADOW_ANGLE_SPAN_BOOST,
} = BOARD3D_SHADOW_CONFIG

type UpdateRendererLightRigArgs = {
  preset: ClayPreset
  leftLight: DirectionalLight
  rightLight: DirectionalLight
  boardWidth: number
  boardHeight: number
  updateLightShadowCamera: (
    light: DirectionalLight,
    span: number,
    far: number,
  ) => void
}

export const updateRendererLightRig = (
  args: UpdateRendererLightRigArgs,
): void => {
  const {
    preset,
    leftLight,
    rightLight,
    boardWidth,
    boardHeight,
    updateLightShadowCamera,
  } = args

  const width = Math.max(1, boardWidth)
  const height = Math.max(1, boardHeight)
  const span = Math.max(width, height)
  const topHeightY = Math.max(
    LIGHT_HEIGHT_Y_BASE,
    span * LIGHT_HEIGHT_Y_SPAN_MUL + LIGHT_HEIGHT_Y_EXTRA,
  )
  const sideOffsetX = width * SIDE_LIGHT_OFFSET_X_MUL + SIDE_LIGHT_OFFSET_X_BASE
  const sideOffsetZ = Math.max(SIDE_LIGHT_OFFSET_Z_BASE, height * SIDE_LIGHT_OFFSET_Z_MUL)
  const targetZ = height * CAMERA_LOOK_AT_DEPTH_BIAS
  const lightDropY = Math.max(
    LIGHT_DROP_Y_MIN,
    topHeightY - LIGHT_DROP_Y_SUB,
  )
  const lightDepthOffset = Math.tan(LIGHT_CAMERA_SIDE_TILT_RAD) * lightDropY
  const lightZ = Math.max(sideOffsetZ, targetZ + lightDepthOffset)
  const lightToTargetDistance = Math.hypot(sideOffsetX, lightDropY, lightZ - targetZ)
  const baseShadowSpan = span * SHADOW_FRUSTUM_SPAN_MUL + SHADOW_FRUSTUM_BASE
  const tiltRatio = Math.abs(lightZ - targetZ) / Math.max(1, lightDropY)
  const shadowSpan = baseShadowSpan * (1 + tiltRatio * SHADOW_ANGLE_SPAN_BOOST)
  const shadowFar = Math.max(
    preset.lighting.topLightShadowFar,
    lightToTargetDistance + shadowSpan * SHADOW_FRUSTUM_DISTANCE_SCALE + SHADOW_FAR_PADDING,
  )

  leftLight.position.set(-sideOffsetX, topHeightY, lightZ)
  leftLight.target.position.set(0, LIGHT_TARGET_Y, targetZ)
  leftLight.target.updateMatrixWorld()

  rightLight.position.set(sideOffsetX, topHeightY, lightZ)
  rightLight.target.position.set(0, LIGHT_TARGET_Y, targetZ)
  rightLight.target.updateMatrixWorld()

  if (leftLight.castShadow) updateLightShadowCamera(leftLight, shadowSpan, shadowFar)
  if (rightLight.castShadow) updateLightShadowCamera(rightLight, shadowSpan, shadowFar)
}
