import { BufferAttribute, BufferGeometry } from 'three'

import {
  WOBBLE_PHASES,
  contentBounds,
  erodeFrame,
  frameSize,
  spriteFrames,
  wobbleShift,
  wobbleVolume,
} from './derive.js'

import type { FrameBounds, PixelFrame, PixelSprite, PixelVolume } from './types.js'

export type VoxelFaceShade = {
  front: number
  top: number
  side: number
  bottom: number
  back: number
}

export type VoxelBounds = FrameBounds

// World placement of the sprite grid inside the [-size/2, +size/2] card area:
// content bounds are centered, matching the texture path's draw rect.
export const voxelDrawRect = (
  bounds: VoxelBounds,
  size: number,
): { drawX: number; drawY: number; texel: number } => {
  const width = bounds.maxX - bounds.minX + 1
  const height = bounds.maxY - bounds.minY + 1
  const texel = size / Math.max(width, height)
  return {
    drawX: -size / 2 + (size - width * texel) / 2 - bounds.minX * texel,
    drawY: size / 2 - (size - height * texel) / 2 + bounds.minY * texel,
    texel,
  }
}

// One sprite-grid layer merged into the voxel volume at its own depth —
// authored slices use the sprite palette at dx/dy 0; arrow reliefs carry
// their own palette and grid-space offset.
export type VolumeSlice = {
  frame: PixelFrame
  palette: Record<string, string>
  dx: number
  dy: number
}

export type VoxelVolumeArgs = {
  frame: PixelFrame
  palette: Record<string, string>
  volume?: PixelVolume | undefined
  // Relief slices stacked in front of the volume's own front slices (each
  // one voxel thick) — the direction arrow and its dark backing pad.
  overlays?: readonly VolumeSlice[]
}

export type VoxelVolumeBuildOptions = {
  // Result of voxelDrawRect for the union content bounds.
  drawX: number
  drawY: number
  texel: number
  // World z of the frame plane's front face; the volume grows backward in
  // texel steps and frontSlices/overlays protrude past it toward camera.
  frameFrontZ: number
  shade: VoxelFaceShade
  // When set, empty cells adjacent to the frame-plane silhouette are filled
  // with this color — a flat one-voxel outline rim that keeps the sprite
  // readable against the board.
  outlineColor?: string | undefined
}

// Raw vertex soup kept separate from BufferGeometry assembly so the cell/face
// math stays unit-testable without constructing three.js attributes.
export type VoxelVertexSoup = {
  positions: number[]
  normals: number[]
  colors: number[]
  indices: number[]
}

// Palette hexes are authored in sRGB; vertex colors are consumed as linear
// values by the lighting pipeline, so decode them or every sprite renders a
// washed-out step brighter than intended.
const srgbChannelToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const hexToLinearRgb = (hex: string): [number, number, number] => [
  srgbChannelToLinear(Number.parseInt(hex.slice(1, 3), 16) / 255),
  srgbChannelToLinear(Number.parseInt(hex.slice(3, 5), 16) / 255),
  srgbChannelToLinear(Number.parseInt(hex.slice(5, 7), 16) / 255),
]

