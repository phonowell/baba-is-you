// Text-card plate atlas: every plate's card face packs into one shared
// canvas texture, so all text cards draw through a single instanced batch
// — the per-spec front-material multiplier collapses to one draw for the
// lids plus one for the tinted vertex-coloured walls.
//
// Registration is idempotent per spec key. A new cell marks the texture
// dirty; since specs only enter play through a sync, the repaint and the
// upload coalesce into the next render automatically.
//
// Instances store each cell's PIXEL ORIGIN, not a cell index: the shader
// just adds the local uv and divides by the atlas-size uniform. That
// keeps instance data valid across growth — the atlas repaints onto a
// 4096² canvas in place (same texture object, cells keep their pixel
// positions) and only the uniform divisor changes. Growth also switches
// new cells to the wider 16-column stride, so the full 4096² area gets
// used instead of just the old 2048-wide column block.
//
// Plate faces are single-frame (text cards have no sprite, so the wobble
// rides the idle-stretch pose, not texture swaps) — one cell per spec.

import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three'

import { BOARD3D_CARD_TEXTURE_CONFIG } from './board-3d-config-textures.js'

const { CARD_TEXTURE_SIZE } = BOARD3D_CARD_TEXTURE_CONFIG

const ATLAS_SIZE = 2048
const ATLAS_MAX_SIZE = 4096
const CELLS_PER_ROW = ATLAS_SIZE / CARD_TEXTURE_SIZE
const GROWN_CELLS_PER_ROW = ATLAS_MAX_SIZE / CARD_TEXTURE_SIZE

// Minimal 2D surface so node tests can stub the DOM canvas away.
export type PlateAtlasCanvas = {
  width: number
  height: number
  getContext(contextId: '2d'): Pick<CanvasRenderingContext2D, 'drawImage'> | null
}

export type PlateAtlas = {
  // Paints the spec's card face into a cell on first sight (idempotent
  // per key) and returns the cell's pixel-space origin [x, y]. Returns
  // null once the maximum-size atlas is full — the caller falls back to
  // the per-spec material path.
  register: (key: string, source: CanvasImageSource) => Float32Array | null
  // Shared uniform feeding the UV remap in patchPlateFrontUv — live-read
  // by the program every frame, so a grow only mutates this value.
  sizeUniform: { value: number }
  texture: CanvasTexture
  dispose: () => void
}

export const createPlateAtlas = (deps: {
  anisotropy: number
  createCanvas?: (size: number) => PlateAtlasCanvas
}): PlateAtlas => {
  const { anisotropy } = deps
  const makeCanvas =
    deps.createCanvas ??
    ((size: number): PlateAtlasCanvas => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      return canvas
    })

  let size = ATLAS_SIZE
  const canvas = makeCanvas(size)
  let ctx = canvas.getContext('2d')
  // flipY stays off: texel space equals canvas pixel space, the front
  // shader folds the V-flip into its cell remap instead — that keeps
  // addUpdateRange-able sub-rects honest if partial uploads ever land.
  const texture = new CanvasTexture(canvas as HTMLCanvasElement)
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = anisotropy

  const sizeUniform = { value: size }
  const cells = new Map<string, { x: number; y: number; source: CanvasImageSource }>()
  // Cells allocated before growth keep the 8-column stride; cells beyond
  // the initial 64 pack 16-wide into the rows below y=2048.
  const baseCapacity = CELLS_PER_ROW * CELLS_PER_ROW
  let nextIndex = 0

  const indexXY = (index: number): [number, number] => {
    if (index < baseCapacity) {
      return [
        (index % CELLS_PER_ROW) * CARD_TEXTURE_SIZE,
        Math.floor(index / CELLS_PER_ROW) * CARD_TEXTURE_SIZE,
      ]
    }
    const grown = index - baseCapacity
    return [
      (grown % GROWN_CELLS_PER_ROW) * CARD_TEXTURE_SIZE,
      (CELLS_PER_ROW + Math.floor(grown / GROWN_CELLS_PER_ROW)) *
        CARD_TEXTURE_SIZE,
    ]
  }

  const origin = (x: number, y: number): Float32Array =>
    new Float32Array([x, y])

  // Growth keeps every cell at its pixel position: the wider canvas only
  // opens new rows below. The texture object is reused (resizing its
  // image canvas clears it, so the cells repaint onto it), and materials
  // never rebind.
  const grow = (): boolean => {
    if (size >= ATLAS_MAX_SIZE) return false
    size = ATLAS_MAX_SIZE
    canvas.width = size
    canvas.height = size
    ctx = canvas.getContext('2d')
    for (const { x, y, source } of cells.values()) {
      ctx?.drawImage(source, x, y)
    }
    sizeUniform.value = size
    texture.needsUpdate = true
    return true
  }

  const capacity = () => baseCapacity + (size / CARD_TEXTURE_SIZE - CELLS_PER_ROW) * GROWN_CELLS_PER_ROW

  const register = (
    key: string,
    source: CanvasImageSource,
  ): Float32Array | null => {
    const existing = cells.get(key)
    if (existing) return origin(existing.x, existing.y)
    while (nextIndex >= capacity()) {
      if (!grow()) return null
    }
    const [x, y] = indexXY(nextIndex)
    nextIndex += 1
    ctx?.drawImage(source, x, y)
    cells.set(key, { x, y, source })
    texture.needsUpdate = true
    return origin(x, y)
  }

  return {
    register,
    sizeUniform,
    texture,
    dispose: () => texture.dispose(),
  }
}

// Front lid: samples the card face out of the atlas through a per-instance
// pixel-space cell origin. The V-flip that flipY:false removed is folded
// into the remap so cell row 0 still lands on the card top.
export const patchPlateFrontUv = (
  material: MeshBasicMaterial,
  sizeUniform: { value: number },
  cacheKey: string,
): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlasSize = sizeUniform
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aCell;
uniform float uAtlasSize;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
\tvMapUv = (aCell + vec2(vMapUv.x, 1.0 - vMapUv.y) * ${CARD_TEXTURE_SIZE}.0) / uAtlasSize;`,
      )
  }
  material.customProgramCacheKey = () => cacheKey
}

// Plate walls: vertex colours already carry the VOXEL_SHADE factor — the
// per-instance tint multiplies in the card's background colour, which is
// exactly what the old per-spec material.color did.
export const patchPlateWallTint = (
  material: MeshBasicMaterial,
  cacheKey: string,
): void => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aTint;\nvarying vec3 vTint;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvTint = aTint;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTint;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb *= vTint;',
      )
  }
  material.customProgramCacheKey = () => cacheKey
}
