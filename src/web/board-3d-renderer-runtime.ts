import type { Camera, Group, WebGLRenderer } from 'three'
import type { EffectComposer } from 'postprocessing'

import { rebuildGroundVisuals } from './board-3d-ground.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { SPRITE_FRAME_COUNT } from './pixel-sprites/derive.js'
import { applyNodePose } from './board-3d-node-pose.js'
import {
  removeEntityNode,
  syncEntityNodes,
} from './board-3d-node-sync.js'
import type { Board3dRendererViewController } from './board-3d-renderer-view.js'

import type { GameState, Item } from '../logic/types.js'
import type { GroundVisuals } from './board-3d-ground.js'
import type { EntityVisual } from './board-3d-renderer-materials.js'
import type {
  EntityNode,
  PoseStepResult,
  SyncEntityNodesDeps,
} from './board-3d-node-types.js'

const { SPRITE_FRAME_MS } = BOARD3D_ANIMATION_CONFIG

type RequestFrame = (callback: FrameRequestCallback) => number
type CancelFrame = (handle: number) => void
type ScheduleTimer = (callback: () => void, ms: number) => number
type CancelTimer = (handle: number) => void

type CreateBoard3dRendererRuntimeArgs = {
  renderer: WebGLRenderer
  composer: EffectComposer
  world: Group
  entityGroup: Group
  viewController: Board3dRendererViewController
  nodes: Map<number, EntityNode>
  getVisual: (item: Item, overridden?: boolean) => EntityVisual
  createNode: (item: Item, nowMs: number) => EntityNode
  camera: Camera
  disposeResources: (groundVisuals: GroundVisuals) => GroundVisuals
  rebuildGround?: (
    world: Group,
    boardWidth: number,
    boardHeight: number,
    visuals: GroundVisuals,
  ) => GroundVisuals
  applyNodePoseStep?: (
    node: EntityNode,
    nowMs: number,
    camera: Camera,
  ) => PoseStepResult
  syncNodes?: (state: GameState, deps: SyncEntityNodesDeps) => void
  requestFrame?: RequestFrame | null
  cancelFrame?: CancelFrame | null
  advanceSpriteFrames?: (frameIx: number) => number
  scheduleTimer?: ScheduleTimer | null
  cancelTimer?: CancelTimer | null
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
    getVisual,
    createNode,
    camera,
    disposeResources,
    rebuildGround = rebuildGroundVisuals,
    applyNodePoseStep = applyNodePose,
    syncNodes = syncEntityNodes,
    requestFrame = null,
    cancelFrame = null,
    advanceSpriteFrames = null,
    scheduleTimer = null,
    cancelTimer = null,
  } = args

  const scheduleFrame: RequestFrame =
    requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis)
  const unscheduleFrame: CancelFrame =
    cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis)
  const scheduleSpriteTimer: ScheduleTimer =
    scheduleTimer ?? globalThis.setInterval.bind(globalThis)
  const cancelSpriteTimer: CancelTimer =
    cancelTimer ?? globalThis.clearInterval.bind(globalThis)

  let container: HTMLElement | null = null
  let boardWidth = 0
  let boardHeight = 0
  let groundVisuals: GroundVisuals = {
    groundMesh: null,
    playAreaFillMesh: null,
    playAreaOutline: null,
    cellGrid: null,
  }
  let rafId = 0
  let frameActive = false
  let needsRender = true
  let disposed = false
  let spriteTimerId: number | null = null
  let lastSpriteFrameIx = -1

  const tick = (nowMs: number): void => {
    frameActive = false
    if (disposed) {
      rafId = 0
      return
    }
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
      const step = applyNodePoseStep(node, nowMs, camera)
      if (step.animating) hasAnimation = true
      if (step.finishedLeaving) leavingDoneIds.push(id)
    }

    for (const id of leavingDoneIds) {
      removeEntityNode(nodes, entityGroup, id)
    }

    const nodesRemoved = leavingDoneIds.length > 0

    if (needsRender || viewportChanged || hasAnimation || nodesRemoved) {
      composer.render()
      needsRender = false
    }

    if (hasAnimation && container.isConnected) {
      frameActive = true
      rafId = scheduleFrame(tick)
    }
  }

  const ensureFrame = (): void => {
    if (disposed || frameActive || !container || !container.isConnected) return
    frameActive = true
    rafId = scheduleFrame(tick)
  }

  // Idle sprite wobble runs on a slow interval rather than the RAF loop:
  // frames swap ~3x/sec and only schedule a render when a texture changed.
  const onSpriteTimer = (): void => {
    if (disposed || !advanceSpriteFrames) return
    if (!container || !container.isConnected) return
    const frameIx =
      Math.floor(performance.now() / SPRITE_FRAME_MS) % SPRITE_FRAME_COUNT
    if (frameIx === lastSpriteFrameIx) return
    if (advanceSpriteFrames(frameIx) > 0 || lastSpriteFrameIx < 0) {
      lastSpriteFrameIx = frameIx
      needsRender = true
      ensureFrame()
    }
  }

  const startSpriteTimer = (): void => {
    if (!advanceSpriteFrames || spriteTimerId !== null || disposed) return
    spriteTimerId = scheduleSpriteTimer(onSpriteTimer, SPRITE_FRAME_MS)
  }

  const stopSpriteTimer = (): void => {
    if (spriteTimerId === null) return
    cancelSpriteTimer(spriteTimerId)
    spriteTimerId = null
  }

  const mount = (nextContainer: HTMLElement): void => {
    if (disposed) return
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
    startSpriteTimer()
    ensureFrame()
  }

  const unmount = (): void => {
    if (rafId) unscheduleFrame(rafId)
    frameActive = false
    rafId = 0
    needsRender = true
    stopSpriteTimer()

    if (!container) return

    container.classList.remove('board-3d')
    if (container.dataset.clayPreset === 'single') {
      delete container.dataset.clayPreset
    }
    if (renderer.domElement.parentElement === container) renderer.domElement.remove()
    container = null
  }

  const sync = (state: GameState): void => {
    if (disposed) return
    if (!container || !container.isConnected) return

    if (boardWidth !== state.width || boardHeight !== state.height) {
      boardWidth = state.width
      boardHeight = state.height
      groundVisuals = rebuildGround(world, boardWidth, boardHeight, groundVisuals)
      viewController.updateCamera(container, boardWidth, boardHeight)
    }

    viewController.applyReadabilityGuard(state)
    syncNodes(state, {
      nodes,
      getVisual,
      createNode,
      camera,
    })
    needsRender = true
    ensureFrame()
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unmount()
    groundVisuals = disposeResources(groundVisuals)
    container = null
  }

  return {
    mount,
    sync,
    unmount,
    dispose,
  }
}
