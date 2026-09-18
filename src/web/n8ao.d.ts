// n8ao ships JavaScript only; this declares the small surface we consume.
// N8AOPostPass integrates with the pmndrs postprocessing composer via the
// shared depth texture (needsDepthTexture) — no extra scene re-render.
declare module 'n8ao' {
  import type { Pass } from 'postprocessing'
  import type { Camera, Color, Scene } from 'three'

  export type N8AOConfiguration = {
    aoSamples: number
    aoRadius: number
    denoiseSamples: number
    denoiseRadius: number
    distanceFalloff: number
    intensity: number
    denoiseIterations: number
    renderMode: 0 | 1 | 2 | 3 | 4
    color: Color
    gammaCorrection: boolean
    depthBufferType: number
    screenSpaceRadius: boolean
    halfRes: boolean
    depthAwareUpsampling: boolean
    colorMultiply: boolean
    transparencyAware: boolean
    accumulate: boolean
    neuralDenoise: boolean
  }

  // Pass for the pmndrs `postprocessing` EffectComposer.
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: N8AOConfiguration
    setSize(width: number, height: number): void
  }

  // Pass for the three.js examples EffectComposer (unused here).
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: N8AOConfiguration
  }

  export const DepthType: {
    Default: 1
    Log: 2
    Reverse: 3
  }
}
