import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  MeshToonMaterial,
} from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import { cardSpecForItem, orientedSpriteForSpec } from './board-3d-shared-item.js'
import { createCardTextures, getToonGradientMap } from './board-3d-textures.js'
import {
  spriteContentBounds,
  spriteFrames,
  spriteVolumeBounds,
} from './pixel-sprites/derive.js'
import {
  arrowMarkerSlices,
  arrowOverlaysForDirection,
} from './pixel-sprites/arrows.js'
import {
  buildVoxelVolumeGeometry,
  slabVolume,
  spriteVolumes,
  voxelDrawRect,
} from './pixel-sprites/voxel.js'
import { isGroundHugItem } from '../view/stack-policy.js'

import type { BufferGeometry, Material } from 'three'
import type { Direction, Item } from '../logic/types.js'
import type { CardMaterial, EntityNode } from './board-3d-node-types.js'

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

const {
  CARD_BASE_Z,
  CARD_MATERIAL_ALPHA_TEST,
  CARD_MATERIAL_EMISSIVE_COLOR,
  CARD_WORLD_SIZE,
  GROUND_SURFACE_Z,
} = BOARD3D_LAYOUT_CONFIG

const {
  VOXEL_INNER_SIZE_RATIO,
  VOXEL_FRAME_Z,
  VOXEL_CARD_BACK_LAYERS,
  VOXEL_GROUND_HUG_BACK_LAYERS,
  VOXEL_PLATE_DEPTH,
  VOXEL_SHADE_FRONT,
  VOXEL_SHADE_TOP,
  VOXEL_SHADE_SIDE,
  VOXEL_SHADE_BOTTOM,
  VOXEL_SHADE_BACK,
  VOXEL_PLATE_EDGE_SHADE,
  VOXEL_OUTLINE_COLOR,
  VOXEL_STAND_LIFT,
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
// facingYaw is set only for authored voxel models that stand upright on the
// board and turn with the item's direction; flat visuals leave it undefined
// and keep the camera-facing card orientation.
export type EntityVisual = {
  key: string
  geometry: BufferGeometry
  material: Material | Material[]
  frameGeometries: BufferGeometry[]
  facingYaw: number | undefined
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
  const edgeMaterialCache = new Map<string, MeshToonMaterial>()
  const plateMaterialCache = new Map<string, Material[]>()
  const visualCache = new Map<string, EntityVisual>()

  // Cel-banded toon surface: the shared gradient map quantizes N·L into a
  // few steps, which is the anime look.
  const toonSurface = {
    gradientMap: getToonGradientMap(),
  }

  // Voxel slabs share one vertex-colored material: every pixel's color is
  // baked into the geometry's color attribute with per-face shading.
  const voxelMaterial = new MeshToonMaterial({
    vertexColors: true,
    ...toonSurface,
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

    const material = new MeshToonMaterial({
      map: firstFrame,
      transparent: true,
      alphaTest: CARD_MATERIAL_ALPHA_TEST,
      ...toonSurface,
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

  const edgeMaterial = (spec: ReturnType<typeof cardSpecForItem>): MeshToonMaterial => {
    const cached = edgeMaterialCache.get(spec.key)
    if (cached) return cached
    const color = new Color(spec.background).multiplyScalar(VOXEL_PLATE_EDGE_SHADE)
    const material = new MeshToonMaterial({
      color,
      ...toonSurface,
      emissive: new Color(CARD_MATERIAL_EMISSIVE_COLOR),
      emissiveIntensity: spec.isText
        ? preset.materials.textEmissiveIntensity
        : preset.materials.objectEmissiveIntensity,
    })
    edgeMaterialCache.set(spec.key, material)
    return material
  }

  // Upright voxel models spin around the board's vertical axis: down shows
  // the front, right/left the profiles, up the back.
  const FACING_YAW: Record<Direction, number> = {
    down: 0,
    right: Math.PI / 2,
    up: Math.PI,
    left: -Math.PI / 2,
  }

  const voxelVisual = (
    item: Item,
    spec: ReturnType<typeof cardSpecForItem>,
  ): EntityVisual => {
    const baseSprite = spec.sprite
    const groundHug = isGroundHugItem(item)
    const facing = spec.facingDirection
    // Authored volumes are sculpted for all four sides: they stand on the
    // board and turn with the item instead of mirroring + billboarding.
    const rotates =
      facing !== null && !groundHug && baseSprite?.volumes?.[0] !== undefined
    const sprite = rotates ? baseSprite : orientedSpriteForSpec(spec)
    if (!sprite) throw new Error(`Missing sprite for ${spec.key}.`)
    // Sprites without authored volumes stay flat silhouette slabs — thick
    // enough to read as cards, nothing more.
    const fallback = (frame: Parameters<typeof slabVolume>[0]) =>
      slabVolume(frame, groundHug ? VOXEL_GROUND_HUG_BACK_LAYERS : VOXEL_CARD_BACK_LAYERS)
    const volumes = spriteVolumes(sprite, fallback)
    const bounds = spriteVolumeBounds(sprite, volumes)
    if (!bounds) throw new Error(`Empty sprite for ${spec.key}.`)
    const rect = voxelDrawRect(bounds, voxelInnerSize)
    const outlineColor = groundHug ? undefined : VOXEL_OUTLINE_COLOR
    const frameBounds = spriteContentBounds(sprite) ?? bounds
    const overlays = facing
      ? rotates
        ? arrowMarkerSlices(frameBounds)
        : arrowOverlaysForDirection(facing, frameBounds)
      : []
    // Standing models plant their bottom row on the ground plane and spin
    // around the volume's depth center; billboard cards keep the authored
    // frame plane just in front of the card origin.
    const drawY = rotates
      ? (bounds.maxY + 1) * rect.texel -
        (CARD_BASE_Z - GROUND_SURFACE_Z) +
        VOXEL_STAND_LIFT
      : rect.drawY
    const volume0 = volumes[0]
    const frameFrontZ =
      rotates && volume0
        ? (((volume0.backSlices?.length ?? 0) + 1) -
            (volume0.frontSlices?.length ?? 0)) *
          (rect.texel / 2)
        : VOXEL_FRAME_Z
    const geoKeyPrefix = rotates ? `voxrot:${item.name}` : `vox:${spec.key}`

    const frameGeometries = spriteFrames(sprite).map((frame, ix) => {
      const key = `${geoKeyPrefix}:${ix}`
      let geometry = geometryCache.get(key)
      if (!geometry) {
        geometry = buildVoxelVolumeGeometry(
          { frame, palette: sprite.palette, volume: volumes[ix], overlays },
          {
            drawX: rect.drawX,
            drawY,
            texel: rect.texel,
            frameFrontZ,
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
      facingYaw: rotates && facing ? FACING_YAW[facing] : undefined,
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
    return {
      key,
      geometry: plateGeometry,
      material,
      frameGeometries: [],
      facingYaw: undefined,
    }
  }

  // Every input cardSpecForItem/voxelVisual reads (isText, name, dir,
  // facing-affecting props, overridden) is in the key — minContrastRatio is a
  // fixed preset constant. Same key → identical spec → identical visual, so
  // the per-item sync cost collapses to a map lookup after first build.
  const visualKeyForItem = (item: Item, overridden: boolean): string =>
    `${item.isText ? 1 : 0}|${item.name}|${item.dir ?? ''}|${overridden ? 1 : 0}|${item.props.join(',')}`

  const getVisual = (item: Item, overridden = false): EntityVisual => {
    const key = visualKeyForItem(item, overridden)
    const cached = visualCache.get(key)
    if (cached) return cached
    const spec = cardSpecForItem(
      item,
      preset.readability.minContrastRatio,
      overridden,
    )
    const visual = spec.sprite ? voxelVisual(item, spec) : plateVisual(spec)
    visualCache.set(key, visual)
    return visual
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
    visualCache.clear()
    voxelMaterial.dispose()
    plateGeometry.dispose()
  }

  return {
    getVisual,
    advanceSpriteFrames,
    dispose,
  }
}
