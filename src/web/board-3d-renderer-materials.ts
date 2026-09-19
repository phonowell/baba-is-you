import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshToonMaterial,
  Shape,
} from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import {
  cardSpecForItem,
  fxColorsForSpec,
  orientedSpriteForSpec,
} from './board-3d-shared-item.js'
import { createCardTextures, getToonGradientMap } from './board-3d-textures.js'
import { autotileAppliesTo, autotileSprite } from './pixel-sprites/autotile.js'
import {
  SPRITE_GRID_SIZE,
  spriteContentBounds,
  spriteFrames,
  spriteVolumeBounds,
} from './pixel-sprites/derive.js'
import {
  arrowOverlaysForDirection,
} from './pixel-sprites/arrows.js'
import {
  buildVoxelVolumeGeometry,
  slabVolume,
  spriteVolumes,
  voxelDrawRect,
} from './pixel-sprites/voxel.js'
import { isGroundHugItem } from '../view/stack-policy.js'

import type { Material } from 'three'
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
  VOXEL_GROUND_HUG_FRAME_Z,
  VOXEL_PLATE_CORNER_RADIUS,
  VOXEL_SHADE_FRONT,
  VOXEL_SHADE_TOP,
  VOXEL_SHADE_SIDE,
  VOXEL_SHADE_BOTTOM,
  VOXEL_SHADE_BACK,
  VOXEL_OUTLINE_COLOR,
} = BOARD3D_VOXEL_CONFIG

const VOXEL_SHADE = {
  front: VOXEL_SHADE_FRONT,
  top: VOXEL_SHADE_TOP,
  side: VOXEL_SHADE_SIDE,
  bottom: VOXEL_SHADE_BOTTOM,
  back: VOXEL_SHADE_BACK,
}

// The whole sprite grid in cell units — the draw rect every ground-hug tile
// shares so 24px of sprite art always lands on the same world-space spot.
const FULL_GRID_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: SPRITE_GRID_SIZE - 1,
  maxY: SPRITE_GRID_SIZE - 1,
}

// Everything a node needs to display one spec: shared geometry/material
// handles plus the per-frame geometry list when the sprite animates.
// facingYaw is set only for authored voxel models that stand upright on the
// board and turn with the item's direction; flat visuals leave it undefined
// and keep the camera-facing card orientation. fxColors feeds spawn/despawn
// particle bursts — fully spec-derived, so it rides the same cache entry.
export type EntityVisual = {
  key: string
  geometry: BufferGeometry
  material: Material | Material[]
  frameGeometries: BufferGeometry[]
  facingYaw: number | undefined
  fxColors: readonly string[]
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
// nodes with multi-frame lists ever change. Each node reads the shared tick
// through its own frame offset, so cards wobble out of phase with each
// other. Kept DOM-free for tests.
export const advanceNodeGeometries = (
  nodes: ReadonlyMap<
    number,
    Pick<EntityNode, 'mesh' | 'frameGeometries' | 'idleFrameOffset'>
  >,
  frameIx: number,
): number => {
  let changed = 0
  for (const node of nodes.values()) {
    const frames = node.frameGeometries
    if (!frames || frames.length < 2) continue
    const next = frames[(frameIx + node.idleFrameOffset) % frames.length]
    if (next !== undefined && node.mesh.geometry !== next) {
      node.mesh.geometry = next
      changed += 1
    }
  }
  return changed
}

export type Board3dRendererMaterialStore = {
  getVisual: (item: Item, overridden?: boolean, tileMask?: number) => EntityVisual
  // Swaps every animated material to the given frame; returns how many
  // materials actually changed so the runtime can skip idle renders.
  advanceSpriteFrames: (frameIx: number) => number
  dispose: () => void
}

// Plate material group order — matches the material array in plateVisual:
// front lid, back lid, then top/side/bottom wall strips.
const PLATE_GROUP_FRONT = 0

// Rounded-rect slab for text/emoji cards: an extruded rounded rectangle
// whose triangles are regrouped by face normal into five material groups
// (front lid, back lid, top/side/bottom wall strips). The wall strips shade
// with the shared VOXEL_SHADE factors, so plates and sprite silhouette
// slabs are the same card language — the rounded perimeter is the card's
// actual silhouette, nothing can poke out misaligned.
const createPlateGeometry = (
  size: number,
  depth: number,
  radius: number,
): BufferGeometry => {
  const half = size / 2
  const shape = new Shape()
    .moveTo(-half + radius, -half)
    .lineTo(half - radius, -half)
    .absarc(half - radius, -half + radius, radius, -Math.PI / 2, 0)
    .lineTo(half, half - radius)
    .absarc(half - radius, half - radius, radius, 0, Math.PI / 2)
    .lineTo(-half + radius, half)
    .absarc(-half + radius, half - radius, radius, Math.PI / 2, Math.PI)
    .lineTo(-half, -half + radius)
    .absarc(-half + radius, -half + radius, radius, Math.PI, Math.PI * 1.5)
  const source = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 5,
  })
  source.translate(0, 0, -depth / 2)

  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  const uv = source.getAttribute('uv')
  const triCount = position.count / 3
  const front: number[] = []
  const back: number[] = []
  const top: number[] = []
  const side: number[] = []
  const bottom: number[] = []
  for (let t = 0; t < triCount; t++) {
    let nx = 0
    let ny = 0
    let nz = 0
    for (let v = 0; v < 3; v++) {
      nx += normal.getX(t * 3 + v)
      ny += normal.getY(t * 3 + v)
      nz += normal.getZ(t * 3 + v)
    }
    if (nz > 0) front.push(t)
    else if (nz < 0) back.push(t)
    else if (Math.abs(ny) > Math.abs(nx)) (ny > 0 ? top : bottom).push(t)
    else side.push(t)
  }
  const buckets = [front, back, top, side, bottom]

  const geometry = new BufferGeometry()
  const outPos = new Float32Array(position.count * 3)
  const outNormal = new Float32Array(position.count * 3)
  const outUv = new Float32Array(uv.count * 2)
  let write = 0
  let groupStart = 0
  buckets.forEach((tris, groupIx) => {
    for (const t of tris) {
      for (let v = 0; v < 3; v++) {
        const src = t * 3 + v
        const x = position.getX(src)
        const y = position.getY(src)
        outPos.set([x, y, position.getZ(src)], write * 3)
        outNormal.set(
          [normal.getX(src), normal.getY(src), normal.getZ(src)],
          write * 3,
        )
        if (groupIx === PLATE_GROUP_FRONT) {
          // Front lid UVs map the card texture 1:1 across the rounded face.
          outUv.set([(x + half) / size, (y + half) / size], write * 2)
        }
        write++
      }
    }
    geometry.addGroup(groupStart, tris.length * 3, groupIx)
    groupStart += tris.length * 3
  })
  geometry.setAttribute('position', new BufferAttribute(outPos, 3))
  geometry.setAttribute('normal', new BufferAttribute(outNormal, 3))
  geometry.setAttribute('uv', new BufferAttribute(outUv, 2))
  source.dispose()
  return geometry
}

