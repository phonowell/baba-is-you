import { SPRITE_GRID_SIZE } from './derive.js'

import type { PixelFrame, PixelSprite } from './types.js'

// Eight-neighbour mask around a tile cell: edge contacts drive shore bands
// and path arms; diagonal contacts only carve the concave inner corners of
// region edges (an open diagonal pinches the shoreline inward).
export const TILE_EDGE_N = 1
export const TILE_EDGE_E = 2
export const TILE_EDGE_S = 4
export const TILE_EDGE_W = 8
export const TILE_DIAG_NE = 0x10
export const TILE_DIAG_SE = 0x20
export const TILE_DIAG_SW = 0x40
export const TILE_DIAG_NW = 0x80
export const TILE_MASK_FULL = 0xff

const SIZE = SPRITE_GRID_SIZE

// Which neighbouring cells a tile joins visually. Region tiles only join
// their own kind — a shoreline must face lava, ground or emptiness — while
// map `line` paths also run into level icons and door gates.
const LINE_CONNECTORS: ReadonlySet<string> = new Set(['line', 'level', 'door'])

export const autotileJoins = (name: string, neighbor: string): boolean =>
  name === 'line' ? LINE_CONNECTORS.has(neighbor) : neighbor === name

// Region edge art, in palette keys: `rim` is the boundary band hugging the
// cell edge, `line` an accent band just inside it, and `wavy` lets the
// deepest band scallop one pixel deeper on a 6px period (the period divides
// the tile, so a long shoreline keeps one continuous wave across cells).
// `cornerRadius` is the silhouette arc carved where two open edges meet —
// the rounded look comes from cutting the fill, not just banding it.
type TileEdgeStyle = {
  rim: string
  rimDepth: number
  line?: string
  lineDepth?: number
  wavy?: boolean
  cornerRadius: number
}

const EDGE_STYLES: Record<string, TileEdgeStyle> = {
  water: { rim: 'd', rimDepth: 2, line: 'l', lineDepth: 2, wavy: true, cornerRadius: 8 },
  lava: { rim: 'd', rimDepth: 2, wavy: true, cornerRadius: 8 },
}
const TILE_BEVEL: TileEdgeStyle = { rim: 'd', rimDepth: 1, line: 'l', lineDepth: 1, cornerRadius: 4 }

const edgeStyleForName = (name: string): TileEdgeStyle | undefined =>
  EDGE_STYLES[name] ??
  (name === 'tile' || name.startsWith('tile_') ? TILE_BEVEL : undefined)

export const autotileAppliesTo = (name: string): boolean =>
  name === 'line' || edgeStyleForName(name) !== undefined

const toGrid = (frame: PixelFrame): string[][] => {
  const grid = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill('.'))
  for (let y = 0; y < frame.length && y < SIZE; y++) {
    const row = frame[y] ?? ''
    for (let x = 0; x < row.length && x < SIZE; x++) grid[y]![x] = row[x] ?? '.'
  }
  return grid
}

const toFrame = (grid: string[][]): PixelFrame => grid.map((row) => row.join(''))

const waveBump = (t: number): boolean => Math.floor(t / 3) % 2 === 0

// Each side writes `depth` rows inward from the cell edge at run position t.
const SIDES = [
  { bit: TILE_EDGE_N, set: (g: string[][], t: number, d: number, c: string) => { g[d]![t] = c } },
  { bit: TILE_EDGE_S, set: (g: string[][], t: number, d: number, c: string) => { g[SIZE - 1 - d]![t] = c } },
  { bit: TILE_EDGE_W, set: (g: string[][], t: number, d: number, c: string) => { g[t]![d] = c } },
  { bit: TILE_EDGE_E, set: (g: string[][], t: number, d: number, c: string) => { g[t]![SIZE - 1 - d] = c } },
] as const

