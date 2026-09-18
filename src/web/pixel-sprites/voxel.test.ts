import assert from 'node:assert/strict'
import test from 'node:test'

import { advanceNodeGeometries } from '../board-3d-renderer-materials.js'
import {
  buildVolumeCells,
  slabVolume,
  spriteVolumes,
  voxelDrawRect,
  voxelVolumeSoup,
} from './voxel.js'

import type { PixelFrame } from './types.js'
import type { VoxelVolumeBuildOptions } from './voxel.js'

const SHADE = { front: 1, top: 1.2, side: 0.7, bottom: 0.5, back: 0.35 }

const options = (overrides: Partial<VoxelVolumeBuildOptions> = {}): VoxelVolumeBuildOptions => ({
  drawX: -0.5,
  drawY: 0.5,
  texel: 1 / 24,
  frameFrontZ: 0.11,
  shade: SHADE,
  ...overrides,
})

const quadCount = (soup: { indices: number[] }): number => soup.indices.length / 6

const singleCell: PixelFrame = ['a']
const block2x2: PixelFrame = ['aa', 'aa']
const ring3x3: PixelFrame = ['aaa', 'a.a', 'aaa']

const PALETTE = { a: '#808080' }

test('voxel soup emits all six faces of a single cube', () => {
  const soup = voxelVolumeSoup({ frame: singleCell, palette: PALETTE }, options())
  assert.equal(quadCount(soup), 6)
})

test('voxel soup culls interior faces inside a solid 2x2x2 block', () => {
  const soup = voxelVolumeSoup(
    { frame: block2x2, palette: PALETTE, volume: { backSlices: [block2x2] } },
    options(),
  )
  // 8 corner voxels x 3 exposed faces each
  assert.equal(quadCount(soup), 24)
})

test('voxel soup keeps boundary-only side walls on a flat layer', () => {
  const soup = voxelVolumeSoup({ frame: block2x2, palette: PALETTE }, options())
  // 4 front + 4 back + 8 perimeter edges (interior edges culled)
  assert.equal(quadCount(soup), 16)
})

test('voxel soup culls contact faces between stacked layers', () => {
  const soup = voxelVolumeSoup(
    { frame: singleCell, palette: PALETTE, volume: { backSlices: [singleCell] } },
    options(),
  )
  // 2 voxels: 1 front + 1 back + 4 sides each
  assert.equal(quadCount(soup), 10)
})

test('voxel soup keeps holes open through a hollow ring', () => {
  const frameFrontZ = 0.11
  const texel = 1
  const soup = voxelVolumeSoup(
    { frame: ring3x3, palette: PALETTE },
    options({ drawX: 0, drawY: 0, texel, frameFrontZ }),
  )
  // 8 cells: 8 front + 8 back + 12 outer + 4 inner edges
  assert.equal(quadCount(soup), 32)
  // The hole cell is grid (1,1): world x in [1,2], y in [-2,-1]. No back-face
  // vertex may sit strictly inside that rect, or the hole would be plugged.
  const zBack = frameFrontZ - texel
  for (let i = 0; i < soup.positions.length; i += 3) {
    const x = soup.positions[i]!
    const y = soup.positions[i + 1]!
    const z = soup.positions[i + 2]!
    if (z !== zBack) continue
    const insideHole = x > 1 && x < 2 && y > -2 && y < -1
    assert.equal(insideHole, false, `back vertex inside hole at ${x},${y}`)
  }
})

test('voxel soup bakes face shading into vertex colors', () => {
  const soup = voxelVolumeSoup({ frame: singleCell, palette: PALETTE }, options())
  const colorAt = (vertexIx: number): number => soup.colors[vertexIx * 3]!
  // Palette hex is decoded sRGB -> linear before shading is multiplied in.
  const base = ((128 / 255 + 0.055) / 1.055) ** 2.4
  // First emitted quad is the front face (shade 1.0).
  assert.ok(Math.abs(colorAt(0) - base) < 1e-6)
  // Find a top-face vertex: normal +y.
  const topIx = soup.normals.findIndex((n, i) => i % 3 === 1 && n === 1) / 3
  assert.ok(Math.abs(colorAt(topIx) - base * 1.2) < 1e-6)
})

