import { BufferAttribute, BufferGeometry } from 'three'

import { frameSize } from './derive.js'

import type { PixelFrame } from './types.js'

export type VoxelFaceShade = {
  front: number
  top: number
  side: number
  bottom: number
  back: number
}

export type VoxelBounds = { minX: number; minY: number; maxX: number; maxY: number }

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

export type VoxelBuildOptions = {
  // Result of voxelDrawRect for the sprite's union content bounds.
  drawX: number
  drawY: number
  texel: number
  // Slab thickness along local +z.
  depth: number
  shade: VoxelFaceShade
}

// A relief layer in front of the sprite face — used for the direction arrow.
export type VoxelOverlay = {
  frame: PixelFrame
  palette: Record<string, string>
  // Grid-space offset (in sprite cells) applied to the overlay frame.
  dx: number
  dy: number
  // Layer thickness; the overlay front sits at depth/2 + lift.
  lift: number
}

export type VoxelGeometryArgs = {
  frame: PixelFrame
  palette: Record<string, string>
  overlays?: readonly VoxelOverlay[]
}

// Raw vertex soup kept separate from BufferGeometry assembly so the cell/face
// math stays unit-testable without constructing three.js attributes.
export type VoxelVertexSoup = {
  positions: number[]
  normals: number[]
  colors: number[]
  indices: number[]
}

const hexToRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
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
      cells.set(cellKey(x + dx, y + dy), hexToRgb(color))
    }
  }
  return cells
}

// Emits front + optional per-cell back + boundary-only side walls for one
// layer of cells. The layer is `thick` deep with its front at `zFront`.
const emitLayer = (
  soup: VoxelVertexSoup,
  cells: Map<number, [number, number, number]>,
  drawX: number,
  drawY: number,
  texel: number,
  zFront: number,
  thick: number,
  shade: VoxelFaceShade,
  emitBack: boolean,
): void => {
  const zBack = zFront - thick
  for (const [key, color] of cells) {
    const cx = (key % 2048) - 512
    const cy = Math.floor(key / 2048) - 512
    const x0 = drawX + cx * texel
    const x1 = x0 + texel
    const yTop = drawY - cy * texel
    const yBot = yTop - texel

    pushQuad(
      soup,
      [
        [x0, yBot, zFront],
        [x1, yBot, zFront],
        [x1, yTop, zFront],
        [x0, yTop, zFront],
      ],
      [0, 0, 1],
      color,
      shade.front,
    )
    if (emitBack) {
      pushQuad(
        soup,
        [
          [x1, yBot, zBack],
          [x0, yBot, zBack],
          [x0, yTop, zBack],
          [x1, yTop, zBack],
        ],
        [0, 0, -1],
        color,
        shade.back,
      )
    }

    if (!cells.has(cellKey(cx, cy - 1))) {
      pushQuad(
        soup,
        [
          [x0, yTop, zBack],
          [x0, yTop, zFront],
          [x1, yTop, zFront],
          [x1, yTop, zBack],
        ],
        [0, 1, 0],
        color,
        shade.top,
      )
    }
    if (!cells.has(cellKey(cx, cy + 1))) {
      pushQuad(
        soup,
        [
          [x0, yBot, zFront],
          [x0, yBot, zBack],
          [x1, yBot, zBack],
          [x1, yBot, zFront],
        ],
        [0, -1, 0],
        color,
        shade.bottom,
      )
    }
    if (!cells.has(cellKey(cx - 1, cy))) {
      pushQuad(
        soup,
        [
          [x0, yTop, zFront],
          [x0, yTop, zBack],
          [x0, yBot, zBack],
          [x0, yBot, zFront],
        ],
        [-1, 0, 0],
        color,
        shade.side,
      )
    }
    if (!cells.has(cellKey(cx + 1, cy))) {
      pushQuad(
        soup,
        [
          [x1, yTop, zBack],
          [x1, yTop, zFront],
          [x1, yBot, zFront],
          [x1, yBot, zBack],
        ],
        [1, 0, 0],
        color,
        shade.side,
      )
    }
  }
}

// Vertex soup for the sprite slab plus optional overlay reliefs. Overlay
// side walls cull only against their own cells, so the relief sticks out of
// the face underneath regardless of what the sprite paints there.
export const voxelVertexSoup = (
  args: VoxelGeometryArgs,
  options: VoxelBuildOptions,
): VoxelVertexSoup => {
  const soup: VoxelVertexSoup = { positions: [], normals: [], colors: [], indices: [] }
  const cells = paintedCells(args.frame, args.palette)
  emitLayer(
    soup,
    cells,
    options.drawX,
    options.drawY,
    options.texel,
    options.depth / 2,
    options.depth,
    options.shade,
    true,
  )

  for (const overlay of args.overlays ?? []) {
    if (overlay.lift <= 0) continue
    const overlayCells = paintedCells(overlay.frame, overlay.palette, overlay.dx, overlay.dy)
    emitLayer(
      soup,
      overlayCells,
      options.drawX,
      options.drawY,
      options.texel,
      options.depth / 2 + overlay.lift,
      overlay.lift,
      options.shade,
      false,
    )
  }
  return soup
}

export const buildVoxelGeometry = (
  args: VoxelGeometryArgs,
  options: VoxelBuildOptions,
): BufferGeometry => {
  const soup = voxelVertexSoup(args, options)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(soup.positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(soup.normals), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(soup.colors), 3))
  geometry.setIndex(soup.indices)
  return geometry
}
