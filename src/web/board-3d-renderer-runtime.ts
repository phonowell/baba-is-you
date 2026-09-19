import type { Camera, Group, WebGLRenderer } from 'three'
import type { EffectComposer } from 'postprocessing'

import { rebuildGroundVisuals } from './board-3d-ground.js'
import { cardFacingForParent } from './board-3d-card-facing.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'
import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { SPRITE_FRAME_COUNT } from './pixel-sprites/derive.js'
import { applyNodePose, nodeYawAnimating } from './board-3d-node-pose.js'
import {
  removeEntityNode,
  syncEntityNodes,
} from './board-3d-node-sync.js'
import type { Board3dRendererViewController } from './board-3d-renderer-view.js'

import type { GameState, GameStatus, Item } from '../logic/types.js'
import type { Board3dEffects, BoardFxSpot } from './board-3d-effects.js'
import type { CardFacing } from './board-3d-card-facing.js'
import type { GroundVisuals } from './board-3d-ground.js'
import type { EntityVisual } from './board-3d-renderer-materials.js'
import type {
  EntityNode,
  NodePulseKind,
  PoseStepResult,
  SyncEntityNodesDeps,
} from './board-3d-node-types.js'

const { SPRITE_FRAME_MS, IDLE_TICK_MS } = BOARD3D_ANIMATION_CONFIG

const { CARD_BASE_Z } = BOARD3D_LAYOUT_CONFIG

