import {
  BackSide,
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
import { BOARD3D_RULE_VISUAL_CONFIG } from './board-3d-config-visuals.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import {
  cardSpecForItem,
  fxColorsForSpec,
  orientedSpriteForSpec,
} from './board-3d-shared-item.js'
import { youOutlinePulse } from './board-3d-shared-math.js'
import { createCardTextures, getToonGradientMap } from './board-3d-textures.js'
import {
  createPlateAtlas,
  patchPlateFrontUv,
  patchPlateWallTint,
} from './board-3d-plate-atlas.js'
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
  mergeFrameGeometries,
  patchVoxelFrameSelect,
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

const {
  YOU_OUTLINE_SCALE,
  YOU_OUTLINE_SCALE_SWELL,
} = BOARD3D_RULE_VISUAL_CONFIG

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
// The rim shell paints in the card's own palette turned negative: per-spec
// material + the base/inverse endpoints the idle pulse lerps between.
export type EntityVisual = {
  key: string
  geometry: BufferGeometry
  material: Material | Material[]
  frameGeometries: BufferGeometry[]
  facingYaw: number | undefined
  fxColors: readonly string[]
  outlineMaterial: MeshBasicMaterial
  outlineTint: EntityOutlineTint
  // Present on atlas-bound plate visuals: the batch layer routes these
  // nodes into the single shared plate InstancedMesh and writes the
  // per-instance atlas cell + wall tint instead of keying a batch per spec.
  plate?: PlateBinding
}

// A text card bound into the shared plate atlas (`board-3d-plate-atlas.ts`):
// origin is the card face's pixel-space cell origin in the atlas; tint is
// the card's background colour fed to the wall group per instance.
export type PlateBinding = {
  origin: Float32Array
  tint: Color
}

