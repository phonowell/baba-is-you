// Pixel-particle bursts and post-processing "mood" pulses for board events:
// card spawns/desawns ride small square particles (the original game's poof
// language), level end states tint the whole frame through the existing
// bloom/saturation/vignette handles. All values are board-space units
// (one cell = 1) and milliseconds unless noted.
export const BOARD3D_EFFECTS_CONFIG = {
  // Hard cap on live particles; the oldest get recycled past this point.
  PARTICLE_MAX: 360,
  PARTICLE_GRAVITY: 3.4,
  PARTICLE_FLOOR_Z: -0.18,
  // Fade holds opacity until late — particles stay solid for most of
  // their arc instead of ghosting out halfway.
  PARTICLE_FADE_START: 0.72,

  // Spawn: small puff ring as the card pops in. Card-colour puffs vanish
  // on like-coloured ground (wall-green on grass), so a share of the ring
  // is forced white — same trick as the despawn poof.
  SPAWN_PUFF_COUNT: 9,
  SPAWN_PUFF_LIFE_MS: 460,
  SPAWN_PUFF_SIZE: 0.16,
  SPAWN_PUFF_LATERAL_SPEED: 1.55,
  SPAWN_PUFF_UP_SPEED: 1.1,
  SPAWN_PUFF_GRAVITY_SCALE: 0.9,
  SPAWN_PUFF_WHITE: '#f6f3ea',
  SPAWN_PUFF_WHITE_RATIO: 0.4,

  // Despawn: denser, faster poof — this carries most of the "destroyed" read.
  DESPAWN_POOF_COUNT: 15,
  DESPAWN_POOF_LIFE_MS: 640,
  DESPAWN_POOF_SIZE: 0.17,
  DESPAWN_POOF_LATERAL_SPEED: 2.4,
  DESPAWN_POOF_UP_SPEED: 2.1,
  DESPAWN_POOF_GRAVITY_SCALE: 1.1,
  // White squares mixed into the card's own colours, like the source game.
  DESPAWN_POOF_WHITE: '#f6f3ea',
  DESPAWN_POOF_WHITE_RATIO: 0.35,

  // Win: golden fountain columns over the you/win cards.
  WIN_COLORS: ['#fff6d8', '#ffe9a3', '#f7c948', '#ffffff'],
  WIN_BURST_COUNT: 24,
  WIN_BURST_LIFE_MS: 1250,
  WIN_BURST_SIZE: 0.16,
  WIN_BURST_LATERAL_SPEED: 1.15,
  WIN_BURST_UP_SPEED: 3.8,
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
  LOSE_COLORS: ['#aab4c2', '#8b95a5', '#d3dae3'],
  LOSE_ASH_MAX_SPOTS: 9,
  LOSE_ASH_PER_SPOT: 7,
  LOSE_ASH_LIFE_MS: 1800,
  LOSE_ASH_SIZE: 0.12,
  LOSE_ASH_LATERAL_SPEED: 0.3,
  LOSE_ASH_UP_SPEED: 0.7,
  LOSE_ASH_GRAVITY_SCALE: -0.12,
  LOSE_MOOD_FADE_MS: 650,
  LOSE_SATURATION: -0.95,
  LOSE_BLOOM_DROP: -0.05,
  LOSE_VIGNETTE_ADD: 0.34,

  // Whole-board ripple pulses (hop for win, slump for lose) staggered
  // outward from the effect origin.
  PULSE_MS: 430,
  PULSE_HOP_HEIGHT: 0.4,
  PULSE_HOP_STRETCH: 0.24,
  PULSE_SLUMP_Y: 0.32,
  PULSE_SLUMP_X: 0.16,
  PULSE_RIPPLE_MS_PER_CELL: 42,
  PULSE_RIPPLE_MAX_MS: 520,

  // Rule transitions on text cards: joining an active rule pops the card
  // with a small hop and a golden sparkle ring; leaving one sags it under
  // a dim mote puff. Formations stagger in scan order so a new rule reads
  // as a left-to-right connection sweep, not a simultaneous blink.
  RULE_PULSE_HOP_HEIGHT: 0.16,
  RULE_PULSE_STRETCH: 0.18,
  RULE_PULSE_SAG_Y: 0.14,
  RULE_PULSE_SAG_X: 0.09,
  RULE_PULSE_STAGGER_MS: 55,
  // Mass events (a `wall is stop` break ripples every wall) cap the
  // sweep here — later cards still fire but the wave doesn't drag a
  // second-long tail across the board.
  RULE_PULSE_STAGGER_MAX_INDEX: 12,
  RULE_SPARKLE_COUNT: 13,
  RULE_SPARKLE_LIFE_MS: 560,
  RULE_SPARKLE_SIZE: 0.13,
  RULE_SPARKLE_LATERAL_SPEED: 1.8,
  RULE_SPARKLE_UP_SPEED: 1.5,
  RULE_SPARKLE_GRAVITY_SCALE: 0.7,
  RULE_SPARKLE_COLORS: ['#ffe9a3', '#f7c948', '#fff6d8', '#ffffff'],
  RULE_PUFF_COUNT: 9,
  RULE_PUFF_LIFE_MS: 520,
  RULE_PUFF_SIZE: 0.11,
  RULE_PUFF_LATERAL_SPEED: 1.05,
  RULE_PUFF_UP_SPEED: 0.7,
  RULE_PUFF_GRAVITY_SCALE: 1.15,
  RULE_PUFF_COLORS: ['#aab4c2', '#8b95a5', '#ccd4de'],

  // Board-entry stagger: cards materialize on a diagonal sweep.
  SPAWN_STAGGER_MS_PER_CELL: 14,
} as const
