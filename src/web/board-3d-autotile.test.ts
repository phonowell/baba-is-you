import assert from 'node:assert/strict'
import test from 'node:test'

import { autotileMaskForItem, buildAutotileCells } from './board-3d-autotile.js'
import {
  cardSpecForItem,
  fxColorsForSpec,
  idleFrameOffsetForItem,
} from './board-3d-shared-item.js'
import { createBoard3dRendererMaterialStore } from './board-3d-renderer-materials.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import { CLAY_PRESET } from './clay-config.js'
import {
  TILE_DIAG_NE,
  TILE_DIAG_NW,
  TILE_DIAG_SE,
  TILE_DIAG_SW,
  TILE_EDGE_E,
  TILE_EDGE_N,
  TILE_EDGE_S,
  TILE_EDGE_W,
  TILE_MASK_FULL,
  autotileSprite,
} from './pixel-sprites/autotile.js'
import { spriteForName } from './pixel-sprites/index.js'

import type { GameState, Item } from '../logic/types.js'
import type { PixelFrame } from './pixel-sprites/types.js'

let nextId = 1
const item = (name: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({
  id: nextId++,
  name,
  x,
  y,
  isText: false,
  props: [],
  ...extra,
})

const stateFor = (items: Item[]): GameState => ({
  levelIndex: 0,
  title: 'test',
  width: 33,
  height: 18,
  items,
  rules: [],
  status: 'playing',
  turn: 0,
})

const cellAt = (frame: PixelFrame, x: number, y: number): string =>
  frame[y]?.[x] ?? '.'

const lineFrame = (mask: number): PixelFrame => {
  const sprite = spriteForName('line')
  assert.ok(sprite)
  return autotileSprite(sprite, 'line', mask).frames[0]!
}

test('line path joins neighbours into a continuous stroke, no seam outlines', () => {
  const straight = lineFrame(TILE_EDGE_E | TILE_EDGE_W)
  // Arms reach both cell edges and the shared edge is fill, not an outline
  // seam — two adjacent pieces must read as one unbroken stroke.
  assert.equal(cellAt(straight, 0, 10), 'w')
  assert.equal(cellAt(straight, 23, 10), 'w')
  assert.equal(cellAt(straight, 0, 8), 'd')
  assert.equal(cellAt(straight, 12, 8), 'd')
  assert.equal(cellAt(straight, 12, 15), 'd')
  assert.equal(cellAt(straight, 12, 0), '.')

  const corner = lineFrame(TILE_EDGE_N | TILE_EDGE_E)
  assert.notEqual(cellAt(corner, 10, 4), '.')
  assert.notEqual(cellAt(corner, 20, 11), '.')
  assert.equal(cellAt(corner, 4, 11), '.')
  assert.equal(cellAt(corner, 11, 20), '.')
  // Outer bend takes a chamfer; the inner bend stays a sharp concave notch.
  assert.equal(cellAt(corner, 8, 15), '.')
  assert.notEqual(cellAt(corner, 15, 8), '.')
})

test('line endpoints and isolated cells read as rounded caps', () => {
  const end = lineFrame(TILE_EDGE_E)
  assert.equal(cellAt(end, 8, 8), '.')
  assert.equal(cellAt(end, 8, 15), '.')
  assert.notEqual(cellAt(end, 8, 11), '.')
  assert.equal(cellAt(end, 8, 7), '.')

  const dot = lineFrame(0)
  for (const [x, y] of [[8, 8], [15, 8], [8, 15], [15, 15]]) {
    assert.equal(cellAt(dot, x!, y!), '.')
  }
  assert.notEqual(cellAt(dot, 11, 11), '.')
  assert.equal(cellAt(dot, 0, 11), '.')

  // A cross junction has no exposed corners to round.
  const cross = lineFrame(TILE_EDGE_N | TILE_EDGE_E | TILE_EDGE_S | TILE_EDGE_W)
  assert.notEqual(cellAt(cross, 8, 8), '.')
})

test('line path frames are static — wobble padding would break joints', () => {
  const sprite = spriteForName('line')
  assert.ok(sprite)
  const variant = autotileSprite(sprite, 'line', TILE_EDGE_E | TILE_EDGE_W)
  assert.equal(variant.frames.length, 3)
  assert.equal(variant.frames[0], variant.frames[1])
  assert.equal(variant.frames[1], variant.frames[2])
})

test('water draws shoreline bands only on edges without joined neighbours', () => {
  const sprite = spriteForName('water')
  assert.ok(sprite)
  const base = sprite.frames[0]!

  const island = autotileSprite(sprite, 'water', 0).frames[0]!
  // Mid-edge: rim band then accent band; corners carve a quarter-arc of
  // empty pixels so the silhouette itself rounds.
  assert.equal(cellAt(island, 12, 0), 'd')
  assert.equal(cellAt(island, 12, 1), 'd')
  assert.equal(cellAt(island, 12, 2), 'l')
  assert.equal(cellAt(island, 12, 3), 'l')
  assert.equal(cellAt(island, 0, 0), '.')
  assert.equal(cellAt(island, 7, 0), '.')
  assert.equal(cellAt(island, 8, 0), 'd')
  assert.equal(cellAt(island, 23, 0), '.')
  assert.equal(cellAt(island, 2, 2), '.')
  assert.equal(cellAt(island, 3, 3), 'd')
  assert.equal(cellAt(island, 4, 4), 'l')
  // Scalloped wave crests poke one pixel deeper on a 6px period — including
  // into the corner run, so the wave reads continuously around the bend.
  assert.equal(cellAt(island, 6, 19), 'l')
  assert.equal(cellAt(island, 9, 19), 'b')
  assert.equal(cellAt(island, 4, 6), 'l')
  assert.equal(cellAt(island, 4, 9), 'b')

  // A joined north edge keeps the authored surface mid-run; open edges
  // still shore, and their end corners round off the same way.
  const northJoined = autotileSprite(sprite, 'water', TILE_EDGE_N).frames[0]!
  assert.equal(cellAt(northJoined, 12, 0), cellAt(base, 12, 0))
  assert.equal(cellAt(northJoined, 12, 23), 'd')
  assert.equal(cellAt(northJoined, 0, 23), '.')
  assert.equal(cellAt(northJoined, 8, 23), 'd')
  assert.equal(cellAt(northJoined, 0, 0), 'd')

  // Fully surrounded cells are the base sprite untouched.
  const interior = autotileSprite(sprite, 'water', TILE_MASK_FULL)
  assert.equal(interior, sprite)
})

test('water inner corners notch the shoreline around open diagonals', () => {
  const sprite = spriteForName('water')
  assert.ok(sprite)
  const mask =
    TILE_EDGE_N | TILE_EDGE_E | TILE_EDGE_S | TILE_EDGE_W |
    TILE_DIAG_NE | TILE_DIAG_SE | TILE_DIAG_SW
  const frame = autotileSprite(sprite, 'water', mask).frames[0]!
  // NW diagonal is open while N and W join — the concave notch carves a
  // small bite at the corner and wraps it in rim then accent rings.
  assert.equal(cellAt(frame, 0, 0), '.')
  assert.equal(cellAt(frame, 1, 0), '.')
  assert.equal(cellAt(frame, 2, 0), 'd')
  assert.equal(cellAt(frame, 3, 0), 'd')
  assert.equal(cellAt(frame, 4, 0), 'l')
  assert.equal(cellAt(frame, 0, 1), '.')
  assert.equal(cellAt(frame, 1, 1), '.')
})

test('tile bevels open edges without touching joined ones', () => {
  const sprite = spriteForName('tile')
  assert.ok(sprite)
  const frame = autotileSprite(sprite, 'tile', TILE_EDGE_N).frames[0]!
  // Mid-edge rim+accent on the open south; the joined north keeps authored
  // pixels while the open west/east bands own the top corners. The bottom
  // corners between open south and west/east round off with a small arc.
  assert.equal(cellAt(frame, 12, 23), 'd')
  assert.equal(cellAt(frame, 12, 22), 'l')
  assert.equal(cellAt(frame, 1, 23), '.')
  assert.equal(cellAt(frame, 3, 23), '.')
  assert.equal(cellAt(frame, 4, 23), 'd')
  assert.equal(cellAt(frame, 12, 0), cellAt(sprite.frames[0]!, 12, 0))
  assert.equal(cellAt(frame, 0, 0), 'd')
  assert.equal(cellAt(frame, 1, 0), 'l')
})

test('autotileMaskForItem joins lines to icons and doors, regions to kin', () => {
  const state = stateFor([
    item('line', 5, 5),
    item('level', 6, 5),
    item('door', 5, 6),
    item('water', 10, 10),
    item('water', 11, 10),
    item('lava', 10, 11),
    item('wall', 10, 9),
    item('belt', 20, 20),
    item('belt', 21, 20),
  ])
  const cells = buildAutotileCells(state)
  const mask = (x: number, y: number) =>
    autotileMaskForItem(
      state.items.find((entry) => entry.x === x && entry.y === y)!,
      cells,
      state.width,
      state.height,
    )

  assert.equal(mask(5, 5), TILE_EDGE_E | TILE_EDGE_S)
  // Water joins only its own kind — lava, walls and icons are all shore.
  assert.equal(mask(10, 10), TILE_EDGE_E)
  // Belts are not autotiled: same-name neighbours leave the mask at 0.
  assert.equal(mask(20, 20), 0)
})

test('autotileMaskForItem records open diagonals for inner corners', () => {
  const state = stateFor([
    item('water', 5, 5),
    item('water', 5, 4),
    item('water', 4, 5),
    item('water', 6, 4),
  ])
  const cells = buildAutotileCells(state)
  const mask = autotileMaskForItem(state.items[0]!, cells, state.width, state.height)
  assert.equal(mask & TILE_EDGE_N, TILE_EDGE_N)
  assert.equal(mask & TILE_EDGE_W, TILE_EDGE_W)
  assert.equal(mask & TILE_DIAG_NE, TILE_DIAG_NE)
  assert.equal(mask & TILE_DIAG_NW, 0)
})

test('ground-hug tiles share the global frame so seams stay aligned', () => {
  for (const name of ['water', 'lava', 'tile', 'line']) {
    assert.equal(idleFrameOffsetForItem(item(name, 0, 0)), 0)
  }
  const baba = idleFrameOffsetForItem(item('baba', 0, 0))
  assert.equal(Number.isInteger(baba), true)
  assert.equal(baba >= 0 && baba < 3, true)
})

test('getVisual keys tile variants by mask and keeps sparse art grid-anchored', () => {
  const store = createBoard3dRendererMaterialStore({
    preset: CLAY_PRESET,
    textureAnisotropy: 1,
  })
  const water = item('water', 0, 0)
  const island = store.getVisual(water, false, 0)
  const joined = store.getVisual(water, false, TILE_EDGE_N)
  assert.notEqual(island.key, joined.key)
  assert.notEqual(island.geometry, joined.geometry)
  assert.equal(store.getVisual(water, false, 0), island)

  // An isolated path dot occupies its authored 8x24ths of the cell —
  // content-bounds rescaling would inflate it to the full tile.
  const dot = store.getVisual(item('line', 0, 0), false, 0)
  dot.geometry.computeBoundingBox()
  const box = dot.geometry.boundingBox!
  const width = box.max.x - box.min.x
  assert.ok(Math.abs(width - 8 / 24) < 1e-6, `dot width ${width}`)
  assert.ok(Math.abs((box.max.x + box.min.x) / 2) < 1e-6)

  // Autotiled water still hugs the ground plane.
  island.geometry.computeBoundingBox()
  assert.ok(
    Math.abs(
      (island.geometry.boundingBox?.max.z ?? -Infinity) -
        BOARD3D_VOXEL_CONFIG.VOXEL_GROUND_HUG_FRAME_Z,
    ) < 1e-6,
  )
  store.dispose()
})

test('getVisual carries spec-derived fx colors for particle bursts', () => {
  const store = createBoard3dRendererMaterialStore({
    preset: CLAY_PRESET,
    textureAnisotropy: 1,
  })
  const spec = (item: Item, overridden = false) =>
    cardSpecForItem(item, CLAY_PRESET.readability.minContrastRatio, overridden)

  // The visual carries exactly the spec-derived burst colours — the same
  // derivation the removed per-item fxColorsForItem performed at sync time.
  const water = item('water', 0, 0)
  assert.deepEqual(
    store.getVisual(water, false, 0).fxColors,
    fxColorsForSpec(spec(water)),
  )

  // Sprite cards burst in their pixel palette (deduped, capped at 4);
  // text plates burst in their plate colours, and the strike-out palette
  // follows `overridden`.
  const palette = new Set(Object.values(spec(water).sprite!.palette))
  const waterColors = fxColorsForSpec(spec(water))
  assert.ok(waterColors.length > 0 && waterColors.length <= 4)
  assert.ok(waterColors.every((color) => palette.has(color)))

  const text = item('baba', 0, 0, { isText: true })
  for (const overridden of [false, true]) {
    const textSpec = spec(text, overridden)
    assert.deepEqual(fxColorsForSpec(textSpec), [
      textSpec.background,
      textSpec.textColor,
      textSpec.outlineColor,
    ])
  }
  store.dispose()
})
