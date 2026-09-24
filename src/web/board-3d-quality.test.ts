import assert from 'node:assert/strict'
import test from 'node:test'

import { BOARD3D_QUALITY_CONFIG } from './board-3d-config-quality.js'
import { createBoard3dQuality } from './board-3d-quality.js'

const {
  FRAME_GAP_MIN_SAMPLES,
  TIER_COOLDOWN_MS,
  TIERS,
} = BOARD3D_QUALITY_CONFIG

const createProbe = () => {
  const caps: number[] = []
  const samples: number[] = []
  const msaa: number[] = []
  const quality = createBoard3dQuality({
    setPixelRatioCap: (cap) => {
      caps.push(cap)
    },
    setAoSamples: (count) => {
      samples.push(count)
    },
    setMsaa: (count) => {
      msaa.push(count)
    },
  })
  return { quality, caps, aoSamples: samples, msaa }
}

// Feeds `count` frames at a fixed gap starting just after `startMs`;
// returns the last timestamp and whether any call applied a tier drop.
const feed = (
  quality: ReturnType<typeof createBoard3dQuality>,
  gapMs: number,
  count: number,
  startMs: number,
): { nowMs: number; dropped: boolean } => {
  let nowMs = startMs
  let dropped = false
  for (let i = 0; i < count; i += 1) {
    nowMs += gapMs
    if (quality.observeFrame(gapMs, nowMs)) dropped = true
  }
  return { nowMs, dropped }
}

test('board-3d quality holds the authored tier on healthy pacing', () => {
  const { quality, caps, aoSamples } = createProbe()
  const { dropped } = feed(quality, 16.7, 200, 0)
  assert.equal(dropped, false)
  assert.equal(quality.tier(), 0)
  assert.equal(caps.length, 0)
  assert.equal(aoSamples.length, 0)
})

test('board-3d quality drops one tier on sustained slow pacing', () => {
  const { quality, caps, aoSamples } = createProbe()
  const { dropped } = feed(quality, 30, FRAME_GAP_MIN_SAMPLES + 10, 0)
  assert.equal(dropped, true)
  assert.equal(quality.tier(), 1)
  assert.deepEqual(caps, [TIERS[1]?.pixelRatioCap])
  assert.deepEqual(aoSamples, [TIERS[1]?.aoSamples])
})

test('board-3d quality survives isolated stalls', () => {
  const { quality } = createProbe()
  // Warm the EMA on healthy pacing, then fire one big GC-style stall:
  // the per-sample cap keeps a lone spike under budget.
  feed(quality, 16.7, FRAME_GAP_MIN_SAMPLES + 10, 0)
  const { dropped } = feed(quality, 500, 1, 1_000)
  assert.equal(dropped, false)
  feed(quality, 16.7, 50, 1_100)
  assert.equal(quality.tier(), 0)
})

test('board-3d quality spaces tier drops with a cooldown', () => {
  const { quality, caps } = createProbe()
  // 22ms pacing is just over budget — one drop lands after the warmup.
  const first = feed(quality, 22, FRAME_GAP_MIN_SAMPLES + 5, 0)
  assert.equal(quality.tier(), 1)
  // Inside the cooldown window the ladder holds even under bad pacing —
  // the tier gets a real window to prove itself.
  const second = feed(quality, 40, 10, first.nowMs + 100)
  assert.equal(second.dropped, false)
  assert.equal(quality.tier(), 1)
  // Past the cooldown, sustained slowness takes the next tier — a few
  // frames suffice since the sample counter kept accumulating.
  const third = feed(
    quality,
    40,
    10,
    second.nowMs + TIER_COOLDOWN_MS + 1,
  )
  assert.equal(third.dropped, true)
  assert.equal(quality.tier(), 2)
  assert.deepEqual(caps, [
    TIERS[1]?.pixelRatioCap,
    TIERS[2]?.pixelRatioCap,
  ])
})

test('board-3d quality never climbs back — the ratchet is one-way', () => {
  const { quality, caps } = createProbe()
  // Enough slow frames for exactly one drop — a longer run would
  // legitimately chain the next tier once the cooldown lapses.
  feed(quality, 30, FRAME_GAP_MIN_SAMPLES + 5, 0)
  assert.equal(quality.tier(), 1)
  // A long healthy stretch afterwards does not restore the tier: no
  // oscillation between tiers mid-session.
  feed(quality, 16.7, 400, 100_000)
  assert.equal(quality.tier(), 1)
  assert.equal(caps.length, 1)
})

test('board-3d quality bottoms out at the last tier', () => {
  const { quality, caps } = createProbe()
  let nowMs = 0
  for (let i = 0; i < TIERS.length; i += 1) {
    const run = feed(
      quality,
      50,
      FRAME_GAP_MIN_SAMPLES + 40,
      nowMs + TIER_COOLDOWN_MS + 10,
    )
    nowMs = run.nowMs
  }
  assert.equal(quality.tier(), TIERS.length - 1)
  assert.equal(caps.length, TIERS.length - 1)
})

test('board-3d quality applies msaa only on tiers that carry it', () => {
  const { quality, msaa } = createProbe()
  let nowMs = 0
  for (let i = 0; i < TIERS.length; i += 1) {
    const run = feed(
      quality,
      50,
      FRAME_GAP_MIN_SAMPLES + 40,
      nowMs + TIER_COOLDOWN_MS + 10,
    )
    nowMs = run.nowMs
  }
  assert.equal(quality.tier(), TIERS.length - 1)
  // The buffer realloc runs once — at the deepest tier — not on every drop.
  assert.deepEqual(msaa, [2])
})
