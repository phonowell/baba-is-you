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
  WORLD_ROTATION_X: -Math.PI / 2,
} as const

export const BOARD3D_PARALLAX_CONFIG = {
  // Pointer parallax slides the camera a fraction of a cell — enough to
  // feel the board's depth, small enough to keep the framing honest.
  PARALLAX_MAX_OFFSET_X: 0.3,
  PARALLAX_MAX_OFFSET_Y: 0.2,
  // Exponential smoothing time constant; ~3 tau lands the offset.
  PARALLAX_TAU_MS: 90,
  PARALLAX_EPSILON: 0.002,
} as const