export const createBoard3dRendererMaterialStore = (
  args: CreateBoard3dRendererMaterialStoreArgs,
): Board3dRendererMaterialStore => {
  const { preset, textureAnisotropy } = args
  const textureCache = new Map<string, CanvasTexture[]>()
  const materialCache = new Map<string, CardMaterial>()
  const animatedFrames = new Map<CardMaterial, CanvasTexture[]>()
  const geometryCache = new Map<string, BufferGeometry>()
  const edgeMaterialCache = new Map<string, MeshBasicMaterial>()
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
  const voxelInnerSize = CARD_WORLD_SIZE * VOXEL_INNER_SIZE_RATIO
  // Plates are silhouette cards too: same depth as the sprite slab
  // (frame layer + back slices, at the canonical 24-texel frame width).
  const plateDepth =
    (voxelInnerSize / 24) * (VOXEL_CARD_BACK_LAYERS + 1)
  const plateGeometry = createPlateGeometry(
    CARD_WORLD_SIZE,
    plateDepth,
    VOXEL_PLATE_CORNER_RADIUS,
  )

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

    // Flat unlit plate faces: text/emoji cards read as one solid colour
    // chip — no shading bands or edge seams breaking the surface.
    const material = new MeshBasicMaterial({
      map: firstFrame,
      transparent: true,
      alphaTest: CARD_MATERIAL_ALPHA_TEST,
      side: DoubleSide,
    })
    materialCache.set(spec.key, material)
    if (frames.length > 1) animatedFrames.set(material, frames)
    return material
  }

  // Plate edges shade exactly like the sprite slab's voxel faces — the
  // card's own colour times the shared VOXEL_SHADE factors per face.
  const edgeMaterial = (
    spec: ReturnType<typeof cardSpecForItem>,
    face: keyof typeof VOXEL_SHADE,
  ): MeshBasicMaterial => {
    const key = `${spec.key}:${face}`
    const cached = edgeMaterialCache.get(key)
    if (cached) return cached
    const material = new MeshBasicMaterial({
      color: new Color(spec.background).multiplyScalar(VOXEL_SHADE[face]),
    })
    edgeMaterialCache.set(key, material)
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
    tileMask: number,
  ): EntityVisual => {
    const baseSprite = spec.sprite
    const groundHug = isGroundHugItem(item)
    const facing = spec.facingDirection
    // Authored volumes are sculpted for all four sides: they stand on the
    // board and turn with the item instead of mirroring + billboarding.
    const rotates =
      facing !== null && !groundHug && baseSprite?.volumes?.[0] !== undefined
    const oriented = rotates ? baseSprite : orientedSpriteForSpec(spec)
    // Ground tiles re-sprite by neighbour mask — shoreline edges, bevelled
    // rims and connected path pieces all live in the swapped variant.
    const sprite =
      oriented && groundHug ? autotileSprite(oriented, item.name, tileMask) : oriented
    if (!sprite) throw new Error(`Missing sprite for ${spec.key}.`)
    // Sprites without authored volumes stay flat silhouette slabs — thick
    // enough to read as cards, nothing more.
    const fallback = (frame: Parameters<typeof slabVolume>[0]) =>
      slabVolume(frame, groundHug ? VOXEL_GROUND_HUG_BACK_LAYERS : VOXEL_CARD_BACK_LAYERS)
    const volumes = spriteVolumes(sprite, fallback)
    const bounds = spriteVolumeBounds(sprite, volumes)
    if (!bounds) throw new Error(`Empty sprite for ${spec.key}.`)
    // Ground-hug tiles span the whole 1x1 cell — they are the floor, not
    // cards on it — while upright sprites keep the card's inner margin.
    // Autotiled tiles anchor to the full sprite grid instead of content
    // bounds: sparse path/edge art sits at absolute grid positions, and
    // rescaling it to fill the cell would break neighbour alignment. Other
    // ground tiles (belt) keep content-fit stretching.
    const rect = voxelDrawRect(
      groundHug && autotileAppliesTo(item.name) ? FULL_GRID_BOUNDS : bounds,
      groundHug ? 1 : voxelInnerSize,
    )
    const outlineColor = groundHug ? undefined : VOXEL_OUTLINE_COLOR
    const frameBounds = spriteContentBounds(sprite) ?? bounds
    // Facing arrows belong to silhouette cards only — a rotating authored
    // model or a direction-rotated sprite already points at the direction.
    const overlays =
      facing && !rotates && !spec.rotatesWithDirection
        ? arrowOverlaysForDirection(facing, frameBounds)
        : []
    // Standing models plant their bottom row on the ground plane and spin
    // around the volume's depth center; billboard cards keep the authored
    // frame plane just in front of the card origin.
    const drawY = rotates
      ? (bounds.maxY + 1) * rect.texel - (CARD_BASE_Z - GROUND_SURFACE_Z)
      : rect.drawY
    const volume0 = volumes[0]
    const frameFrontZ =
      rotates && volume0
        ? (((volume0.backSlices?.length ?? 0) + 1) -
            (volume0.frontSlices?.length ?? 0)) *
          (rect.texel / 2)
        : groundHug
          ? VOXEL_GROUND_HUG_FRAME_Z
          : VOXEL_FRAME_Z
    const geoKeyPrefix = rotates
      ? `voxrot:${item.name}`
      : `vox:${spec.key}${tileMask ? `:${tileMask}` : ''}`

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
      key: `vox:${spec.key}${tileMask ? `:${tileMask}` : ''}`,
      geometry,
      material: voxelMaterial,
      frameGeometries,
      facingYaw: rotates && facing ? FACING_YAW[facing] : undefined,
      fxColors: fxColorsForSpec(spec),
    }
  }

  const plateVisual = (spec: ReturnType<typeof cardSpecForItem>): EntityVisual => {
    const key = `plate:${spec.key}`
    let material = plateMaterialCache.get(key)
    if (!material) {
      // Group order from createPlateGeometry: front/back lids, then
      // top/side/bottom wall strips.
      material = [
        frontMaterial(spec),
        edgeMaterial(spec, 'back'),
        edgeMaterial(spec, 'top'),
        edgeMaterial(spec, 'side'),
        edgeMaterial(spec, 'bottom'),
      ]
      plateMaterialCache.set(key, material)
    }
    return {
      key,
      geometry: plateGeometry,
      material,
      frameGeometries: [],
      facingYaw: undefined,
      fxColors: fxColorsForSpec(spec),
    }
  }

  // Every input cardSpecForItem/voxelVisual reads (isText, name, dir,
  // facing-affecting props, overridden) is in the key —
  // minContrastRatio is a fixed preset constant. Same key → identical spec
  // → identical visual, so the per-item sync cost collapses to a lookup
  // after first build.
  const visualKeyForItem = (item: Item, overridden: boolean, tileMask: number): string => {
    return `${item.isText ? 1 : 0}|${item.name}|${item.dir ?? ''}|${overridden ? 1 : 0}|${item.props.join(',')}|${tileMask}`
  }

  const getVisual = (item: Item, overridden = false, tileMask = 0): EntityVisual => {
    const key = visualKeyForItem(item, overridden, tileMask)
    const cached = visualCache.get(key)
    if (cached) return cached
    const spec = cardSpecForItem(
      item,
      preset.readability.minContrastRatio,
      overridden,
    )
    const visual = spec.sprite ? voxelVisual(item, spec, tileMask) : plateVisual(spec)
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