const {
  LOSE_ASH_MAX_SPOTS,
  PULSE_RIPPLE_MS_PER_CELL,
  PULSE_RIPPLE_MAX_MS,
} = BOARD3D_EFFECTS_CONFIG

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
  getVisual: (item: Item, overridden?: boolean, tileMask?: number) => EntityVisual
  createNode: (item: Item, nowMs: number, spawnDelayMs?: number, tileMask?: number) => EntityNode
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
    facing?: CardFacing,
  ) => PoseStepResult
  syncNodes?: (state: GameState, deps: SyncEntityNodesDeps) => void
  // Pixel-particle + postfx mood layer; optional so tests can run headless.
  effects?: Board3dEffects | null
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
    effects = null,
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
    cellGrid: null,
  }
  let rafId = 0
  let frameActive = false
  let needsRender = true
  let disposed = false
  let spriteTimerId: number | null = null
  let lastSpriteFrameIx = -1
  let lastSyncedState: GameState | null = null
  // Game status the board effects currently reflect — transitions in sync
  // fire the win/lose bursts, pulses and postfx mood.
  let fxStatus: GameStatus = 'playing'

  // Spots the win fountain bursts from: the you/win cards' live positions.
  const celebrationSpots = (state: GameState): BoardFxSpot[] => {
    const spots: BoardFxSpot[] = []
    for (const item of state.items) {
      if (item.props.includes('hide')) continue
      if (!item.props.includes('you') && !item.props.includes('win')) continue
      const node = nodes.get(item.id)
      if (!node) continue
      spots.push({ x: node.toX, y: node.toY, z: node.toBaseZ })
    }
    if (spots.length === 0) spots.push({ x: 0, y: 0, z: CARD_BASE_Z })
    return spots
  }

  // Ash motes rise off a spread of the surviving cards on defeat.
  const ashSpots = (): BoardFxSpot[] => {
    const alive: EntityNode[] = []
    for (const node of nodes.values()) {
      if (node.despawnStartMs === null) alive.push(node)
    }
    const stride = Math.max(1, Math.ceil(alive.length / LOSE_ASH_MAX_SPOTS))
    const spots: BoardFxSpot[] = []
    for (let i = 0; i < alive.length && spots.length < LOSE_ASH_MAX_SPOTS; i += stride) {
      const node = alive[i]
      if (!node) continue
      spots.push({ x: node.toX, y: node.toY, z: node.toBaseZ })
    }
    if (spots.length === 0) spots.push({ x: 0, y: 0, z: CARD_BASE_Z })
    return spots
  }

  // Whole-board wave: each card's pulse starts when the ripple reaches it.
  const startPulseRipple = (
    kind: NodePulseKind,
    originSpots: readonly BoardFxSpot[],
    nowMs: number,
  ): void => {
    let originX = 0
    let originY = 0
    for (const spot of originSpots) {
      originX += spot.x
      originY += spot.y
    }
    if (originSpots.length > 0) {
      originX /= originSpots.length
      originY /= originSpots.length
    }
    for (const node of nodes.values()) {
      if (node.despawnStartMs !== null) continue
      const delay = Math.min(
        PULSE_RIPPLE_MAX_MS,
        Math.hypot(node.toX - originX, node.toY - originY) *
          PULSE_RIPPLE_MS_PER_CELL,
      )
      node.pulseStartMs = nowMs + delay
      node.pulseKind = kind
    }
  }

  const playStatusFx = (state: GameState, nowMs: number): void => {
    if (!effects || state.status === fxStatus) return
    fxStatus = state.status
    if (state.status === 'win') {
      const spots = celebrationSpots(state)
      startPulseRipple('hop', spots, nowMs)
      effects.playWin(spots)
    } else if (state.status === 'lose') {
      const spots = ashSpots()
      startPulseRipple('slump', spots, nowMs)
      effects.playLose(spots)
    } else {
      effects.neutralMood()
    }
  }

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
    // One camera-facing basis serves every card this frame — the pose step
    // receives it lazily so an all-volume board never pays for it.
    let cardFacing: CardFacing | undefined

    for (const [id, node] of nodes) {
      // Settled nodes re-pose only when the camera moved (billboard cards
      // track it); idle-motion cards keep their micro-motion ticking while
      // the frame loop is alive anyway. Everything else is identical writes.
      const settled =
        !node.moving &&
        !nodeYawAnimating(node, nowMs) &&
        node.landStartMs === null &&
        node.spawnStartMs === null &&
        node.despawnStartMs === null &&
        node.pulseStartMs === null
      if (settled && !node.idleStretch && !node.idleFloat && !viewportChanged) continue
      const step = applyNodePoseStep(
        node,
        nowMs,
        camera,
        (cardFacing ??= cardFacingForParent(camera, entityGroup)),
      )
      if (step.animating) hasAnimation = true
      if (step.finishedLeaving) leavingDoneIds.push(id)

      // Particle bursts fire once per transition, at the moment the node's
      // own animation starts (board-entry spawns may be staggered).
      if (effects) {
        if (
          node.spawnStartMs !== null &&
          !node.spawnFxDone &&
          nowMs >= node.spawnStartMs
        ) {
          node.spawnFxDone = true
          effects.spawnPuff(node.toX, node.toY, node.toBaseZ, node.fxColors)
        }
        if (node.despawnStartMs !== null && !node.despawnFxDone) {
          node.despawnFxDone = true
          effects.despawnPoof(node.toX, node.toY, node.toBaseZ, node.fxColors)
        }
      }
    }

    for (const id of leavingDoneIds) {
      removeEntityNode(nodes, entityGroup, id)
    }

    const nodesRemoved = leavingDoneIds.length > 0

    // Particles and the mood timeline keep the frame loop alive on their own.
    if (effects?.update(nowMs)) hasAnimation = true

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

  // Idle motion runs on a slow timer rather than the RAF loop: sprite
  // frames dedupe to the SPRITE_FRAME_MS tick, idle-motion cards re-pose
  // every fire, and a render is scheduled only when something changed.
  const onSpriteTimer = (): void => {
    if (disposed || !advanceSpriteFrames) return
    if (!container || !container.isConnected) return
    // Background tabs throttle RAF away but keep intervals at ~1Hz — skip
    // the scan entirely; the next visible fire re-derives the frame index
    // from the clock, so nothing visually falls behind.
    if (container.ownerDocument?.hidden) return
    // Idle-motion cards (text stretch, float bob) ride the same slow clock:
    // a board with no animated sprites still needs them re-posed at this
    // cadence. The check must run before the frame dedupe — their sine needs
    // a few samples per cycle, and the sprite frame window is coarser than
    // this timer, so gating on it would collapse them into a two-pose flip.
    let idleMotionPending = false
    for (const node of nodes.values()) {
      if (node.idleStretch || node.idleFloat) {
        idleMotionPending = true
        break
      }
    }
    const frameIx =
      Math.floor(performance.now() / SPRITE_FRAME_MS) % SPRITE_FRAME_COUNT
    if (frameIx === lastSpriteFrameIx && !idleMotionPending) return
    // Re-advancing an unchanged index is idempotent, so the frame swap can
    // safely share a fire that only exists for idle re-poses.
    const framesChanged = advanceSpriteFrames(frameIx)
    if (framesChanged > 0 || idleMotionPending || lastSpriteFrameIx < 0) {
      lastSpriteFrameIx = frameIx
      needsRender = true
      ensureFrame()
    }
  }

  const startSpriteTimer = (): void => {
    if (!advanceSpriteFrames || spriteTimerId !== null || disposed) return
    spriteTimerId = scheduleSpriteTimer(
      onSpriteTimer,
      Math.min(SPRITE_FRAME_MS, IDLE_TICK_MS),
    )
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
    effects?.clear()
    // A remount re-syncs the same state object only through the idempotent
    // path, so resetting here keeps a stored win/lose ready to replay.
    fxStatus = 'playing'

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
    // Sync is idempotent for an unchanged state: re-running it would redo the
    // whole pass byte-for-byte (and would even reset in-flight despawns into
    // respawns). Nothing else mutates nodes, so identical input can be
    // skipped outright. Nodes survive unmount/mount, so the flag does too.
    if (state === lastSyncedState) return
    lastSyncedState = state

    const dimsChanged =
      boardWidth !== state.width || boardHeight !== state.height
    if (dimsChanged) {
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
      cameraChanged: dimsChanged,
    })
    playStatusFx(state, performance.now())
    needsRender = true
    ensureFrame()
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unmount()
    effects?.dispose()
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
