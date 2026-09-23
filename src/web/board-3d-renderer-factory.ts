import { Group, PlaneGeometry } from 'three'

import { CLAY_PRESET } from './clay-config.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { createBoard3dEffects } from './board-3d-effects.js'
import { updateLightShadowCamera } from './board-3d-ground.js'
import { createBoardHoverVisual } from './board-3d-hover.js'
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
    fog,
    bloomEffect,
    hueSaturationEffect,
    vignetteEffect,
    leftLight,
    rightLight,
    world,
    entityGroup,
    skyTexture,
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

  const getVisual = (item: Item, overridden?: boolean, tileMask?: number): EntityVisual =>
    materialStore.getVisual(item, overridden, tileMask)

  const createNodeDeps: CreateEntityNodeDeps = {
    entityGroup,
    shadowGeometry,
    shadowTexture,
    getVisual,
  }

  const viewController = createBoard3dRendererViewController({
    preset,
    camera,
    fog,
    renderer,
    composer,
    bloomEffect,
    hueSaturationEffect,
    vignetteEffect,
    leftLight,
    rightLight,
    updateLightShadowCamera,
  })

  // Pixel-particle effects layer lives in board space beside the cards.
  const fxGroup = new Group()
  world.add(fxGroup)
  const effects = createBoard3dEffects({
    parent: fxGroup,
    camera,
    setMood: viewController.setFxMood,
  })

  return {
    renderer,
    composer,
    world,
    entityGroup,
    nodes,
    getVisual,
    createNode: (item: Item, nowMs: number, spawnDelayMs?: number, tileMask?: number): EntityNode =>
      createEntityNode(createNodeDeps, item, nowMs, spawnDelayMs, tileMask),
    effects,
    hover: createBoardHoverVisual(world),
    camera,
    // Sprite animation advances along two paths: textured faces swap material
    // maps, voxel meshes swap geometries. The control-layer rim pulses on the
    // same idle tick. The runtime only needs the count.
    advanceSpriteFrames: (frameIx: number): number =>
      materialStore.advanceSpriteFrames(frameIx) +
      advanceNodeGeometries(nodes, frameIx) +
      materialStore.advanceYouOutline(nodes, performance.now()),
    viewController,
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
        skyTexture,
      }),
  }
}
