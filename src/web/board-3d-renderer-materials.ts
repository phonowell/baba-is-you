import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  MeshStandardMaterial,
} from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import { cardSpecForItem, orientedSpriteForSpec } from './board-3d-shared-item.js'
import { createCardTextures } from './board-3d-textures.js'
import { spriteContentBounds, spriteFrames } from './pixel-sprites/derive.js'
import { arrowOverlaysForDirection } from './pixel-sprites/arrows.js'
import { buildVoxelGeometry, voxelDrawRect } from './pixel-sprites/voxel.js'
import { isGroundHugItem } from '../view/stack-policy.js'

import type { BufferGeometry, Material } from 'three'
import type { Item } from '../logic/types.js'
import type { CardMaterial, EntityNode } from './board-3d-node-types.js'

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

const {
  CARD_MATERIAL_ALPHA_TEST,
  CARD_MATERIAL_ROUGHNESS,
  CARD_MATERIAL_METALNESS,
  CARD_MATERIAL_EMISSIVE_COLOR,
  CARD_WORLD_SIZE,
} = BOARD3D_LAYOUT_CONFIG

const {
  VOXEL_INNER_SIZE_RATIO,
  VOXEL_DEPTH_OBJECT,
  VOXEL_DEPTH_GROUND_HUG,
  VOXEL_PLATE_DEPTH,
  VOXEL_ARROW_LIFT,
  VOXEL_SHADE_FRONT,
  VOXEL_SHADE_TOP,
  VOXEL_SHADE_SIDE,
  VOXEL_SHADE_BOTTOM,
  VOXEL_SHADE_BACK,
  VOXEL_PLATE_EDGE_SHADE,
  VOXEL_OUTLINE_COLOR,
} = BOARD3D_VOXEL_CONFIG

const VOXEL_SHADE = {
  front: VOXEL_SHADE_FRONT,
  top: VOXEL_SHADE_TOP,
  side: VOXEL_SHADE_SIDE,
  bottom: VOXEL_SHADE_BOTTOM,
  back: VOXEL_SHADE_BACK,
}

// Everything a node needs to display one spec: shared geometry/material
// handles plus the per-frame geometry list when the sprite animates.
export type EntityVisual = {
  key: string
  geometry: BufferGeometry
  material: Material | Material[]
  frameGeometries: BufferGeometry[]
}

type CreateBoard3dRendererMaterialStoreArgs = {
  preset: ClayPreset
  textureAnisotropy: number
}

// Swaps each animated material to the given frame; returns how many maps
// actually changed so callers can skip idle renders. Kept DOM-free for tests.
export const advanceFrameMaps = <M extends { map: unknown }, T>(
  animatedFrames: Map<M, T[]>,
  frameIx: number,
): number => {
  let changed = 0
  for (const [material, frames] of animatedFrames) {
    const next = frames[frameIx % frames.length]
    if (next !== undefined && material.map !== next) {
      material.map = next
      changed += 1
    }
  }
  return changed
}

// Voxel nodes animate by swapping geometry rather than texture maps; only
// nodes with multi-frame lists ever change. Kept DOM-free for tests.
export const advanceNodeGeometries = (
  nodes: ReadonlyMap<number, Pick<EntityNode, 'mesh' | 'frameGeometries'>>,
  frameIx: number,
): number => {
  let changed = 0
  for (const node of nodes.values()) {
    const frames = node.frameGeometries
    if (!frames || frames.length < 2) continue
    const next = frames[frameIx % frames.length]
    if (next !== undefined && node.mesh.geometry !== next) {
      node.mesh.geometry = next
      changed += 1
    }
  }
  return changed
}

export type Board3dRendererMaterialStore = {
  getVisual: (item: Item, overridden?: boolean) => EntityVisual
  // Swaps every animated material to the given frame; returns how many
  // materials actually changed so the runtime can skip idle renders.
  advanceSpriteFrames: (frameIx: number) => number
  dispose: () => void
}

