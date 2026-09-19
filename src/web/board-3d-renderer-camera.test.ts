import assert from 'node:assert/strict'
import test from 'node:test'

import { FogExp2, PerspectiveCamera, Vector3 } from 'three'

import { updateRendererCamera } from './board-3d-renderer-camera.js'
import { BOARD3D_CAMERA_CONFIG } from './board-3d-config-camera.js'
import { CLAY_PRESET } from './clay-config.js'

const { FOG_REFERENCE_ASPECT } = BOARD3D_CAMERA_CONFIG

const runCamera = (
  viewportWidth: number,
  viewportHeight: number,
): { camera: PerspectiveCamera; fog: FogExp2 } => {
  const camera = new PerspectiveCamera()
  const fog = new FogExp2(CLAY_PRESET.sceneBackground, CLAY_PRESET.fog.density)
  updateRendererCamera({
    camera,
    fog,
    fogBaseDensity: CLAY_PRESET.fog.density,
    boardWidth: 20,
    boardHeight: 15,
    viewportWidth,
    viewportHeight,
    updateLightRig: () => undefined,
  })
  return { camera, fog }
}

// FogExp2 hazes by 1 - exp(-(density * viewDepth)^2); measured here at the
// board plane along the view axis, which is the haze the player sees.
const boardFogFactor = (camera: PerspectiveCamera, fog: FogExp2): number => {
  const dir = new Vector3()
  camera.getWorldDirection(dir)
  const depth = -camera.position.y / dir.y
  return 1 - Math.exp(-((fog.density * depth) ** 2))
}

test('camera fog keeps preset density at or beyond the reference aspect', () => {
  const reference = runCamera(1600, 1600 / FOG_REFERENCE_ASPECT)
  assert.ok(
    Math.abs(reference.fog.density - CLAY_PRESET.fog.density) < 1e-12,
    `density ${reference.fog.density}`,
  )

  const ultrawide = runCamera(3000, 1000)
  assert.ok(
    Math.abs(ultrawide.fog.density - CLAY_PRESET.fog.density) < 1e-12,
    `density ${ultrawide.fog.density}`,
  )
})

test('camera fog stays aspect-invariant on portrait viewports', () => {
  const landscape = runCamera(1600, 900)
  const portrait = runCamera(390, 844)

  assert.ok(portrait.fog.density < landscape.fog.density)
  const delta = Math.abs(
    boardFogFactor(portrait.camera, portrait.fog) -
      boardFogFactor(landscape.camera, landscape.fog),
  )
  assert.ok(delta < 0.01, `fog factor delta ${delta}`)
})
