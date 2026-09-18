import assert from 'node:assert/strict'
import test from 'node:test'

import { advanceFrameMaps, createBoard3dRendererMaterialStore } from './board-3d-renderer-materials.js'
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
  assert.equal(visual.geometry, visual.frameGeometries[0])
  assert.equal(Array.isArray(visual.material), false)

  const again = store.getVisual(objectItem('baba', { props: ['you'] }))
  assert.equal(again.geometry, visual.geometry)
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
