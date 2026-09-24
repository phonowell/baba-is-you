import assert from 'node:assert/strict'
import test from 'node:test'

import { BackSide, MeshToonMaterial } from 'three'

import { advanceFrameMaps, createBoard3dRendererMaterialStore } from './board-3d-renderer-materials.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import { CLAY_PRESET } from './clay-config.js'

import type { Item } from '../logic/types.js'

const createStore = () =>
  createBoard3dRendererMaterialStore({ preset: CLAY_PRESET, textureAnisotropy: 1 })

const objectItem = (name: string, extra: Partial<Item> = {}): Item => ({
  id: 1,
  name,
  x: 0,
  y: 0,
  isText: false,
  props: [],
  ...extra,
})

test('getVisual builds animated voxel visuals for sprite items', () => {
  const store = createStore()
  const visual = store.getVisual(objectItem('baba', { props: ['you'] }))

  assert.equal(visual.key.startsWith('vox:object:baba'), true)
  assert.equal(visual.frameGeometries.length, 3)
  // Multi-frame specs draw through one merged geometry tagged aFrameIx —
  // the batch selects the frame per instance, so it is not frame 0's own.
  assert.notEqual(visual.geometry, visual.frameGeometries[0])
  assert.notEqual(visual.geometry.getAttribute('aFrameIx'), undefined)
  assert.equal(Array.isArray(visual.material), false)

  const again = store.getVisual(objectItem('baba', { props: ['you'] }))
  assert.equal(again.geometry, visual.geometry)
  store.dispose()
})

test('entity visuals use cel-banded toon materials', () => {
  const store = createStore()
  const voxel = store.getVisual(objectItem('baba', { props: ['you'] }))
  const voxelMaterial = voxel.material as MeshToonMaterial

  assert.equal(voxelMaterial instanceof MeshToonMaterial, true)
  assert.equal(voxelMaterial.gradientMap !== null, true)

  store.dispose()
})

test('getVisual keys belt geometry per direction', () => {
  const store = createStore()
  const right = store.getVisual(objectItem('belt', { dir: 'right' }))
  const down = store.getVisual(objectItem('belt', { dir: 'down' }))

  assert.notEqual(right.key, down.key)
  assert.notEqual(right.geometry, down.geometry)
  store.dispose()
})

test('getVisual lays ground-hug tiles on the ground plane, not at card height', () => {
  const store = createStore()
  const flats = ['water', 'lava', 'tile', 'line'].map((name) =>
    store.getVisual(objectItem(name)),
  )
  // A facing belt must not poke direction-arrow relief past the ground
  // plane — the rotated sprite art already carries the direction.
  const belt = store.getVisual(objectItem('belt', { dir: 'right' }))
  const upright = store.getVisual(objectItem('wall'))

  for (const visual of [...flats, belt, upright]) {
    visual.geometry.computeBoundingBox()
  }
  // The slab's top face is the frame plane's front z; ground tiles hug the
  // ground instead of floating where upright cards put their face.
  const maxZ = (visual: { geometry: { boundingBox: { max: { z: number } } | null } }) =>
    visual.geometry.boundingBox?.max.z ?? -Infinity
  for (const visual of [...flats, belt]) {
    assert.equal(visual.facingYaw, undefined)
    assert.ok(
      Math.abs(maxZ(visual) - BOARD3D_VOXEL_CONFIG.VOXEL_GROUND_HUG_FRAME_Z) <
        1e-6,
    )
  }
  assert.ok(Math.abs(maxZ(upright) - BOARD3D_VOXEL_CONFIG.VOXEL_FRAME_Z) < 1e-6)
  store.dispose()
})

test('getVisual reuses one entity visual per item signature', () => {
  const store = createStore()
  const first = store.getVisual(objectItem('baba', { id: 1, props: ['you'] }))
  const sameSignature = store.getVisual(
    objectItem('baba', { id: 2, x: 5, y: 7, props: ['you'] }),
  )
  assert.equal(sameSignature, first)

  const otherFacing = store.getVisual(objectItem('baba', { id: 3, props: [] }))
  assert.notEqual(otherFacing, first)

  const otherDir = store.getVisual(
    objectItem('baba', { id: 4, dir: 'left', props: ['you'] }),
  )
  assert.notEqual(otherDir, first)
  store.dispose()
})

test('visuals carry a back-side rim shell tinted the card colour inverse', () => {
  const store = createStore()
  const visual = store.getVisual(objectItem('baba', { id: 1, props: ['you'] }))
  // BackSide + inflation is what makes the shell render as a rim; the tint
  // is the card palette's sRGB negative — baba's leading white inverts to
  // black, and the pulse breathes between the two on the shared wave.
  assert.equal(visual.outlineMaterial.side, BackSide)
  assert.equal(visual.outlineMaterial.fog, false)
  assert.equal(visual.outlineTint.base.getHex(), 0xffffff)
  assert.equal(visual.outlineTint.inverse.getHex(), 0x000000)
  assert.equal(visual.outlineMaterial.color.getHex(), 0x000000)

  // A different spec gets its own rim material — rim colours are card
  // colours, not one shared hue.
  const other = store.getVisual(objectItem('rock', { id: 2, props: [] }))
  assert.notEqual(other.outlineMaterial, visual.outlineMaterial)
  store.dispose()
})

test('advanceFrameMaps swaps material maps through the frame cycle', () => {
  const frames = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const material = { map: frames[0] as unknown }
  const animated = new Map([[material, frames]])

  assert.equal(advanceFrameMaps(animated, 0), 0)
  assert.equal(material.map, frames[0])

  assert.equal(advanceFrameMaps(animated, 1), 1)
  assert.equal(material.map, frames[1])

  assert.equal(advanceFrameMaps(animated, 1), 0)
  assert.equal(material.map, frames[1])

  assert.equal(advanceFrameMaps(animated, 4), 0)
  assert.equal(material.map, frames[1])

  assert.equal(advanceFrameMaps(animated, 5), 1)
  assert.equal(material.map, frames[2])
})

test('advanceFrameMaps only touches animated materials', () => {
  const still = { map: { id: 'still' } as unknown }
  const animated = new Map<typeof still, { id: string }[]>()
  assert.equal(advanceFrameMaps(animated, 2), 0)
})
