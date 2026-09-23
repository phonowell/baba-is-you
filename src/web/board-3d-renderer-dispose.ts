import type {
  CanvasTexture,
  Group,
  PlaneGeometry,
  WebGLRenderer,
} from 'three'
import type { EffectComposer } from 'postprocessing'

import { disposeGroundVisuals } from './board-3d-ground.js'
import { disposeToonGradientMap } from './board-3d-textures.js'

import type { GroundVisuals } from './board-3d-ground.js'
import type { EntityNode } from './board-3d-node-types.js'

type DisposeBoard3dRendererResourcesArgs = {
  nodes: Map<number, EntityNode>
  entityGroup: Group
  shadowGeometry: PlaneGeometry
  disposeMaterials: () => void
  disposeBatches?: () => void
  shadowTexture: CanvasTexture
  world: Group
  groundVisuals: GroundVisuals
  composer: EffectComposer
  renderer: WebGLRenderer
  skyTexture: CanvasTexture
}

export const disposeBoard3dRendererResources = (
  args: DisposeBoard3dRendererResourcesArgs,
): GroundVisuals => {
  const {
    nodes,
    entityGroup,
    shadowGeometry,
    disposeMaterials,
    disposeBatches,
    shadowTexture,
    world,
    groundVisuals,
    composer,
    renderer,
    skyTexture,
  } = args

  for (const node of nodes.values()) {
    node.cardSlot?.release()
    node.shadowSlot?.release()
    if (node.outlineAnchor?.parent) entityGroup.remove(node.outlineAnchor)
    node.shadowMaterial.dispose()
  }
  nodes.clear()
  disposeBatches?.()

  shadowGeometry.dispose()
  disposeMaterials()
  shadowTexture.dispose()

  const nextGroundVisuals = disposeGroundVisuals(world, groundVisuals)

  // pmndrs EffectComposer.dispose cascades to every pass, the shared depth
  // target and both frame buffers — no manual per-pass release needed.
  composer.dispose()
  skyTexture.dispose()
  disposeToonGradientMap()
  renderer.dispose()
  renderer.domElement.remove()

  return nextGroundVisuals
}
