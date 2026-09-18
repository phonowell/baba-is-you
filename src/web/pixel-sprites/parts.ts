import type { PixelFrame, PixelVolume } from './types.js'

// Part-based volume authoring: compose a sculpture from 3D primitives in
// slice space (x = column, y = row down, z = depth; z=0 is the midsection
// plane, negative z protrudes toward the camera). Parts rasterize into a
// fully self-contained PixelVolume — its own `frame` slice included — so no
// sprite silhouette survives anywhere in the model.
export type VoxelPart =
  | { kind: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; key: string }
  | {
      kind: 'ellipsoid'
      cx: number
      cy: number
      cz: number
      rx: number
      ry: number
      rz: number
      key: string
    }

const SLICE_SIZE = 24

const paint = (
  layers: Map<number, string[][]>,
  z: number,
  x: number,
  y: number,
  key: string,
): void => {
  if (x < 0 || x >= SLICE_SIZE || y < 0 || y >= SLICE_SIZE) return
  let layer = layers.get(z)
  if (!layer) {
    layer = Array.from({ length: SLICE_SIZE }, () =>
      Array.from({ length: SLICE_SIZE }, () => '.'),
    )
    layers.set(z, layer)
  }
  const row = layer[y]
  if (row) row[x] = key
}

const partVoxels = (part: VoxelPart): [number, number, number][] => {
  const out: [number, number, number][] = []
  if (part.kind === 'box') {
    for (let z = part.z; z < part.z + part.d; z++)
      for (let y = part.y; y < part.y + part.h; y++)
        for (let x = part.x; x < part.x + part.w; x++) out.push([x, y, z])
    return out
  }
  const { cx, cy, cz, rx, ry, rz } = part
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        const dz = (z + 0.5 - cz) / rz
        if (dx * dx + dy * dy + dz * dz <= 1) out.push([x, y, z])
      }
  return out
}

const layerFrame = (layer: string[][] | undefined): PixelFrame | undefined => {
  if (!layer) return undefined
  const frame = layer.map((row) => row.join(''))
  return frame.some((row) => /[^.]/.test(row)) ? frame : undefined
}

// Rasterize parts (in order — later parts overwrite) into slices. Empty z
// layers inside the used range are emitted as blank slices so slice indices
// keep their true depth.
export const volumeFromParts = (parts: readonly VoxelPart[]): PixelVolume => {
  const layers = new Map<number, string[][]>()
  for (const part of parts) {
    for (const [x, y, z] of partVoxels(part)) paint(layers, z, x, y, part.key)
  }
  const zs = [...layers.keys()]
  const minZ = Math.min(0, ...zs)
  const maxZ = Math.max(0, ...zs)
  const frontSlices: PixelFrame[] = []
  for (let z = -1; z >= minZ; z--) {
    frontSlices.push(layerFrame(layers.get(z)) ?? emptySlice())
  }
  const backSlices: PixelFrame[] = []
  for (let z = 1; z <= maxZ; z++) {
    backSlices.push(layerFrame(layers.get(z)) ?? emptySlice())
  }
  return {
    ...(frontSlices.length ? { frontSlices } : {}),
    frame: layerFrame(layers.get(0)),
    ...(backSlices.length ? { backSlices } : {}),
  }
}

const emptySlice = (): PixelFrame =>
  Array.from({ length: SLICE_SIZE }, () => '.'.repeat(SLICE_SIZE))
