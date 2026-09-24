import { Group, InstancedMesh, Matrix4, Mesh, PlaneGeometry } from 'three'
import type { Object3D } from 'three'

import { CLAY_PRESET } from './clay-config.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { createBoard3dEffects } from './board-3d-effects.js'
import { updateLightShadowCamera } from './board-3d-ground.js'
import { createBoardHoverVisual } from './board-3d-hover.js'
import {
  createEntityBatches,
  createShadowBatch,
} from './board-3d-node-batches.js'
import {
  advanceNodeGeometries,
  createBoard3dRendererMaterialStore,
} from './board-3d-renderer-materials.js'
import { disposeBoard3dRendererResources } from './board-3d-renderer-dispose.js'
import { createBoard3dRendererScene } from './board-3d-renderer-scene.js'
import { createBoard3dRendererViewController } from './board-3d-renderer-view.js'
import { createBoard3dQuality } from './board-3d-quality.js'
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
    aoPass,
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

  const getVisual = (
    item: Item,
    overridden?: boolean,
    tileMask?: number,
    active?: boolean,
  ): EntityVisual =>
    materialStore.getVisual(item, overridden, tileMask, active)

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

  // Instanced draw layer: cards batch by spec, blob shadows draw as one.
  const cardBatches = createEntityBatches(entityGroup)
  const shadowBatch = createShadowBatch(
    entityGroup,
    shadowGeometry,
    shadowTexture,
  )

  // Adaptive quality ladder: sustained sub-budget frame pacing (measured
  // across consecutive animating ticks inside the runtime) steps the
  // pixel-ratio ceiling and AO samples down one tier at a time. Capable
  // devices never trip the EMA and keep the authored preset.
  const quality = createBoard3dQuality({
    setPixelRatioCap: viewController.setPixelRatioCap,
    setAoSamples: (samples) => {
      aoPass.configuration.aoSamples = samples
    },
    setMsaa: (samples) => {
      composer.multisampling = samples
    },
  })

  return {
    renderer,
    composer,
    world,
    entityGroup,
    nodes,
    getVisual,
    createNode: (
      item: Item,
      nowMs: number,
      spawnDelayMs?: number,
      tileMask?: number,
      overridden?: boolean,
      active?: boolean,
    ): EntityNode =>
      createEntityNode(
        createNodeDeps,
        item,
        nowMs,
        spawnDelayMs,
        tileMask,
        overridden,
        active,
      ),
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
    syncBatches: (
      nodes: ReadonlyMap<number, EntityNode>,
      dirty: ReadonlySet<EntityNode> | null,
    ): boolean => {
      const changed = cardBatches.flush(nodes, dirty)
      shadowBatch.flush(nodes, dirty)
      return changed
    },
    quality,
    // Shader warm-up stand-ins: one instance per material family a board
    // frame can hit — voxel toon, textured plate lid + vertex-colored
    // walls, card outlines, blob shadow, particles — so the postfx chain
    // and every card program compile during a menu-idle render instead of
    // inside the first visible board frame. Zero-scale matrices keep them
    // rasterization-free; shared geometry/materials stay in the caches.
    prewarmScene: (render: () => void): void => {
      const zeroScale = new Matrix4().makeScale(0, 0, 0)
      const standIns: Object3D[] = []
      const addCard = (item: Item): void => {
        const visual = getVisual(item)
        const mesh = new InstancedMesh(visual.geometry, visual.material, 1)
        mesh.setMatrixAt(0, zeroScale)
        mesh.instanceMatrix.needsUpdate = true
        mesh.castShadow = true
        mesh.frustumCulled = false
        if (!item.isText) {
          // Merged-frame batches shadow through a patched depth material —
          // a different program than the default depth path the plate
          // stand-in exercises — so warm it on the voxel stand-in too.
          mesh.customDepthMaterial = cardBatches.frameDepthMaterial
        }
        const outline = new Mesh(visual.geometry, visual.outlineMaterial)
        outline.frustumCulled = false
        standIns.push(mesh, outline)
      }
      addCard({ id: -1, name: 'baba', x: 0, y: 0, isText: false, dir: 'down', props: [] })
      addCard({ id: -2, name: 'baba', x: 0, y: 0, isText: true, props: [] })
      entityGroup.add(...standIns)
      // The live batch meshes carry the patched materials — bump their
      // count so a zeroed instance rasterizes once and compiles the
      // program; skip any that already draw real content.
      const warmed: InstancedMesh[] = []
      for (const mesh of [shadowBatch.warmupMesh, effects.warmupMesh]) {
        if (mesh.count === 0) {
          mesh.count = 1
          warmed.push(mesh)
        }
      }
      try {
        render()
      } finally {
        for (const mesh of warmed) mesh.count = 0
        entityGroup.remove(...standIns)
      }
    },
    viewController,
    disposeResources: (groundVisuals: Parameters<
      typeof disposeBoard3dRendererResources
    >[0]['groundVisuals']) =>
      disposeBoard3dRendererResources({
        nodes,
        entityGroup,
        shadowGeometry,
        disposeMaterials: materialStore.dispose,
        disposeBatches: () => {
          cardBatches.dispose()
          shadowBatch.dispose()
        },
        shadowTexture,
        world,
        groundVisuals,
        composer,
        renderer,
        skyTexture,
      }),
  }
}