// The rim's pulse endpoints: the card's representative colour and its sRGB
// channel complement — the outline breathes between the card colour and
// its photographic negative.
export type EntityOutlineTint = {
  base: Color
  inverse: Color
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

// Voxel nodes animate through one merged geometry tagged per frame; the
// tick only advances `frameIndex` (a per-instance attribute the batch
// writes on its next flush) and swaps the non-instanced outline shell's
// real frame geometry so the rim keeps matching the silhouette. Each node
// reads the shared tick through its own frame offset, so cards wobble out
// of phase with each other. Kept DOM-free for tests.
export const advanceNodeGeometries = (
  nodes: ReadonlyMap<
    number,
    Pick<EntityNode, 'outline' | 'frameGeometries' | 'frameIndex' | 'idleFrameOffset'>
  >,
  frameIx: number,
): number => {
  let changed = 0
  for (const node of nodes.values()) {
    const frames = node.frameGeometries
    if (!frames || frames.length < 2) continue
    const next = (frameIx + node.idleFrameOffset) % frames.length
    if (next === node.frameIndex) continue
    node.frameIndex = next
    const outlineGeometry = frames[next]
    if (outlineGeometry) node.outline.geometry = outlineGeometry
    changed += 1
  }
  return changed
}

export type Board3dRendererMaterialStore = {
  getVisual: (item: Item, overridden?: boolean, tileMask?: number) => EntityVisual
  // Swaps every animated material to the given frame; returns how many
  // materials actually changed so the runtime can skip idle renders.
  advanceSpriteFrames: (frameIx: number) => number
  // Breaths the control-layer rim on the idle tick: each visible shell
  // lerps its per-spec material between the card colour and its inverse
  // and swells, all on one shared phase. Returns how many rims are visible
  // so the runtime renders only when the pulse actually has something to
  // move.
  advanceYouOutline: (
    nodes: ReadonlyMap<number, Pick<EntityNode, 'outline' | 'outlineTint'>>,
    nowMs: number,
  ) => number
  dispose: () => void
}

// Rounded-rect slab for text/emoji cards: an extruded rounded rectangle
// regrouped into two material groups — the front lid (card texture) and
// every other face merged into one vertex-coloured wall. The per-face
// VOXEL_SHADE factors bake into the wall's vertex colours, so the five
// material draws of the old regroup collapse to two while plates and
// sprite silhouette slabs keep the same shading language. The rounded
// perimeter is the card's actual silhouette — nothing pokes out
// misaligned.
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
  const geometry = new BufferGeometry()
  const outPos = new Float32Array(position.count * 3)
  const outNormal = new Float32Array(position.count * 3)
  const outUv = new Float32Array(uv.count * 2)
  const outColor = new Float32Array(position.count * 3)
  let write = 0
  const writeTris = (tris: number[], shade: number, lid: boolean): void => {
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
        outColor.set([shade, shade, shade], write * 3)
        if (lid) {
          // Front lid UVs map the card texture 1:1 across the rounded face.
          outUv.set([(x + half) / size, (y + half) / size], write * 2)
        }
        write++
      }
    }
  }
  writeTris(front, 1, true)
  const wallStart = write
  writeTris(back, VOXEL_SHADE.back, false)
  writeTris(top, VOXEL_SHADE.top, false)
  writeTris(side, VOXEL_SHADE.side, false)
  writeTris(bottom, VOXEL_SHADE.bottom, false)
  geometry.addGroup(0, front.length * 3, 0)
  geometry.addGroup(wallStart, write - wallStart, 1)
  geometry.setAttribute('position', new BufferAttribute(outPos, 3))
  geometry.setAttribute('normal', new BufferAttribute(outNormal, 3))
  geometry.setAttribute('uv', new BufferAttribute(outUv, 2))
  geometry.setAttribute('color', new BufferAttribute(outColor, 3))
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
  const wallMaterialCache = new Map<string, MeshBasicMaterial>()
  const plateMaterialCache = new Map<string, Material[]>()
  const visualCache = new Map<string, EntityVisual>()

  // Shared plate atlas + the two materials every text card draws with:
  // the lid samples its face out of the atlas via a per-instance cell
  // index, the walls multiply the vertex-colour shading by a per-instance
  // tint. Built lazily on the first plate — sprite-only flows and node
  // tests never touch the DOM canvas. Specs only enter play through a
  // sync, so atlas paints/uploads land on the entry frame.
  type PlateAtlasBundle = {
    atlas: ReturnType<typeof createPlateAtlas>
    front: MeshBasicMaterial
    wall: MeshBasicMaterial
    bindings: Map<string, PlateBinding | null>
  }
  let plateBundle: PlateAtlasBundle | null = null
  const plateAtlasBundle = (): PlateAtlasBundle => {
    if (plateBundle) return plateBundle
    const atlas = createPlateAtlas({ anisotropy: textureAnisotropy })
    const front = new MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      alphaTest: CARD_MATERIAL_ALPHA_TEST,
      side: DoubleSide,
    })
    patchPlateFrontUv(front, atlas.sizeUniform, 'plate-front')
    const wall = new MeshBasicMaterial({ vertexColors: true })
    patchPlateWallTint(wall, 'plate-wall')
    plateBundle = { atlas, front, wall, bindings: new Map() }
    return plateBundle
  }

  // Paints the spec's card face into the atlas and returns its
  // per-instance binding. Null past atlas capacity — the plate falls back
  // to per-spec materials rather than corrupting the shared texture.
  const plateAtlasBind = (
    spec: ReturnType<typeof cardSpecForItem>,
  ): PlateBinding | null => {
    const bundle = plateAtlasBundle()
    const cached = bundle.bindings.get(spec.key)
    if (cached !== undefined) return cached
    const face = createCardTextures(spec, textureAnisotropy)[0]
    let binding: PlateBinding | null = null
    if (face) {
      const origin = bundle.atlas.register(spec.key, face.image)
      face.dispose()
      if (origin !== null) {
        binding = { origin, tint: new Color(spec.background) }
      }
    }
    bundle.bindings.set(spec.key, binding)
    return binding
  }

  // Cel-banded toon surface: the shared gradient map quantizes N·L into a
  // few steps, which is the anime look.
  const toonSurface = {
    gradientMap: getToonGradientMap(),
  }

  // Voxel slabs share one vertex-colored material: every pixel's color is
  // baked into the geometry's color attribute with per-face shading. The
  // frame-select patch lets one batch hold every wobble frame — merged
  // geometries tag each vertex with aFrameIx, the per-instance aFrame
  // attribute collapses all non-current triangles.
  const voxelMaterial = new MeshToonMaterial({
    vertexColors: true,
    ...toonSurface,
    emissive: new Color(CARD_MATERIAL_EMISSIVE_COLOR),
    emissiveIntensity: preset.materials.objectEmissiveIntensity,
  })
  patchVoxelFrameSelect(voxelMaterial, 'voxel-frames')
  // BackSide shell materials for control-layer cards, one per spec: the
  // inflated copy peeks past the card's silhouette and shows as a rim.
  // Tinted the card colour's sRGB complement — the pulse lerps it back to
  // the card colour on the shared wave, so the rim breathes between the
  // card and its negative. Unlit and unfogged so the rim reads in every
  // light and in the hazed far rows.
  const outlineCache = new Map<
    string,
    { outlineMaterial: MeshBasicMaterial; outlineTint: EntityOutlineTint }
  >()
  const outlineForSpec = (
    spec: ReturnType<typeof cardSpecForItem>,
    cardColors: readonly string[],
  ): { outlineMaterial: MeshBasicMaterial; outlineTint: EntityOutlineTint } => {
    const cached = outlineCache.get(spec.key)
    if (cached) return cached
    // The rim's "card colour" is the same representative colour the spawn
    // bursts lead with — palette head for sprites, plate background else.
    const base = new Color(cardColors[0] ?? spec.background)
    const inverse = new Color(base.getHex() ^ 0xffffff)
    const outlineMaterial = new MeshBasicMaterial({
      color: inverse,
      side: BackSide,
      fog: false,
    })
    const entry = {
      outlineMaterial,
      outlineTint: { base, inverse },
    }
    outlineCache.set(spec.key, entry)
    return entry
  }
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

  // Plate walls shade exactly like the sprite slab's voxel faces — the
  // card's own colour times the shared VOXEL_SHADE factors, but baked into
  // the geometry's vertex colours so one material covers every wall face.
  const wallMaterial = (
    spec: ReturnType<typeof cardSpecForItem>,
  ): MeshBasicMaterial => {
    const cached = wallMaterialCache.get(spec.key)
    if (cached) return cached
    const material = new MeshBasicMaterial({
      color: new Color(spec.background),
    })
    material.vertexColors = true
    wallMaterialCache.set(spec.key, material)
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
    // Multi-frame specs draw through one merged geometry (per-instance
    // aFrame selects the visible frame); single-frame specs keep the plain
    // geometry — no aFrameIx tag, no batch clone.
    const mergedKey = `${geoKeyPrefix}:merged`
    let geometry = frameGeometries[0]
    if (frameGeometries.length > 1) {
      geometry = geometryCache.get(mergedKey)
      if (!geometry) {
        geometry = mergeFrameGeometries(frameGeometries)
        geometryCache.set(mergedKey, geometry)
      }
    }
    if (!geometry) throw new Error(`No voxel geometry for ${spec.key}.`)
    const fxColors = fxColorsForSpec(spec)
    return {
      key: `vox:${spec.key}${tileMask ? `:${tileMask}` : ''}`,
      geometry,
      material: voxelMaterial,
      frameGeometries,
      facingYaw: rotates && facing ? FACING_YAW[facing] : undefined,
      fxColors,
      ...outlineForSpec(spec, fxColors),
    }
  }

  const plateVisual = (spec: ReturnType<typeof cardSpecForItem>): EntityVisual => {
    const key = `plate:${spec.key}`
    let material = plateMaterialCache.get(key)
    let plate = plateBundle?.bindings.get(spec.key) ?? null
    if (!material) {
      // Group order from createPlateGeometry: front lid, then the merged
      // vertex-coloured wall. Atlas-bound plates draw through the shared
      // instanced materials; overflow keeps the per-spec pair.
      plate = plateAtlasBind(spec)
      const bundle = plateAtlasBundle()
      material = plate
        ? [bundle.front, bundle.wall]
        : [frontMaterial(spec), wallMaterial(spec)]
      plateMaterialCache.set(key, material)
    }
    const fxColors = fxColorsForSpec(spec)
    return {
      key,
      geometry: plateGeometry,
      material,
      frameGeometries: [],
      facingYaw: undefined,
      fxColors,
      ...outlineForSpec(spec, fxColors),
      ...(plate ? { plate } : {}),
    }
  }

  // Every input cardSpecForItem/voxelVisual reads (isText, name, dir,
  // facing-affecting props, overridden) is in the key —
  // minContrastRatio is a fixed preset constant. Same key → identical spec
  // → identical visual, so the per-item sync cost collapses to a lookup
  // after first build.
  const visualKeyForItem = (
    item: Item,
    overridden: boolean,
    tileMask: number,
    active: boolean,
  ): string => {
    return `${item.isText ? 1 : 0}|${item.name}|${item.dir ?? ''}|${overridden ? 1 : 0}|${active ? 1 : 0}|${item.props.join(',')}|${tileMask}`
  }

  const getVisual = (
    item: Item,
    overridden = false,
    tileMask = 0,
    active = false,
  ): EntityVisual => {
    const key = visualKeyForItem(item, overridden, tileMask, active)
    const cached = visualCache.get(key)
    if (cached) return cached
    const spec = cardSpecForItem(
      item,
      preset.readability.minContrastRatio,
      overridden,
      active,
    )
    const visual = spec.sprite ? voxelVisual(item, spec, tileMask) : plateVisual(spec)
    visualCache.set(key, visual)
    return visual
  }

  const advanceSpriteFrames = (frameIx: number): number =>
    advanceFrameMaps(animatedFrames, frameIx)

  const advanceYouOutline = (
    nodes: ReadonlyMap<number, Pick<EntityNode, 'outline' | 'outlineTint'>>,
    nowMs: number,
  ): number => {
    const wave = youOutlinePulse(nowMs)
    const scale = YOU_OUTLINE_SCALE * (1 + wave * YOU_OUTLINE_SCALE_SWELL)
    let visible = 0
    for (const node of nodes.values()) {
      if (!node.outline.visible) continue
      node.outline.scale.setScalar(scale)
      // Same-spec cards share the rim material — re-lerping it with the
      // same wave is idempotent, so per-node writes need no dedupe.
      node.outline.material.color.lerpColors(
        node.outlineTint.inverse,
        node.outlineTint.base,
        wave,
      )
      visible += 1
    }
    return visible
  }

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
    for (const material of wallMaterialCache.values()) material.dispose()
    wallMaterialCache.clear()
    for (const entry of outlineCache.values()) entry.outlineMaterial.dispose()
    outlineCache.clear()
    plateMaterialCache.clear()
    visualCache.clear()
    voxelMaterial.dispose()
    if (plateBundle) {
      plateBundle.front.dispose()
      plateBundle.wall.dispose()
      plateBundle.atlas.dispose()
      plateBundle.bindings.clear()
      plateBundle = null
    }
    plateGeometry.dispose()
  }

  return {
    getVisual,
    advanceSpriteFrames,
    advanceYouOutline,
    dispose,
  }
}
