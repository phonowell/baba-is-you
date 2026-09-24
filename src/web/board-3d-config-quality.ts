// Adaptive quality ladder: while a board animates, the runtime feeds the
// gap between consecutive frames into an EMA — a sustained gap over budget
// means the device cannot hold ~55fps, so one tier of quality drops. The
// ratchet is one-way: quality never climbs back mid-session, so a machine
// that recovers headroom does not oscillate between tiers.
export const BOARD3D_QUALITY_CONFIG = {
  // Trip point: EMA frame gap above this counts as sub-60 pacing. Sits
  // between 60fps (16.7ms) and 45fps (22ms) vsync steps.
  FRAME_GAP_BUDGET_MS: 19,
  // Exponential smoothing weight + warmup count before the first verdict
  // (~0.4s of animation at 60fps): enough to absorb ordinary jitter
  // without reacting to it.
  FRAME_GAP_EMA_ALPHA: 0.15,
  FRAME_GAP_MIN_SAMPLES: 24,
  // Per-sample cap fed to the EMA: a lone GC/tab-switch stall contributes
  // at most 24ms, so one spike can never push the average over budget.
  // Sustained 45fps pacing (22ms) still converges past the trip point.
  FRAME_GAP_SAMPLE_CAP_MS: 24,
  // Minimum wall-clock between tier drops — each tier gets a real window
  // to prove itself before the next step down.
  TIER_COOLDOWN_MS: 900,
  // Ordered gentlest→strongest. Tier 0 is the authored preset: entries
  // below it only ever run on hardware that already failed to keep up.
  // `msaa` halves the HDR buffer's sample count at the deepest tier —
  // absent means the authored multisampling stays.
  TIERS: [
    { pixelRatioCap: 1.4, aoSamples: 8 },
    { pixelRatioCap: 1.2, aoSamples: 8 },
    { pixelRatioCap: 1.0, aoSamples: 6 },
    { pixelRatioCap: 0.85, aoSamples: 4, msaa: 2 },
  ],
} as const
