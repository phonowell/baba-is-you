import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshStandardMaterial,
} from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { cardSpecForItem } from './board-3d-shared-item.js'
import { createCardTexture } from './board-3d-textures.js'

import type { Item } from '../logic/types.js'
import type { CardMaterial } from './board-3d-node-types.js'

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

const {
  CARD_MATERIAL_ALPHA_TEST,
  CARD_MATERIAL_ROUGHNESS,
  CARD_MATERIAL_METALNESS,
  CARD_MATERIAL_EMISSIVE_COLOR,
} = BOARD3D_LAYOUT_CONFIG

type CreateBoard3dRendererMaterialStoreArgs = {
  preset: ClayPreset
  textureAnisotropy: number
}

export type Board3dRendererMaterialStore = {
  getMaterial: (item: Item) => CardMaterial
  dispose: () => void
}

export const createBoard3dRendererMaterialStore = (
  args: CreateBoard3dRendererMaterialStoreArgs,
): Board3dRendererMaterialStore => {
  const { preset, textureAnisotropy } = args
  const textureCache = new Map<string, CanvasTexture>()
  const materialCache = new Map<string, CardMaterial>()

  const getMaterial = (item: Item): CardMaterial => {
    const spec = cardSpecForItem(item, preset.readability.minContrastRatio)
    const cached = materialCache.get(spec.key)
    if (cached) return cached

    let texture = textureCache.get(spec.key)
    if (!texture) {
      texture = createCardTexture(spec, textureAnisotropy)
      textureCache.set(spec.key, texture)
    }

    const material = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: CARD_MATERIAL_ALPHA_TEST,
      roughness: CARD_MATERIAL_ROUGHNESS,
      metalness: CARD_MATERIAL_METALNESS,
      emissive: new Color(CARD_MATERIAL_EMISSIVE_COLOR),
      emissiveIntensity: spec.isText
        ? preset.materials.textEmissiveIntensity
        : preset.materials.objectEmissiveIntensity,
      side: DoubleSide,
    })
    materialCache.set(spec.key, material)
    return material
  }

  const dispose = (): void => {
    for (const material of materialCache.values()) material.dispose()
    materialCache.clear()
    for (const texture of textureCache.values()) texture.dispose()
    textureCache.clear()
  }

  return {
    getMaterial,
    dispose,
  }
}
