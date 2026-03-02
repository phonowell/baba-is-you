import type { Group, WebGLRenderer } from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'

import { rebuildGroundVisuals } from './board-3d-ground.js'
import {
  type CardMaterial,
  type EntityNode,
  applyNodePose,
  removeEntityNode,
  syncEntityNodes,
} from './board-3d-nodes.js'
import type { Board3dRendererViewController } from './board-3d-renderer-view.js'

import type { GameState, Item } from '../logic/types.js'
import type { GroundVisuals } from './board-3d-ground.js'

type CreateBoard3dRendererRuntimeArgs = {
  renderer: WebGLRenderer
  composer: EffectComposer
  world: Group
  entityGroup: Group
  viewController: Board3dRendererViewController
  nodes: Map<number, EntityNode>
  getMaterial: (item: Item) => CardMaterial
  createNode: (item: Item, nowMs: number) => EntityNode
  disposeResources: (groundVisuals: GroundVisuals) => void
}

export type Board3dRendererRuntime = {
  mount: (container: HTMLElement) => void
  sync: (state: GameState) => void
  unmount: () => void
  dispose: () => void
}

export const createBoard3dRendererRuntime = (
  args: CreateBoard3dRendererRuntimeArgs,
): Board3dRendererRuntime => {
  const {
    renderer,
    composer,
    world,
    entityGroup,
    viewController,
    nodes,
    getMaterial,
    createNode,
    disposeResources,
  } = args

  let container: HTMLElement | null = null
  let boardWidth = 0
  let boardHeight = 0
  let groundVisuals: GroundVisuals = {
    groundMesh: null,
    playAreaFillMesh: null,
    playAreaOutline: null,
  }
  let rafId = 0
  let frameActive = false
  let needsRender = true

  const tick = (nowMs: number): void => {
    frameActive = false
    if (!container || !container.isConnected) {
      if (container && !container.isConnected) container = null
      rafId = 0
      return
    }

    const viewportChanged = viewController.updateViewport(
      container,
      boardWidth,
      boardHeight,
    )
    let hasAnimation = false
    const leavingDoneIds: number[] = []

    for (const [id, node] of nodes) {
      const step = applyNodePose(node, nowMs)
      if (step.animating) hasAnimation = true
      if (step.finishedLeaving) leavingDoneIds.push(id)
    }

    for (const id of leavingDoneIds) {
      removeEntityNode(nodes, entityGroup, id)
    }

    if (needsRender || viewportChanged || hasAnimation) {
      composer.render()
      needsRender = false
    }

    if (hasAnimation && container.isConnected) {
      frameActive = true
      rafId = window.requestAnimationFrame(tick)
    }
  }

  const ensureFrame = (): void => {
    if (frameActive || !container || !container.isConnected) return
    frameActive = true
    rafId = window.requestAnimationFrame(tick)
  }

  const mount = (nextContainer: HTMLElement): void => {
    if (container && container !== nextContainer) {
      container.classList.remove('board-3d')
      if (container.dataset.clayPreset === 'single') {
        delete container.dataset.clayPreset
      }
    }

    container = nextContainer
    container.classList.add('board-3d')
    container.dataset.clayPreset = 'single'

    if (renderer.domElement.parentElement !== container) {
      container.textContent = ''
      container.appendChild(renderer.domElement)
    }

    if (viewController.updateViewport(container, boardWidth, boardHeight)) {
      needsRender = true
    }
    ensureFrame()
  }

  const unmount = (): void => {
    if (rafId) window.cancelAnimationFrame(rafId)
    frameActive = false
    rafId = 0
    needsRender = true

    if (!container) return

    container.classList.remove('board-3d')
    if (container.dataset.clayPreset === 'single') {
      delete container.dataset.clayPreset
    }
    if (renderer.domElement.parentElement === container) renderer.domElement.remove()
    container = null
  }

  const sync = (state: GameState): void => {
    if (!container || !container.isConnected) return

    if (boardWidth !== state.width || boardHeight !== state.height) {
      boardWidth = state.width
      boardHeight = state.height
      groundVisuals = rebuildGroundVisuals(world, boardWidth, boardHeight, groundVisuals)
      viewController.updateCamera(container, boardWidth, boardHeight)
    }

    viewController.applyReadabilityGuard(state)
    syncEntityNodes(state, {
      nodes,
      getMaterial,
      createNode,
    })
    needsRender = true
    ensureFrame()
  }

  const dispose = (): void => {
    unmount()
    disposeResources(groundVisuals)
    container = null
  }

  return {
    mount,
    sync,
    unmount,
    dispose,
  }
}