const pushQuad = (
  soup: VoxelVertexSoup,
  corners: readonly (readonly [number, number, number])[],
  normal: readonly [number, number, number],
  color: readonly [number, number, number],
  shade: number,
): void => {
  const base = soup.positions.length / 3
  for (const [x, y, z] of corners) {
    soup.positions.push(x, y, z)
    soup.normals.push(normal[0], normal[1], normal[2])
    soup.colors.push(
      Math.min(1, color[0] * shade),
      Math.min(1, color[1] * shade),
      Math.min(1, color[2] * shade),
    )
  }
  soup.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

const cellKey = (x: number, y: number): number => (y + 512) * 2048 + (x + 512)

// 3D occupancy key: z layers sit in the high bits (±128 around the frame
// plane), x/y reuse the 2D cell packing.
const LAYER_OFFSET = 128
const cellKey3 = (x: number, y: number, z: number): number =>
  ((z + LAYER_OFFSET) * 2048 + (y + 512)) * 2048 + (x + 512)

const decodeCell = (key: number): [number, number] => [
  (key % 2048) - 512,
  Math.floor(key / 2048) - 512,
]

const decodeCell3 = (key: number): [number, number, number] => [
  (key % 2048) - 512,
  Math.floor(key / 2048) % 2048 - 512,
  Math.floor(key / 4194304) - LAYER_OFFSET,
]

const paintedCells = (
  frame: PixelFrame,
  palette: Record<string, string>,
  dx = 0,
  dy = 0,
): Map<number, [number, number, number]> => {
  const { width, height } = frameSize(frame)
  const cells = new Map<number, [number, number, number]>()
  for (let y = 0; y < height; y += 1) {
    const row = frame[y] ?? ''
    for (let x = 0; x < width; x += 1) {
      const key = row[x] ?? '.'
      if (key === '.') continue
      const color = palette[key]
      if (!color) continue
      cells.set(cellKey(x + dx, y + dy), hexToLinearRgb(color))
    }
  }
  return cells
}

// Expands the cell map in place by a one-cell ring of outline cells on
// every silhouette-adjacent empty position.
const addOutlineRing = (
  cells: Map<number, [number, number, number]>,
  color: [number, number, number],
): void => {
  const ring: number[] = []
  for (const key of cells.keys()) {
    const cx = (key % 2048) - 512
    const cy = Math.floor(key / 2048) - 512
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nk = cellKey(cx + dx, cy + dy)
        if (!cells.has(nk)) ring.push(nk)
      }
    }
  }
  for (const key of ring) {
    if (!cells.has(key)) cells.set(key, color)
  }
}

const mergeSlice = (
  cells: Map<number, [number, number, number]>,
  slice: VolumeSlice,
  z: number,
): void => {
  for (const [key, color] of paintedCells(slice.frame, slice.palette, slice.dx, slice.dy)) {
    const [cx, cy] = decodeCell(key)
    cells.set(cellKey3(cx, cy, z), color)
  }
}

// Occupancy map for the whole volume: frame plane at z=0 (with the outline
// rim), authored slices behind/in front, relief overlays outermost.
export const buildVolumeCells = (
  args: VoxelVolumeArgs,
  outlineColor?: string,
): Map<number, [number, number, number]> => {
  const cells = new Map<number, [number, number, number]>()
  const plane = paintedCells(args.frame, args.palette)
  if (outlineColor) addOutlineRing(plane, hexToLinearRgb(outlineColor))
  for (const [key, color] of plane) {
    const [cx, cy] = decodeCell(key)
    cells.set(cellKey3(cx, cy, 0), color)
  }
  const bodySlice = (frame: PixelFrame): VolumeSlice => ({
    frame,
    palette: args.palette,
    dx: 0,
    dy: 0,
  })
  args.volume?.backSlices?.forEach((slice, i) => {
    mergeSlice(cells, bodySlice(slice), i + 1)
  })
  args.volume?.frontSlices?.forEach((slice, i) => {
    mergeSlice(cells, bodySlice(slice), -(i + 1))
  })
  const frontDepth = args.volume?.frontSlices?.length ?? 0
  args.overlays?.forEach((slice, i) => {
    mergeSlice(cells, slice, -(frontDepth + i + 1))
  })
  return cells
}

