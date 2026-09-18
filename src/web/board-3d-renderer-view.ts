import type { DirectionalLight, PerspectiveCamera, WebGLRenderer } from 'three'
import type {
  BloomEffect,
  EffectComposer,
  HueSaturationEffect,
  VignetteEffect,
} from 'postprocessing'

import { readabilityMix } from './clay-config.js'
import { BOARD3D_POSTFX_CONFIG } from './board-3d-config-postfx.js'
import { lerp } from './board-3d-shared-math.js'
import { updateRendererCamera } from './board-3d-renderer-camera.js'
import { updateRendererLightRig } from './board-3d-renderer-lighting.js'
import { BOARD_FX_MOOD_NEUTRAL } from './board-3d-shared-types.js'

import type { GameState } from '../logic/types.js'
import type { BoardFxMood } from './board-3d-shared-types.js'

const {
  MAX_DEVICE_PIXEL_RATIO,
} = BOARD3D_POSTFX_CONFIG

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

type Board3dRendererViewDeps = {
  preset: ClayPreset
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  composer: EffectComposer
  bloomEffect: BloomEffect
  hueSaturationEffect: HueSaturationEffect
  vignetteEffect: VignetteEffect
  leftLight: DirectionalLight
  rightLight: DirectionalLight
  updateLightShadowCamera: (
    light: DirectionalLight,
    span: number,
    far: number,
  ) => void
}

export type Board3dRendererViewController = {
  updateViewport: (container: HTMLElement, boardWidth: number, boardHeight: number) => boolean
  updateCamera: (container: HTMLElement, boardWidth: number, boardHeight: number) => void
  applyReadabilityGuard: (state: GameState) => void
  // Effects layer mood channel: additive offsets on top of the
  // readability-computed baselines, driven per-frame while a win/lose
  // pulse runs.
  setFxMood: (mood: BoardFxMood) => void
}

export const createBoard3dRendererViewController = (
  deps: Board3dRendererViewDeps,
): Board3dRendererViewController => {
  const {
    preset,
    camera,
    renderer,
    composer,
    bloomEffect,
    hueSaturationEffect,
    vignetteEffect,
    leftLight,
    rightLight,
    updateLightShadowCamera,
  } = deps

  let mood = BOARD_FX_MOOD_NEUTRAL
  let baseBloom = preset.bloom.strength

  const applyMood = (): void => {
    bloomEffect.intensity = baseBloom + mood.bloomBoost
    hueSaturationEffect.saturation =
      preset.grade.saturation - 1 + mood.saturationAdd
    vignetteEffect.darkness =
      preset.grade.vignetteStrength + mood.vignetteAdd
  }

  const setFxMood = (next: BoardFxMood): void => {
    mood = next
    applyMood()
  }

  let viewportWidth = 0
  let viewportHeight = 0
  let devicePixelRatio = 1

  const updateLightRig = (boardWidth: number, boardHeight: number): void => {
    updateRendererLightRig({
      preset,
      leftLight,
      rightLight,
      boardWidth,
      boardHeight,
      updateLightShadowCamera,
    })
  }

  const updateCamera = (
    container: HTMLElement,
    boardWidth: number,
    boardHeight: number,
  ): void => {
    if (viewportWidth === 0 || viewportHeight === 0) return
    updateRendererCamera({
      camera,
      boardWidth,
      boardHeight,
      viewportWidth,
      viewportHeight,
      updateLightRig: () => updateLightRig(boardWidth, boardHeight),
    })
    void container
  }

  const updateViewport = (
    container: HTMLElement,
    boardWidth: number,
    boardHeight: number,
  ): boolean => {
    const nextWidth = Math.max(1, Math.floor(container.clientWidth))
    const nextHeight = Math.max(1, Math.floor(container.clientHeight))
    const nextRatio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1)
    if (
      nextWidth === viewportWidth &&
      nextHeight === viewportHeight &&
      nextRatio === devicePixelRatio
    ) {
      return false
    }

    viewportWidth = nextWidth
    viewportHeight = nextHeight
    devicePixelRatio = nextRatio
    // The pmndrs composer derives its buffer size from the renderer's
    // drawing buffer, so pixel ratio is only applied on the renderer.
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setSize(viewportWidth, viewportHeight, false)
    composer.setSize(viewportWidth, viewportHeight)
    updateCamera(container, boardWidth, boardHeight)
    return true
  }

  const applyReadabilityGuard = (state: GameState): void => {
    let textTileCount = 0
    for (const item of state.items) {
      if (!item.isText) continue
      if (item.props.includes('hide')) continue
      textTileCount += 1
    }
    const mix = readabilityMix(
      textTileCount,
      state.width * state.height,
      preset.readability.textDensitySoftCap,
    )
    baseBloom = lerp(
      preset.bloom.strength,
      preset.readability.bloomStrengthFloor,
      mix,
    )
    applyMood()
  }

  return {
    updateViewport,
    updateCamera,
    applyReadabilityGuard,
    setFxMood,
  }
}
