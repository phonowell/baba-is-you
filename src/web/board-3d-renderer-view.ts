import type { DirectionalLight, PerspectiveCamera, WebGLRenderer } from 'three'
import type { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { readabilityMix } from './clay-config.js'
import {
  BOARD3D_LAYOUT_CONFIG,
  BOARD3D_POSTFX_CONFIG,
} from './board-3d-config.js'
import { lerp } from './board-3d-shared.js'
import { updateRendererCamera } from './board-3d-renderer-camera.js'
import { updateRendererLightRig } from './board-3d-renderer-lighting.js'

import type { GameState } from '../logic/types.js'

const {
  CARD_BASE_Z,
} = BOARD3D_LAYOUT_CONFIG

const {
  MAX_DEVICE_PIXEL_RATIO,
  POSTFX_PIXEL_RATIO_SCALE,
  BLOOM_RESOLUTION_SCALE,
  BLOOM_DENSE_TEXT_RESOLUTION_SCALE,
  BOKEH_ENABLE_MARGIN,
  BOKEH_FOCUS_MIN,
} = BOARD3D_POSTFX_CONFIG

type BokehUniform = {
  value: number
}

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

type Board3dRendererViewDeps = {
  preset: ClayPreset
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  bokehPass: BokehPass
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
}

export const createBoard3dRendererViewController = (
  deps: Board3dRendererViewDeps,
): Board3dRendererViewController => {
  const {
    preset,
    camera,
    renderer,
    composer,
    bloomPass,
    bokehPass,
    leftLight,
    rightLight,
    updateLightShadowCamera,
  } = deps

  let viewportWidth = 0
  let viewportHeight = 0
  let devicePixelRatio = 1
  let currentReadabilityMix = 0
  let activeBokehAperture = preset.bokeh.aperture
  let activeBokehMaxBlur = preset.bokeh.maxBlur

  const updateBloomResolution = (): void => {
    if (viewportWidth <= 0 || viewportHeight <= 0) return
    const readabilityScale = lerp(1, BLOOM_DENSE_TEXT_RESOLUTION_SCALE, currentReadabilityMix)
    bloomPass.resolution.set(
      Math.max(1, Math.floor(viewportWidth * BLOOM_RESOLUTION_SCALE * readabilityScale)),
      Math.max(1, Math.floor(viewportHeight * BLOOM_RESOLUTION_SCALE * readabilityScale)),
    )
  }

  const updateBokehFocus = (): void => {
    const uniforms = bokehPass.materialBokeh.uniforms as Record<string, BokehUniform>
    const focus = Math.max(
      BOKEH_FOCUS_MIN,
      camera.position.z - CARD_BASE_Z + preset.bokeh.focusOffset,
    )
    if (uniforms.focus) uniforms.focus.value = focus
    if (uniforms.aperture) uniforms.aperture.value = activeBokehAperture
    if (uniforms.maxblur) uniforms.maxblur.value = activeBokehMaxBlur
    if (uniforms.aspect) uniforms.aspect.value = viewportWidth / Math.max(1, viewportHeight)
  }

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
      updateBokehFocus,
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
    const postFxPixelRatio = Math.max(1, devicePixelRatio * POSTFX_PIXEL_RATIO_SCALE)
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setSize(viewportWidth, viewportHeight, false)
    composer.setPixelRatio(postFxPixelRatio)
    composer.setSize(viewportWidth, viewportHeight)
    updateBloomResolution()
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
    currentReadabilityMix = mix
    bloomPass.strength = lerp(
      preset.bloom.strength,
      preset.readability.bloomStrengthFloor,
      mix,
    )
    activeBokehAperture = lerp(
      preset.bokeh.aperture,
      preset.readability.apertureFloor,
      mix,
    )
    activeBokehMaxBlur = lerp(
      preset.bokeh.maxBlur,
      preset.readability.maxBlurFloor,
      mix,
    )
    const shouldEnableBokeh =
      activeBokehMaxBlur > preset.readability.maxBlurFloor * BOKEH_ENABLE_MARGIN ||
      activeBokehAperture > preset.readability.apertureFloor * BOKEH_ENABLE_MARGIN
    if (bokehPass.enabled !== shouldEnableBokeh) bokehPass.enabled = shouldEnableBokeh
    updateBloomResolution()
    updateBokehFocus()
  }

  return {
    updateViewport,
    updateCamera,
    applyReadabilityGuard,
  }
}