// Surface emission: a voxel face is drawn only where the neighboring cell
// is empty, so interior faces and contacts between layers stay culled.
export const voxelVolumeSoup = (
  args: VoxelVolumeArgs,
  options: VoxelVolumeBuildOptions,
): VoxelVertexSoup => {
  const soup: VoxelVertexSoup = { positions: [], normals: [], colors: [], indices: [] }
  const cells = buildVolumeCells(args, options.outlineColor)
  const { drawX, drawY, texel, frameFrontZ, shade } = options
  for (const [key, color] of cells) {
    const [cx, cy, cz] = decodeCell3(key)
    const x0 = drawX + cx * texel
    const x1 = x0 + texel
    const yTop = drawY - cy * texel
    const yBot = yTop - texel
    const zF = frameFrontZ - cz * texel
    const zB = zF - texel

    if (!cells.has(cellKey3(cx, cy, cz - 1))) {
      pushQuad(
        soup,
        [
          [x0, yBot, zF],
          [x1, yBot, zF],
          [x1, yTop, zF],
          [x0, yTop, zF],
        ],
        [0, 0, 1],
        color,
        shade.front,
      )
    }
    if (!cells.has(cellKey3(cx, cy, cz + 1))) {
      pushQuad(
        soup,
        [
          [x1, yBot, zB],
          [x0, yBot, zB],
          [x0, yTop, zB],
          [x1, yTop, zB],
        ],
        [0, 0, -1],
        color,
        shade.back,
      )
    }
    if (!cells.has(cellKey3(cx, cy - 1, cz))) {
      pushQuad(
        soup,
        [
          [x0, yTop, zB],
          [x0, yTop, zF],
          [x1, yTop, zF],
          [x1, yTop, zB],
        ],
        [0, 1, 0],
        color,
        shade.top,
      )
    }
    if (!cells.has(cellKey3(cx, cy + 1, cz))) {
      pushQuad(
        soup,
        [
          [x0, yBot, zF],
          [x0, yBot, zB],
          [x1, yBot, zB],
          [x1, yBot, zF],
        ],
        [0, -1, 0],
        color,
        shade.bottom,
      )
    }
    if (!cells.has(cellKey3(cx - 1, cy, cz))) {
      pushQuad(
        soup,
        [
          [x0, yTop, zF],
          [x0, yTop, zB],
          [x0, yBot, zB],
          [x0, yBot, zF],
        ],
        [-1, 0, 0],
        color,
        shade.side,
      )
    }
    if (!cells.has(cellKey3(cx + 1, cy, cz))) {
      pushQuad(
        soup,
        [
          [x1, yTop, zB],
          [x1, yTop, zF],
          [x1, yBot, zF],
          [x1, yBot, zB],
        ],
        [1, 0, 0],
        color,
        shade.side,
      )
    }
  }
  return soup
}

export const buildVoxelVolumeGeometry = (
  args: VoxelVolumeArgs,
  options: VoxelVolumeBuildOptions,
): BufferGeometry => {
  const soup = voxelVolumeSoup(args, options)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(soup.positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(soup.normals), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(soup.colors), 3))
  geometry.setIndex(soup.indices)
  return geometry
}

// Inflate fallback for sprites without authored volumes: erosion rings are
// resampled over ~2x the ring count so depth scales with silhouette width —
// wide sprites get a real dome, thin poles stay pole-thin. The smallest ring
// always lands last, so the back closes instead of cutting off flat. Sprites
// too thin to erode still get `minLayers` copies of the front silhouette.
export const inflateVolume = (
  frame: PixelFrame,
  maxLayers: number,
  minLayers: number,
): PixelVolume => {
  const rings: PixelFrame[] = []
  let current = frame
  while (rings.length < maxLayers) {
    const next = erodeFrame(current)
    if (!contentBounds(next)) break
    rings.push(next)
    current = next
  }
  const depth = Math.max(minLayers, Math.min(maxLayers, rings.length * 2))
  if (rings.length === 0) return { backSlices: Array.from({ length: depth }, () => frame) }
  const backSlices: PixelFrame[] = []
  for (let i = 0; i < depth; i++) {
    const ringIx = Math.min(rings.length - 1, Math.floor((i * rings.length) / depth))
    backSlices.push(rings[ringIx]!)
  }
  return { backSlices }
}

// Flat slab volume for ground-hug tiles: identical slices stacked behind the
// frame plane keep the old thin-plate look on the volume path.
export const slabVolume = (frame: PixelFrame, backLayers: number): PixelVolume => ({
  backSlices: Array.from({ length: backLayers }, () => frame),
})

// Resolves one volume per padded animation frame: authored entries win,
// authored frames without a volume inflate, wobble-derived frames reuse the
// base frame's volume shifted by the same vertical offset.
export const spriteVolumes = (
  sprite: PixelSprite,
  inflate: (frame: PixelFrame) => PixelVolume,
): PixelVolume[] => {
  const frames = spriteFrames(sprite)
  const base = frames[0]
  if (!base) return []
  const cache = new Map<PixelFrame, PixelVolume>()
  const inflateOnce = (frame: PixelFrame): PixelVolume => {
    let volume = cache.get(frame)
    if (!volume) {
      volume = inflate(frame)
      cache.set(frame, volume)
    }
    return volume
  }
  const baseVolume = sprite.volumes?.[0] ?? inflateOnce(base)
  const authoredCount = sprite.frames.length
  return frames.map((frame, ix) => {
    const authored = sprite.volumes?.[ix]
    if (authored) return authored
    if (ix < authoredCount) return inflateOnce(frame)
    const dy = wobbleShift(base, WOBBLE_PHASES[ix] ?? 0)
    return wobbleVolume(baseVolume, dy)
  })
}
