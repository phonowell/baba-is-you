import assert from 'node:assert/strict'
import test from 'node:test'

import { advanceNodeGeometries } from '../board-3d-renderer-materials.js'
import { voxelDrawRect, voxelVertexSoup } from './voxel.js'

import type { PixelFrame } from './types.js'
import type { VoxelBuildOptions } from './voxel.js'

const SHADE = { front: 1, top: 1.2, side: 0.7, bottom: 0.5, back: 0.35 }

const options = (overrides: Partial<VoxelBuildOptions> = {}): VoxelBuildOptions => ({
  drawX: -0.5,
  drawY: 0.5,
  texel: 1 / 24,
  depth: 0.2,
  shade: SHADE,
  ...overrides,
})

const quadCount = (soup: { indices: number[] }): number => soup.indices.length / 6

const singleCell: PixelFrame = ['a']
const block2x2: PixelFrame = ['aa', 'aa']
const ring3x3: PixelFrame = ['aaa', 'a.a', 'aaa']

const PALETTE = { a: '#808080' }

test('voxel soup emits front, back and boundary-only side faces', () => {
  const single = voxelVertexSoup({ frame: singleCell, palette: PALETTE }, options())
  // front + back + 4 sides
  assert.equal(quadCount(single), 6)

  const block = voxelVertexSoup({ frame: block2x2, palette: PALETTE }, options())
  // 4 front + 4 back + 8 perimeter edges (interior edges culled)
  assert.equal(quadCount(block), 16)
})

test('voxel soup keeps holes open through a hollow ring', () => {
  const depth = 0.2
  const soup = voxelVertexSoup(
    { frame: ring3x3, palette: PALETTE },
    options({ drawX: 0, drawY: 0, texel: 1 }),
  )
  // 8 cells: 8 front + 8 back + 12 outer + 4 inner edges
  assert.equal(quadCount(soup), 32)
  // The hole cell is grid (1,1): world x in [1,2], y in [-2,-1]. No back-face
  // vertex may sit strictly inside that rect, or the hole would be plugged.
  const zBack = -depth / 2
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
  const soup = voxelVertexSoup({ frame: singleCell, palette: PALETTE }, options())
  const colorAt = (vertexIx: number): number => soup.colors[vertexIx * 3]!
  // Palette hex is decoded sRGB -> linear before shading is multiplied in.
  const base = ((128 / 255 + 0.055) / 1.055) ** 2.4
  // First emitted quad is the front face (shade 1.0).
  assert.ok(Math.abs(colorAt(0) - base) < 1e-6)
  // Find a top-face vertex: normal +y.
  const topIx = soup.normals.findIndex((n, i) => i % 3 === 1 && n === 1) / 3
  assert.ok(Math.abs(colorAt(topIx) - base * 1.2) < 1e-6)
})

test('voxel overlay layer emits relief in front of the slab', () => {
  const arrowFrame: PixelFrame = ['aa', 'aa']
  const soup = voxelVertexSoup(
    {
      frame: singleCell,
      palette: PALETTE,
      overlays: [{ frame: arrowFrame, palette: { a: '#ffffff' }, dx: 4, dy: 4, lift: 0.05 }],
    },
    options({ depth: 0.2 }),
  )
  // sprite: 6 quads; overlay 2x2 block: 4 front + 8 perimeter (no back)
  assert.equal(quadCount(soup), 18)
  const maxZ = Math.max(...soup.positions.filter((_, i) => i % 3 === 2))
  assert.ok(Math.abs(maxZ - (0.2 / 2 + 0.05)) < 1e-6)
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
