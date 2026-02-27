import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLAY_PRESET,
  createClayObjectPalette,
  readabilityMix,
  selectClayCameraTier,
} from './clay-config.js'

test('CLAY_PRESET exposes single fixed config', () => {
  assert.equal(CLAY_PRESET.sceneBackground, '#edf1f4')
  assert.equal(CLAY_PRESET.lighting.topLightColor, '#ffffff')
  assert.equal(CLAY_PRESET.readability.minContrastRatio, 4.8)
})

test('selectClayCameraTier uses fixed tier buckets by board span', () => {
  assert.equal(selectClayCameraTier(6, 5).name, 'tight')
  assert.equal(selectClayCameraTier(10, 8).name, 'standard')
  assert.equal(selectClayCameraTier(20, 16).name, 'wide')
})

test('readabilityMix clamps with text density', () => {
  assert.equal(readabilityMix(0, 64, 0.2), 0)
  assert.equal(readabilityMix(8, 64, 0.2), 0.625)
  assert.equal(readabilityMix(16, 64, 0.2), 1)
})

test('createClayObjectPalette meets minimum contrast target for default threshold', () => {
  const palette = createClayObjectPalette(205, 4.8)

  assert.match(palette.background, /^hsl\(/)
  assert.match(palette.border, /^hsl\(/)
  assert.match(palette.textColor, /^#[0-9a-f]{6}$/)
  assert.match(palette.outlineColor, /^#[0-9a-f]{6}$/)
  assert.ok(palette.contrastRatio >= 4.8)
})
