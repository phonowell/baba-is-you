// Pixel-particle bursts and post-processing "mood" pulses for board events:
// card spawns/desawns ride small square particles (the original game's poof
// language), level end states tint the whole frame through the existing
// bloom/saturation/vignette handles. All values are board-space units
// (one cell = 1) and milliseconds unless noted.
export const BOARD3D_EFFECTS_CONFIG = {
  // Hard cap on live particles; the oldest get recycled past this point.
  PARTICLE_MAX: 240,
  PARTICLE_GRAVITY: 3.4,
  PARTICLE_FLOOR_Z: -0.18,
  PARTICLE_FADE_START: 0.62,

  // Spawn: small puff ring as the card pops in.
  SPAWN_PUFF_COUNT: 6,
  SPAWN_PUFF_LIFE_MS: 380,
  SPAWN_PUFF_SIZE: 0.085,
  SPAWN_PUFF_LATERAL_SPEED: 1.15,
  SPAWN_PUFF_UP_SPEED: 0.85,
  SPAWN_PUFF_GRAVITY_SCALE: 0.9,

  // Despawn: denser, faster poof — this carries most of the "destroyed" read.
  DESPAWN_POOF_COUNT: 11,
  DESPAWN_POOF_LIFE_MS: 520,
  DESPAWN_POOF_SIZE: 0.105,
  DESPAWN_POOF_LATERAL_SPEED: 1.9,
  DESPAWN_POOF_UP_SPEED: 1.7,
  DESPAWN_POOF_GRAVITY_SCALE: 1.1,
  // White squares mixed into the card's own colours, like the source game.
  DESPAWN_POOF_WHITE: '#f6f3ea',
  DESPAWN_POOF_WHITE_RATIO: 0.35,

  // Win: golden fountain columns over the you/win cards.
  WIN_COLORS: ['#fff6d8', '#ffe9a3', '#f7c948', '#ffffff'],
  WIN_BURST_COUNT: 16,
  WIN_BURST_LIFE_MS: 1050,
  WIN_BURST_SIZE: 0.1,
  WIN_BURST_LATERAL_SPEED: 0.85,
  WIN_BURST_UP_SPEED: 3.1,
  WIN_BURST_GRAVITY_SCALE: 0.75,
  // Bloom/saturation pulse: spikes then settles on a warm hold until the
  // status clears. Values are additive on top of the readability baseline.
  WIN_MOOD_DECAY_MS: 1100,
  WIN_BLOOM_PEAK: 1.15,
  WIN_BLOOM_HOLD: 0.16,
  WIN_SATURATION_PEAK: 0.4,
  WIN_SATURATION_HOLD: 0.12,

  // Lose: grey ash motes drifting up while the frame desaturates and the
  // vignette closes in — held until undo/restart.
  LOSE_COLORS: ['#9aa3b2', '#7d8593', '#c3cad4'],
  LOSE_ASH_MAX_SPOTS: 9,
  LOSE_ASH_PER_SPOT: 5,
  LOSE_ASH_LIFE_MS: 1500,
  LOSE_ASH_SIZE: 0.075,
  LOSE_ASH_LATERAL_SPEED: 0.22,
  LOSE_ASH_UP_SPEED: 0.55,
  LOSE_ASH_GRAVITY_SCALE: -0.12,
  LOSE_MOOD_FADE_MS: 650,
  LOSE_SATURATION: -0.95,
  LOSE_BLOOM_DROP: -0.05,
  LOSE_VIGNETTE_ADD: 0.34,

  // Whole-board ripple pulses (hop for win, slump for lose) staggered
  // outward from the effect origin.
  PULSE_MS: 430,
  PULSE_HOP_HEIGHT: 0.34,
  PULSE_HOP_STRETCH: 0.22,
  PULSE_SLUMP_Y: 0.3,
  PULSE_SLUMP_X: 0.14,
  PULSE_RIPPLE_MS_PER_CELL: 42,
  PULSE_RIPPLE_MAX_MS: 520,

  // Board-entry stagger: cards materialize on a diagonal sweep.
  SPAWN_STAGGER_MS_PER_CELL: 14,
} as const
