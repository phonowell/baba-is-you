import {
  PlaneGeometry,
} from 'three'

import { CLAY_PRESET } from './clay-config.js'
import {
  BOARD3D_LAYOUT_CONFIG,
  BOARD3D_SHADOW_CONFIG,
} from './board-3d-config.js'
import { createShadowTexture } from './board-3d-textures.js'
import {
  updateLightShadowCamera,
} from './board-3d-ground.js'
import { disposeBoard3dRendererResources } from './board-3d-renderer-dispose.js'
import { createBoard3dRendererMaterialStore } from './board-3d-renderer-materials.js'
import { createBoard3dRendererScene } from './board-3d-renderer-scene.js'
import { createBoard3dRendererViewController } from './board-3d-renderer-view.js'
import {
  type CreateEntityNodeDeps,
  type EntityNode,
  createEntityNode,
} from './board-3d-nodes.js'
import { createBoard3dRendererRuntime } from './board-3d-renderer-runtime.js'

import type { GameState, Item } from '../logic/types.js'

type Board3dRenderer = {
  mount: (container: HTMLElement) => void
  sync: (state: GameState) => void
  unmount: () => void
  dispose: () => void
}

const {
  CARD_WORLD_SIZE,
  TEXTURE_ANISOTROPY_CAP,
} = BOARD3D_LAYOUT_CONFIG

const {
  SHADOW_GEOMETRY_SIZE,
} = BOARD3D_SHADOW_CONFIG

const createBoard3dRendererUnsafe = (): Board3dRenderer => {
  const preset = CLAY_PRESET
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
  } = createBoard3dRendererScene(preset)

  const cardGeometry = new PlaneGeometry(CARD_WORLD_SIZE, CARD_WORLD_SIZE)
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

  const getMaterial = (item: Item) => materialStore.getMaterial(item)

  const createNodeDeps: CreateEntityNodeDeps = {
    entityGroup,
    cardGeometry,
    shadowGeometry,
    shadowTexture,
    getMaterial,
  }
  const createNode = (item: Item, nowMs: number): EntityNode =>
    createEntityNode(createNodeDeps, item, nowMs)

  const viewController = createBoard3dRendererViewController({
    preset,
    camera,
    renderer,
    composer,
    bloomPass,
    bokehPass,
    leftLight,
    rightLight,
    updateLightShadowCamera,
  })

  return createBoard3dRendererRuntime({
    renderer,
    composer,
    world,
    entityGroup,
    viewController,
    nodes,
    getMaterial,
    createNode,
    disposeResources: (groundVisuals) => {
      disposeBoard3dRendererResources({
        nodes,
        entityGroup,
        cardGeometry,
        shadowGeometry,
        disposeMaterials: materialStore.dispose,
        shadowTexture,
        world,
        groundVisuals,
        composer,
        renderer,
      })
    },
  })
}

export const createBoard3dRenderer = (): Board3dRenderer =>
  createBoard3dRendererUnsafe()
