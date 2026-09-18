export const BOARD3D_ANIMATION_CONFIG = {
  MOVE_ANIM_MS: 170,
  SPAWN_ANIM_MS: 230,
  DESPAWN_ANIM_MS: 170,
  SPAWN_SCALE_FROM: 0.0,
  // Cards unwind from this roll offset while materializing (radians).
  SPAWN_ROLL_IN: -0.38,
  DESPAWN_SCALE_TO: 0.0,
  // Spin-out applied across the despawn shrink (radians, direction
  // alternates per node via rollStep parity).
  DESPAWN_SPIN: 0.55,
  LAND_PULSE_MS: 125,
  JUMP_HEIGHT: 0.17,
  IDLE_STRETCH_CYCLE_MS: 1000,
  // Idle wakeup cadence: one slow timer drives both idle motions — sprite
  // frames dedupe to SPRITE_FRAME_MS inside it, while stretch re-poses need
  // a few samples per cycle or the sine collapses into a two-pose flip.
  IDLE_TICK_MS: 250,
  // Idle sprite animation cadence: the shared frame tick advances at this
  // interval, and each card reads it through its own frame offset so wobbles
  // stay out of phase. Driven by the idle timer's dedupe — ~2 swaps/sec —
  // instead of keeping RAF alive, so static boards render on demand only.
  SPRITE_FRAME_MS: 500,
  IDLE_STRETCH_Y_AMP: 0.035,
  IDLE_STRETCH_X_AMP: 0.014,
  // FLOAT prop levitation: a slow sine bob layered on FLOAT_ITEM_LIFT_Z,
  // stepped at the idle timer's cadence like the stretch — no RAF held.
  FLOAT_BOB_CYCLE_MS: 1500,
  FLOAT_BOB_AMP: 0.04,
  MOVE_STRETCH_FACTOR: 0.17,
  MOVE_SQUASH_FACTOR: 0.14,
  LANDING_PULSE_HEIGHT: 0.04,
  SPAWN_VERTICAL_OFFSET: 0.16,
  DESPAWN_VERTICAL_OFFSET: 0.12,
  MOVE_ROLL_AMPLITUDE: 0.18,
} as const
