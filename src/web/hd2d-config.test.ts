import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HD2D_PRESET,
  createHd2dObjectPalette,
  readabilityMix,
  selectHd2dCameraTier,
} from './hd2d-config.js'

test('HD2D_PRESET exposes single fixed config', () => {
  assert.equal(HD2D_PRESET.sceneBackground, '#edf1f4')
  assert.equal(HD2D_PRESET.lighting.topLightColor, '#ffffff')
  assert.equal(HD2D_PRESET.readability.minContrastRatio, 4.8)
})

test('selectHd2dCameraTier uses fixed tier buckets by board span', () => {
  assert.equal(selectHd2dCameraTier(6, 5).name, 'tight')
  assert.equal(selectHd2dCameraTier(10, 8).name, 'standard')
  assert.equal(selectHd2dCameraTier(20, 16).name, 'wide')
})

test('readabilityMix clamps with text density', () => {
  assert.equal(readabilityMix(0, 64, 0.2), 0)
  assert.equal(readabilityMix(8, 64, 0.2), 0.625)
  assert.equal(readabilityMix(16, 64, 0.2), 1)
})

test('createHd2dObjectPalette meets minimum contrast target for default threshold', () => {
  const palette = createHd2dObjectPalette(205, 4.8)

  assert.match(palette.background, /^hsl\(/)
  assert.match(palette.border, /^hsl\(/)
  assert.match(palette.textColor, /^#[0-9a-f]{6}$/)
  assert.match(palette.outlineColor, /^#[0-9a-f]{6}$/)
  assert.ok(palette.contrastRatio >= 4.8)
})
