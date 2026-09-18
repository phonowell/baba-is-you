import type { DirectionalLight, PerspectiveCamera, WebGLRenderer } from 'three'
import type { BloomEffect, EffectComposer } from 'postprocessing'

import { readabilityMix } from './clay-config.js'
import { BOARD3D_POSTFX_CONFIG } from './board-3d-config-postfx.js'
import { lerp } from './board-3d-shared-math.js'
import { updateRendererCamera } from './board-3d-renderer-camera.js'
import { updateRendererLightRig } from './board-3d-renderer-lighting.js'

import type { GameState } from '../logic/types.js'

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
    bloomEffect,
    leftLight,
    rightLight,
    updateLightShadowCamera,
  } = deps

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
    bloomEffect.intensity = lerp(
      preset.bloom.strength,
      preset.readability.bloomStrengthFloor,
      mix,
    )
  }

  return {
    updateViewport,
    updateCamera,
    applyReadabilityGuard,
  }
}