const CORNERS = [
  { edges: TILE_EDGE_N | TILE_EDGE_W, diag: TILE_DIAG_NW, cx: 0, cy: 0 },
  { edges: TILE_EDGE_N | TILE_EDGE_E, diag: TILE_DIAG_NE, cx: SIZE - 1, cy: 0 },
  { edges: TILE_EDGE_S | TILE_EDGE_W, diag: TILE_DIAG_SW, cx: 0, cy: SIZE - 1 },
  { edges: TILE_EDGE_S | TILE_EDGE_E, diag: TILE_DIAG_SE, cx: SIZE - 1, cy: SIZE - 1 },
] as const

// Convex corner where the region ends: carve the fill outside a quarter
// arc of `cornerRadius` inset from the cell corner — pixels set to '.'
// emit no voxel, so the silhouette itself rounds instead of only rebanding
// a square corner. Rim and accent bands wrap the arc in the same order as
// straight edges: rim nearest the boundary, accent inside it.
const paintConvexCorner = (
  grid: string[][],
  corner: (typeof CORNERS)[number],
  style: TileEdgeStyle,
): void => {
  const radius = style.cornerRadius
  const rimStart = radius - style.rimDepth
  const lineStart = rimStart - (style.line ? style.lineDepth ?? 0 : 0)
  for (let v = 0; v < radius; v++) {
    for (let u = 0; u < radius; u++) {
      const r = Math.hypot(u - radius, v - radius)
      const x = corner.cx === 0 ? u : SIZE - 1 - u
      const y = corner.cy === 0 ? v : SIZE - 1 - v
      if (r > radius) grid[y]![x] = '.'
      else if (r >= rimStart) grid[y]![x] = style.rim
      else if (style.line && r >= lineStart) grid[y]![x] = style.line
    }
  }
}

// Concave notch where a missing diagonal pinches the boundary: carve a
// small quarter disc of `rimDepth` at the corner — only as deep as the
// neighbours' rim band, so their rim keeps hugging the new boundary — then
// wrap it in rim and accent rings.
const paintNotchCorner = (
  grid: string[][],
  corner: (typeof CORNERS)[number],
  style: TileEdgeStyle,
): void => {
  const carveEnd = style.rimDepth
  const rimEnd = carveEnd + style.rimDepth
  const lineEnd = rimEnd + (style.line ? style.lineDepth ?? 0 : 0)
  for (let v = 0; v < lineEnd; v++) {
    for (let u = 0; u < lineEnd; u++) {
      const r = Math.hypot(u, v)
      if (r >= lineEnd) continue
      const x = corner.cx === 0 ? u : SIZE - 1 - u
      const y = corner.cy === 0 ? v : SIZE - 1 - v
      if (r < carveEnd) grid[y]![x] = '.'
      else if (r < rimEnd) grid[y]![x] = style.rim
      else if (style.line) grid[y]![x] = style.line
    }
  }
}

const applyTileEdges = (
  frame: PixelFrame,
  style: TileEdgeStyle,
  mask: number,
): PixelFrame => {
  const grid = toGrid(frame)
  const accent = style.line ?? style.rim
  const lineEnd = style.rimDepth + (style.line ? (style.lineDepth ?? 0) : 0)
  for (const side of SIDES) {
    if (mask & side.bit) continue
    for (let t = 0; t < SIZE; t++) {
      for (let d = 0; d < lineEnd; d++) {
        side.set(grid, t, d, d < style.rimDepth ? style.rim : accent)
      }
      if (style.wavy && waveBump(t)) side.set(grid, t, lineEnd, accent)
    }
  }
  for (const corner of CORNERS) {
    const bothOpen = (mask & corner.edges) === 0
    const innerNotch =
      (mask & corner.edges) === corner.edges && (mask & corner.diag) === 0
    if (bothOpen) paintConvexCorner(grid, corner, style)
    else if (innerNotch) paintNotchCorner(grid, corner, style)
  }
  return toFrame(grid)
}

const PATH_MIN = 8
const PATH_MAX = 15

