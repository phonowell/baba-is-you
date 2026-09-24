import { BOARD3D_QUALITY_CONFIG } from './board-3d-config-quality.js'

const {
  FRAME_GAP_BUDGET_MS,
  FRAME_GAP_EMA_ALPHA,
  FRAME_GAP_MIN_SAMPLES,
  FRAME_GAP_SAMPLE_CAP_MS,
  TIER_COOLDOWN_MS,
  TIERS,
} = BOARD3D_QUALITY_CONFIG

export type Board3dQualityAppliers = {
  // Applies a device-pixel-ratio ceiling (renderer + composer resize).
  setPixelRatioCap: (cap: number) => void
  // Applies the AO pass's sample count live.
  setAoSamples: (samples: number) => void
  // Applies the composer MSAA sample count — a one-off buffer realloc
  // per drop, so only the deepest tiers carry it.
  setMsaa?: (samples: number) => void
}

export type Board3dQuality = {
  // One sample per *consecutive animating* frame — the caller filters out
  // idle ticks and RAF restarts so the EMA only measures render pacing.
  // Returns true when the call applied a tier drop.
  observeFrame: (gapMs: number, nowMs: number) => boolean
  // Current ladder position (0 = full quality) — read by tests.
  tier: () => number
}

export const createBoard3dQuality = (
  appliers: Board3dQualityAppliers,
): Board3dQuality => {
  let tierIndex = 0
  let ema = 0
  let samples = 0
  let lastDropMs = Number.NEGATIVE_INFINITY

  const observeFrame = (gapMs: number, nowMs: number): boolean => {
    // Cap each sample: a lone GC or tab-switch stall would otherwise spike
    // the EMA past budget in a single frame and burn a tier. Sustained
    // bad pacing converges to the same verdict a few frames later.
    const gap = Math.min(gapMs, FRAME_GAP_SAMPLE_CAP_MS)
    ema = samples === 0 ? gap : ema + (gap - ema) * FRAME_GAP_EMA_ALPHA
    samples += 1
    if (
      samples < FRAME_GAP_MIN_SAMPLES ||
      ema <= FRAME_GAP_BUDGET_MS ||
      tierIndex >= TIERS.length - 1 ||
      nowMs - lastDropMs < TIER_COOLDOWN_MS
    ) {
      return false
    }
    tierIndex += 1
    lastDropMs = nowMs
    // Re-measure under the new tier: the cooldown above spaces verdicts,
    // and resetting the EMA keeps a leftover average from chaining drops.
    ema = 0
    samples = 0
    const tier = TIERS[tierIndex]
    if (!tier) return false
    appliers.setPixelRatioCap(tier.pixelRatioCap)
    appliers.setAoSamples(tier.aoSamples)
    if ('msaa' in tier && tier.msaa !== undefined) appliers.setMsaa?.(tier.msaa)
    return true
  }

  return {
    observeFrame,
    tier: () => tierIndex,
  }
}
