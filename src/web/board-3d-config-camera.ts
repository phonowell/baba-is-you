const CAMERA_PITCH_RAD_BASE = (75 * Math.PI) / 180

export const CAMERA_TILT_FROM_VERTICAL_RAD_BASE =
  Math.PI / 2 - CAMERA_PITCH_RAD_BASE

export const BOARD3D_CAMERA_CONFIG = {
  CAMERA_PITCH_RAD: CAMERA_PITCH_RAD_BASE,
  CAMERA_DISTANCE_SCALE: 0.26,
  CAMERA_DISTANCE_MIN: 1.45,
  CAMERA_LOOK_AT_OFFSET_Y: -0.58,
  CAMERA_LOOK_AT_DEPTH_BIAS: 0.14,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 180,
  // Aspect the fog density is tuned at. Narrower viewports push the
  // camera farther out, so density is rescaled to keep the board's fog
  // factor at this framing's level.
  FOG_REFERENCE_ASPECT: 16 / 9,
  WORLD_ROTATION_X: -Math.PI / 2,
} as const