test('overlays stack as slices in front of authored front slices', () => {
  const cells = buildVolumeCells({
    frame: singleCell,
    palette: PALETTE,
    volume: { frontSlices: [singleCell] },
    overlays: [
      { frame: singleCell, palette: PALETTE, dx: 0, dy: 0 },
      { frame: singleCell, palette: PALETTE, dx: 0, dy: 0 },
    ],
  })
  // z layers: overlays -3,-2, frontSlice -1, frame 0
  const layers = new Set(
    [...cells.keys()].map((key) => Math.floor(key / 4194304)),
  )
  assert.equal(layers.size, 4)
})

test('voxel soup places overlay relief in front of the front surface', () => {
  const texel = 1 / 24
  const soup = voxelVolumeSoup(
    {
      frame: singleCell,
      palette: PALETTE,
      overlays: [{ frame: singleCell, palette: PALETTE, dx: 0, dy: 0 }],
    },
    options({ frameFrontZ: 0.11 }),
  )
  const maxZ = Math.max(...soup.positions.filter((_, i) => i % 3 === 2))
  assert.ok(Math.abs(maxZ - (0.11 + texel)) < 1e-6)
})

test('slabVolume stacks identical slices for flat tiles', () => {
  const volume = slabVolume(block2x2, 2)
  assert.deepEqual(volume.backSlices, [block2x2, block2x2])
})

test('spriteVolumes prefers authored volumes and wobbles the base volume', () => {
  const frame: PixelFrame = ['....', '.aa.', '.aa.', '....']
  const back: PixelFrame = ['....', '....', '.aa.', '....']
  const sprite = {
    palette: PALETTE,
    frames: [frame],
    volumes: [{ backSlices: [back] }],
  }
  const volumes = spriteVolumes(sprite, () => ({}))
  assert.equal(volumes.length, 3)
  // Frame 0 keeps the authored volume; derived frames wobble it down/up by 1.
  assert.deepEqual(volumes[0]!.backSlices![0], back)
  assert.deepEqual(volumes[1]!.backSlices![0], ['....', '....', '....', '.aa.'])
  assert.deepEqual(volumes[2]!.backSlices![0], ['....', '.aa.', '....', '....'])
})

test('spriteVolumes falls back for authored frames that lack a volume', () => {
  const f0: PixelFrame = ['....', '.aa.', '.aa.', '....']
  const f1: PixelFrame = ['....', '.aa.', '....', '....']
  const sprite = { palette: PALETTE, frames: [f0, f1] }
  const calls: PixelFrame[] = []
  const volumes = spriteVolumes(sprite, (frame) => {
    calls.push(frame)
    return { backSlices: [frame] }
  })
  assert.equal(volumes.length, 3)
  // Frame 1 falls back from its own frame, not the base frame.
  assert.deepEqual(calls, [f0, f1])
  assert.deepEqual(volumes[1]!.backSlices![0], f1)
})

test('voxelDrawRect centers content bounds at uniform texel scale', () => {
  const full = voxelDrawRect({ minX: 0, minY: 0, maxX: 23, maxY: 23 }, 1)
  assert.ok(Math.abs(full.drawX + 0.5) < 1e-6)
  assert.ok(Math.abs(full.drawY - 0.5) < 1e-6)
  assert.ok(Math.abs(full.texel - 1 / 24) < 1e-6)

  const half = voxelDrawRect({ minX: 6, minY: 6, maxX: 17, maxY: 17 }, 1)
  // 12x12 content centered: texel = 1/12, grid origin shifts by minX.
  assert.ok(Math.abs(half.texel - 1 / 12) < 1e-6)
  assert.ok(Math.abs(half.drawX - (-0.5 - 6 / 12)) < 1e-6)
  assert.ok(Math.abs(half.drawY - (0.5 + 6 / 12)) < 1e-6)
})

test('advanceNodeGeometries swaps mesh geometry through the frame cycle', () => {
  const g0 = { id: 'g0' }
  const g1 = { id: 'g1' }
  const g2 = { id: 'g2' }
  const animated = { mesh: { geometry: g0 }, frameGeometries: [g0, g1, g2] }
  const still = { mesh: { geometry: g0 }, frameGeometries: [g0] }
  const nodes = new Map([
    [1, animated],
    [2, still],
  ]) as never

  assert.equal(advanceNodeGeometries(nodes, 1), 1)
  assert.equal(animated.mesh.geometry, g1)
  assert.equal(advanceNodeGeometries(nodes, 1), 0)
  assert.equal(advanceNodeGeometries(nodes, 2), 1)
  assert.equal(animated.mesh.geometry, g2)
})
