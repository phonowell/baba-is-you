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
    shadowTexture,
    world,
    groundVisuals,
    composer,
    renderer,
    skyTexture,
  } = args

  for (const node of nodes.values()) {
    entityGroup.remove(node.mesh)
    entityGroup.remove(node.shadow)
    node.shadowMaterial.dispose()
  }
  nodes.clear()

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
