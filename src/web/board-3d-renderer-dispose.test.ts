import assert from 'node:assert/strict'
import test from 'node:test'

import { Group } from 'three'

import { disposeBoard3dRendererResources } from './board-3d-renderer-dispose.js'

import type {
  CanvasTexture,
  PlaneGeometry,
  WebGLRenderer,
} from 'three'
import type { EntityNode } from './board-3d-node-types.js'

test('dispose releases the composer and the sky texture', () => {
  const disposed: string[] = []
  const composer = {
    dispose: () => {
      disposed.push('composer')
    },
  } as unknown as Parameters<
    typeof disposeBoard3dRendererResources
  >[0]['composer']
  const skyTexture = {
    dispose: () => {
      disposed.push('sky')
    },
  } as unknown as CanvasTexture
  const renderer = {
    dispose: () => {
      disposed.push('renderer')
    },
    domElement: { remove: () => undefined },
  } as unknown as WebGLRenderer

  const nextGround = disposeBoard3dRendererResources({
    nodes: new Map<number, EntityNode>(),
    entityGroup: new Group(),
    shadowGeometry: { dispose: () => undefined } as PlaneGeometry,
    disposeMaterials: () => undefined,
    shadowTexture: { dispose: () => undefined } as CanvasTexture,
    world: new Group(),
    groundVisuals: {
      groundMesh: null,
      playAreaFillMesh: null,
      playAreaOutline: null,
      cellGrid: null,
    },
    composer,
    renderer,
    skyTexture,
  })

  assert.deepEqual(disposed, [
    'composer',
    'sky',
    'renderer',
  ])
  assert.equal(nextGround.groundMesh, null)
})