export const createBoard3dRendererMaterialStore = (
  args: CreateBoard3dRendererMaterialStoreArgs,
): Board3dRendererMaterialStore => {
  const { preset, textureAnisotropy } = args
  const textureCache = new Map<string, CanvasTexture[]>()
  const materialCache = new Map<string, CardMaterial>()
  const animatedFrames = new Map<CardMaterial, CanvasTexture[]>()
  const geometryCache = new Map<string, BufferGeometry>()
  const edgeMaterialCache = new Map<string, MeshStandardMaterial>()
  const plateMaterialCache = new Map<string, Material[]>()

  // Voxel slabs share one vertex-colored material: every pixel's color is
  // baked into the geometry's color attribute with per-face shading.
  const voxelMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: CARD_MATERIAL_ROUGHNESS,
    metalness: CARD_MATERIAL_METALNESS,
    emissive: new Color(CARD_MATERIAL_EMISSIVE_COLOR),
    emissiveIntensity: preset.materials.objectEmissiveIntensity,
  })
  const plateGeometry = new BoxGeometry(
    CARD_WORLD_SIZE,
    CARD_WORLD_SIZE,
    VOXEL_PLATE_DEPTH,
  )
  const voxelInnerSize = CARD_WORLD_SIZE * VOXEL_INNER_SIZE_RATIO

  const frontMaterial = (spec: ReturnType<typeof cardSpecForItem>): CardMaterial => {
    const cached = materialCache.get(spec.key)
    if (cached) return cached

    let frames = textureCache.get(spec.key)
    if (!frames) {
      frames = createCardTextures(spec, textureAnisotropy)
      textureCache.set(spec.key, frames)
    }
    const firstFrame = frames[0]
    if (!firstFrame) throw new Error(`No card texture for ${spec.key}.`)

    const material = new MeshStandardMaterial({
      map: firstFrame,
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
    if (frames.length > 1) animatedFrames.set(material, frames)
    return material
  }

  const edgeMaterial = (spec: ReturnType<typeof cardSpecForItem>): MeshStandardMaterial => {
    const cached = edgeMaterialCache.get(spec.key)
    if (cached) return cached
    const color = new Color(spec.background).multiplyScalar(VOXEL_PLATE_EDGE_SHADE)
    const material = new MeshStandardMaterial({
      color,
      roughness: CARD_MATERIAL_ROUGHNESS,
      metalness: CARD_MATERIAL_METALNESS,
      emissive: new Color(CARD_MATERIAL_EMISSIVE_COLOR),
      emissiveIntensity: spec.isText
        ? preset.materials.textEmissiveIntensity
        : preset.materials.objectEmissiveIntensity,
    })
    edgeMaterialCache.set(spec.key, material)
    return material
  }

  const voxelVisual = (
    item: Item,
    spec: ReturnType<typeof cardSpecForItem>,
  ): EntityVisual => {
    const sprite = orientedSpriteForSpec(spec)
    if (!sprite) throw new Error(`Missing sprite for ${spec.key}.`)
    const bounds = spriteContentBounds(sprite)
    if (!bounds) throw new Error(`Empty sprite for ${spec.key}.`)
    const rect = voxelDrawRect(bounds, voxelInnerSize)
    const groundHug = isGroundHugItem(item)
    const depth = groundHug ? VOXEL_DEPTH_GROUND_HUG : VOXEL_DEPTH_OBJECT
    const outlineColor = groundHug ? undefined : VOXEL_OUTLINE_COLOR
    const overlays = spec.facingDirection
      ? arrowOverlaysForDirection(spec.facingDirection, VOXEL_ARROW_LIFT, bounds)
      : []

    const frameGeometries = spriteFrames(sprite).map((frame, ix) => {
      const key = `vox:${spec.key}:${ix}`
      let geometry = geometryCache.get(key)
      if (!geometry) {
        geometry = buildVoxelGeometry(
          { frame, palette: sprite.palette, overlays },
          {
            drawX: rect.drawX,
            drawY: rect.drawY,
            texel: rect.texel,
            depth,
            shade: VOXEL_SHADE,
            outlineColor,
          },
        )
        geometryCache.set(key, geometry)
      }
      return geometry
    })
    const geometry = frameGeometries[0]
    if (!geometry) throw new Error(`No voxel geometry for ${spec.key}.`)
    return {
      key: `vox:${spec.key}`,
      geometry,
      material: voxelMaterial,
      frameGeometries,
    }
  }

  const plateVisual = (spec: ReturnType<typeof cardSpecForItem>): EntityVisual => {
    const key = `plate:${spec.key}`
    let material = plateMaterialCache.get(key)
    if (!material) {
      const edge = edgeMaterial(spec)
      // BoxGeometry group order: +x -x +y -y +z -z; +z is the card face.
      material = [edge, edge, edge, edge, frontMaterial(spec), edge]
      plateMaterialCache.set(key, material)
    }
    return { key, geometry: plateGeometry, material, frameGeometries: [] }
  }

  const getVisual = (item: Item, overridden = false): EntityVisual => {
    const spec = cardSpecForItem(
      item,
      preset.readability.minContrastRatio,
      overridden,
    )
    return spec.sprite ? voxelVisual(item, spec) : plateVisual(spec)
  }

  const advanceSpriteFrames = (frameIx: number): number =>
    advanceFrameMaps(animatedFrames, frameIx)

  const dispose = (): void => {
    for (const material of materialCache.values()) material.dispose()
    materialCache.clear()
    animatedFrames.clear()
    for (const frames of textureCache.values()) {
      for (const texture of frames) texture.dispose()
    }
    textureCache.clear()
    for (const geometry of geometryCache.values()) geometry.dispose()
    geometryCache.clear()
    for (const material of edgeMaterialCache.values()) material.dispose()
    edgeMaterialCache.clear()
    plateMaterialCache.clear()
    voxelMaterial.dispose()
    plateGeometry.dispose()
  }

  return {
    getVisual,
    advanceSpriteFrames,
    dispose,
  }
}
