import type {
  CanvasTexture,
  Group,
  PlaneGeometry,
  WebGLRenderer,
} from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'

import { disposeGroundVisuals } from './board-3d-ground.js'

import type { GroundVisuals } from './board-3d-ground.js'
import type { EntityNode } from './board-3d-node-types.js'

type DisposeBoard3dRendererResourcesArgs = {
  nodes: Map<number, EntityNode>
  entityGroup: Group
  cardGeometry: PlaneGeometry
  shadowGeometry: PlaneGeometry
  disposeMaterials: () => void
  shadowTexture: CanvasTexture
  world: Group
  groundVisuals: GroundVisuals
  composer: EffectComposer
  renderer: WebGLRenderer
}

export const disposeBoard3dRendererResources = (
  args: DisposeBoard3dRendererResourcesArgs,
): GroundVisuals => {
  const {
    nodes,
    entityGroup,
    cardGeometry,
    shadowGeometry,
    disposeMaterials,
    shadowTexture,
    world,
    groundVisuals,
    composer,
    renderer,
  } = args

  for (const node of nodes.values()) {
    entityGroup.remove(node.mesh)
    entityGroup.remove(node.shadow)
    node.shadowMaterial.dispose()
  }
  nodes.clear()

  cardGeometry.dispose()
  shadowGeometry.dispose()
  disposeMaterials()
  shadowTexture.dispose()

  const nextGroundVisuals = disposeGroundVisuals(world, groundVisuals)

  composer.dispose()
  renderer.dispose()
  renderer.domElement.remove()

  return nextGroundVisuals
}
