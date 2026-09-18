import { PlaneGeometry } from 'three'

import { CLAY_PRESET } from './clay-config.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { updateLightShadowCamera } from './board-3d-ground.js'
import {
  advanceNodeGeometries,
  createBoard3dRendererMaterialStore,
} from './board-3d-renderer-materials.js'
import { disposeBoard3dRendererResources } from './board-3d-renderer-dispose.js'
import { createBoard3dRendererScene } from './board-3d-renderer-scene.js'
import { createBoard3dRendererViewController } from './board-3d-renderer-view.js'
import { createShadowTexture } from './board-3d-textures.js'
import {
  createEntityNode,
} from './board-3d-node-create.js'
import type {
  CreateEntityNodeDeps,
  EntityNode,
} from './board-3d-node-types.js'
import type { EntityVisual } from './board-3d-renderer-materials.js'

import type { Item } from '../logic/types.js'
const { TEXTURE_ANISOTROPY_CAP } = BOARD3D_LAYOUT_CONFIG
const { SHADOW_GEOMETRY_SIZE } = BOARD3D_SHADOW_CONFIG

export type Board3dRendererFactoryDeps = ReturnType<
  typeof createBoard3dRendererFactoryDeps
>

export const createBoard3dRendererFactoryDeps = () => {
  const preset = CLAY_PRESET
  const scene = createBoard3dRendererScene(preset)
  const {
    camera,
    renderer,
    composer,
    bloomPass,
    bokehPass,
    leftLight,
    rightLight,
    world,
    entityGroup,
  } = scene

  const shadowGeometry = new PlaneGeometry(
    SHADOW_GEOMETRY_SIZE,
    SHADOW_GEOMETRY_SIZE,
  )
  const nodes = new Map<number, EntityNode>()
  const shadowTexture = createShadowTexture()
  const textureAnisotropy = Math.min(
    TEXTURE_ANISOTROPY_CAP,
    renderer.capabilities.getMaxAnisotropy(),
  )
  const materialStore = createBoard3dRendererMaterialStore({
    preset,
    textureAnisotropy,
  })

  const getVisual = (item: Item, overridden?: boolean): EntityVisual =>
    materialStore.getVisual(item, overridden)

  const createNodeDeps: CreateEntityNodeDeps = {
    entityGroup,
    shadowGeometry,
    shadowTexture,
    getVisual,
  }

  return {
    renderer,
    composer,
    world,
    entityGroup,
    nodes,
    getVisual,
    createNode: (item: Item, nowMs: number): EntityNode =>
      createEntityNode(createNodeDeps, item, nowMs),
    camera,
    // Sprite animation advances along two paths: textured faces swap material
    // maps, voxel meshes swap geometries. The runtime only needs the count.
    advanceSpriteFrames: (frameIx: number): number =>
      materialStore.advanceSpriteFrames(frameIx) +
      advanceNodeGeometries(nodes, frameIx),
    viewController: createBoard3dRendererViewController({
      preset,
      camera,
      renderer,
      composer,
      bloomPass,
      bokehPass,
      leftLight,
      rightLight,
      updateLightShadowCamera,
    }),
    disposeResources: (groundVisuals: Parameters<
      typeof disposeBoard3dRendererResources
    >[0]['groundVisuals']) =>
      disposeBoard3dRendererResources({
        nodes,
        entityGroup,
        shadowGeometry,
        disposeMaterials: materialStore.dispose,
        shadowTexture,
        world,
        groundVisuals,
        composer,
        renderer,
      }),
  }
}
