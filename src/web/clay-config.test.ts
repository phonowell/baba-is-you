import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLAY_PRESET,
  createClayObjectPalette,
  readabilityMix,
  selectClayCameraTier,
} from './clay-config.js'
import { BOARD3D_LIGHTING_CONFIG } from './board-3d-config-lighting.js'

test('CLAY_PRESET exposes single fixed config', () => {
  assert.equal(CLAY_PRESET.sceneBackground, '#dfe7ee')
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

test('CLAY_PRESET keeps matte lighting and bloom below whiteout levels', () => {
  const effectiveAmbient =
    CLAY_PRESET.lighting.ambientIntensity *
    BOARD3D_LIGHTING_CONFIG.AMBIENT_LIGHT_INTENSITY_MUL
  const effectiveSide = Math.max(
    BOARD3D_LIGHTING_CONFIG.SIDE_LIGHT_INTENSITY_MIN,
    CLAY_PRESET.lighting.topLightIntensity *
      BOARD3D_LIGHTING_CONFIG.SIDE_LIGHT_INTENSITY_MUL,
  )
  const peakLightBudget = effectiveAmbient + effectiveSide * 2

  assert.ok(
    peakLightBudget <= 4.2,
    `Expected restrained clay light budget, got ${peakLightBudget.toFixed(3)}`,
  )
  assert.ok(
    CLAY_PRESET.bloom.strength <= 0.18,
    `Expected restrained bloom strength, got ${CLAY_PRESET.bloom.strength}`,
  )
  assert.ok(
    CLAY_PRESET.bloom.threshold >= 0.9,
    `Expected bloom to target highlights only, got ${CLAY_PRESET.bloom.threshold}`,
  )
})