// One `line` cell's path piece: a centre hub plus an arm per joined side,
// arms reaching the cell edge so neighbours continue the stroke. Convex
// outer corners (both adjacent sides open) take a small chamfer — path ends
// and outer bends read rounded instead of squared off.
const linePathFrame = (mask: number): PixelFrame => {
  const filled = new Set<number>()
  const fillRect = (x0: number, x1: number, y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) filled.add(y * SIZE + x)
    }
  }
  fillRect(PATH_MIN, PATH_MAX, PATH_MIN, PATH_MAX)
  if (mask & TILE_EDGE_N) fillRect(PATH_MIN, PATH_MAX, 0, PATH_MIN)
  if (mask & TILE_EDGE_S) fillRect(PATH_MIN, PATH_MAX, PATH_MAX, SIZE - 1)
  if (mask & TILE_EDGE_W) fillRect(0, PATH_MIN, PATH_MIN, PATH_MAX)
  if (mask & TILE_EDGE_E) fillRect(PATH_MAX, SIZE - 1, PATH_MIN, PATH_MAX)
  const chamfers = [
    { open: TILE_EDGE_N | TILE_EDGE_W, px: [[8, 8], [9, 8], [8, 9]] },
    { open: TILE_EDGE_N | TILE_EDGE_E, px: [[15, 8], [14, 8], [15, 9]] },
    { open: TILE_EDGE_S | TILE_EDGE_W, px: [[8, 15], [8, 14], [9, 15]] },
    { open: TILE_EDGE_S | TILE_EDGE_E, px: [[15, 15], [15, 14], [14, 15]] },
  ] as const
  for (const chamfer of chamfers) {
    if ((mask & chamfer.open) !== 0) continue
    for (const [x, y] of chamfer.px) filled.delete(y * SIZE + x)
  }
  // Cells outside the grid count as filled on joined sides — path arms
  // continue into the neighbour, so the shared edge must not grow an
  // outline seam.
  const solid = (x: number, y: number): boolean => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) return filled.has(y * SIZE + x)
    if (y < 0) return (mask & TILE_EDGE_N) !== 0
    if (y >= SIZE) return (mask & TILE_EDGE_S) !== 0
    if (x < 0) return (mask & TILE_EDGE_W) !== 0
    return (mask & TILE_EDGE_E) !== 0
  }
  const dark = new Set<number>()
  for (const key of filled) {
    const x = key % SIZE
    const y = Math.floor(key / SIZE)
    if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
      dark.add(key)
    }
  }
  const darkAt = (x: number, y: number): boolean =>
    x >= 0 && x < SIZE && y >= 0 && y < SIZE && dark.has(y * SIZE + x)
  const rows: string[] = []
  for (let y = 0; y < SIZE; y++) {
    let row = ''
    for (let x = 0; x < SIZE; x++) {
      const key = y * SIZE + x
      if (!filled.has(key)) row += '.'
      else if (dark.has(key)) row += 'd'
      // Top-left bevel: fill pixels tucked behind a rim pixel pick up the
      // light accent, matching the rest of the sprite set's shading.
      else row += darkAt(x, y - 1) || darkAt(x - 1, y) ? 'l' : 'w'
    }
    rows.push(row)
  }
  return rows
}

// Returns a mask-specific sprite variant for autotiled ground tiles, or the
// sprite unchanged when the name carries no edge art (belts keep their
// self-contained tile). Region tiles get shore/bevel bands on open edges;
// `line` is rebuilt wholesale as a path piece shaped by the mask.
export const autotileSprite = (
  sprite: PixelSprite,
  name: string,
  mask: number,
): PixelSprite => {
  if (name === 'line') {
    const frame = linePathFrame(mask)
    // Three identical frames: the path stays static — wobble padding would
    // shift the stroke vertically and break joints with neighbours.
    return { palette: sprite.palette, frames: [frame, frame, frame] }
  }
  const style = edgeStyleForName(name)
  if (!style || mask === TILE_MASK_FULL) return sprite
  const frames = sprite.frames.map((frame) => applyTileEdges(frame, style, mask))
  // Repeat the last frame up to three: single-frame tiles must not fall back
  // to wobble padding — the vertical shift would misalign neighbouring tiles.
  while (frames.length < 3) frames.push(frames[frames.length - 1] ?? [])
  return {
    palette: sprite.palette,
    frames,
    ...(sprite.volumes ? { volumes: sprite.volumes } : {}),
  }
}
