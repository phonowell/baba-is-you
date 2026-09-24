import assert from 'node:assert/strict'
import test from 'node:test'

import { MeshBasicMaterial } from 'three'

import {
  createPlateAtlas,
  patchPlateFrontUv,
  patchPlateWallTint,
} from './board-3d-plate-atlas.js'
import { BOARD3D_CARD_TEXTURE_CONFIG } from './board-3d-config-textures.js'

import type { PlateAtlasCanvas } from './board-3d-plate-atlas.js'

const { CARD_TEXTURE_SIZE } = BOARD3D_CARD_TEXTURE_CONFIG
// 2048² packs 8×8 cells; growth opens eight more rows at a 16-column
// stride, so the 4096² ceiling holds 64 + 8·16 = 192 specs.
const CELLS_PER_ATLAS = (2048 / CARD_TEXTURE_SIZE) ** 2
const CELLS_PER_MAX =
  CELLS_PER_ATLAS + (4096 / CARD_TEXTURE_SIZE - 2048 / CARD_TEXTURE_SIZE) * (4096 / CARD_TEXTURE_SIZE)

// A paint-recording stand-in for the DOM canvas: drawImage calls are the
// whole observable surface the atlas relies on.
const stubCanvases = () => {
  const paints: Array<{ source: unknown; x: number; y: number }> = []
  const createCanvas = (size: number): PlateAtlasCanvas => ({
    width: size,
    height: size,
    getContext: () => ({
      drawImage: (source: CanvasImageSource, x: number, y: number) => {
        paints.push({ source, x, y })
      },
    }),
  })
  return { paints, createCanvas }
}

const atlas = () => {
  const { paints, createCanvas } = stubCanvases()
  return { atlas: createPlateAtlas({ anisotropy: 1, createCanvas }), paints }
}

const source = (tag: string) => ({ tag }) as unknown as CanvasImageSource

test('plate atlas registers each spec into a fresh cell, idempotent per key', () => {
  const { atlas: a, paints } = atlas()

  assert.deepEqual([...a.register('baba', source('a')) ?? []], [0, 0])
  assert.deepEqual(
    [...(a.register('is', source('b')) ?? [])],
    [CARD_TEXTURE_SIZE, 0],
  )
  assert.deepEqual([...(a.register('baba', source('a')) ?? [])], [0, 0])
  assert.equal(paints.length, 2)
  // Cell 1 lands one card-width to the right of cell 0.
  assert.equal(paints[0]?.x, 0)
  assert.equal(paints[0]?.y, 0)
  assert.equal(paints[1]?.x, CARD_TEXTURE_SIZE)
  assert.equal(paints[1]?.y, 0)
})

test('plate atlas grows to 4096 in place and repaints old cells', () => {
  const { atlas: a, paints } = atlas()
  for (let i = 0; i < CELLS_PER_ATLAS; i += 1) {
    assert.notEqual(a.register(`spec-${i}`, source(`s${i}`)), null)
  }
  const paintsBeforeGrow = paints.length
  assert.equal(a.sizeUniform.value, 2048)

  // The next registration overflows the 2048² grid → grow, not fail, and
  // the wider stride starts it at the top-left of the new bottom region.
  const grown = a.register('overflow', source('o'))
  assert.deepEqual([...(grown ?? [])], [0, 2048])
  assert.equal(a.sizeUniform.value, 4096)
  // Growth repaints every existing cell so the resized canvas keeps them.
  assert.equal(paints.length, paintsBeforeGrow + CELLS_PER_ATLAS + 1)
  // Cell origins never move: old keys resolve to the same texels.
  assert.deepEqual([...(a.register('spec-0', source('x')) ?? [])], [0, 0])
})

test('plate atlas returns null once the 4096² grid is full', () => {
  const { atlas: a } = atlas()
  for (let i = 0; i < CELLS_PER_MAX; i += 1) {
    assert.notEqual(a.register(`spec-${i}`, source(`s${i}`)), null)
  }
  assert.equal(a.register('one-too-many', source('x')), null)
})

test('plate front shader remaps uv through the instance cell attribute', () => {
  const material = new MeshBasicMaterial()
  const sizeUniform = { value: 2048 }
  patchPlateFrontUv(material, sizeUniform, 'plate-front')
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <uv_vertex>',
    fragmentShader: '#include <common>',
  }
  material.onBeforeCompile(shader as never, {} as never)
  assert.equal(shader.uniforms.uAtlasSize, sizeUniform)
  assert.ok(shader.vertexShader.includes('attribute vec2 aCell'))
  assert.ok(shader.vertexShader.includes('uniform float uAtlasSize'))
  assert.ok(shader.vertexShader.includes('vMapUv = (aCell + vec2'))
})

test('plate wall shader multiplies the vertex shade by the instance tint', () => {
  const material = new MeshBasicMaterial()
  patchPlateWallTint(material, 'plate-wall')
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>',
  }
  material.onBeforeCompile(shader as never, {} as never)
  assert.ok(shader.vertexShader.includes('attribute vec3 aTint'))
  assert.ok(shader.fragmentShader.includes('varying vec3 vTint'))
  assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= vTint'))
})
