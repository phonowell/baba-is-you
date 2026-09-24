import { Quaternion, Vector3 } from 'three'
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
import { pickBoardCell } from './board-3d-hover.js'
import type { BoardHoverVisual, BoardPickRect } from './board-3d-hover.js'
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
  getVisual: (
    item: Item,
    overridden?: boolean,
    tileMask?: number,
    active?: boolean,
  ) => EntityVisual
  createNode: (
    item: Item,
    nowMs: number,
    spawnDelayMs?: number,
    tileMask?: number,
    overridden?: boolean,
    active?: boolean,
  ) => EntityNode
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
  // Hover highlight quad + the screen-point→cell raycast; both optional so
  // headless tests can stub the seam.
  hover?: BoardHoverVisual | null
  pickCell?: typeof pickBoardCell
  requestFrame?: RequestFrame | null
  cancelFrame?: CancelFrame | null
  advanceSpriteFrames?: (frameIx: number) => number
  scheduleTimer?: ScheduleTimer | null
  cancelTimer?: CancelTimer | null
  // Mirrors node transforms into the instanced batches; returns true when
  // the shadow-map caster set changed (node add/remove, spec or castShadow
  // swap — pure wobble-frame migrations don't count).
  // `dirty` scopes matrix uploads: the nodes posed this tick, or null for
  // a full rewrite (post-sync, when transforms may be written directly).
  // Optional so headless tests can run without the batch layer.
  syncBatches?: (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ) => boolean
  // Adaptive quality ladder: sampled once per consecutive animating frame
  // with the RAF gap; returns true when a tier drop was applied. `tier`
  // reports the current ladder position for diagnostics.
  // Optional so headless tests can run without it.
  quality?: {
    observeFrame: (gapMs: number, nowMs: number) => boolean
    tier?: () => number
  } | null
  // Attaches throwaway meshes exercising the per-spec material programs
  // during a warm-up render; called around the render, returns cleanup.
  // Optional: without it prewarm compiles only the always-present passes.
  prewarmScene?: (render: () => void) => void
  // Viewport size changes arrive via observer instead of per-tick layout
  // reads; return value unsubscribes, null falls back to per-tick reads.
  observeResize?: (
    el: HTMLElement,
    cb: () => void,
  ) => (() => void) | null
}

export type Board3dRendererRuntime = {
  mount: (container: HTMLElement) => void
  sync: (state: GameState) => void
  unmount: () => void
  dispose: () => void
  // Pointer hover: returns the board cell under the point and lights it,
  // or clears the marker when the point misses the grid. `rect` is the
  // board's app-space rect supplied by the caller.
  setHoverAtPoint: (
    clientX: number,
    clientY: number,
    rect: BoardPickRect,
  ) => { x: number; y: number } | null
  clearHover: () => void
  // One-shot shader/program warm-up: renders a single frame so every
  // program (postfx chain, toon/basic/outline, shadow depth) compiles at
  // menu-idle instead of inside the first visible board frame. Runs before
  // any mount — the canvas is still detached, so nothing is visible.
  // Idempotent and dispose-safe.
  prewarm: () => void
  // Diagnostics for the browser probe: whether the warm-up render already
  // ran, and the adaptive-quality ladder position (0 = authored preset).
  isPrewarmed: () => boolean
  qualityTier: () => number
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
    hover = null,
    pickCell = pickBoardCell,
    requestFrame = null,
    cancelFrame = null,
    advanceSpriteFrames = null,
    scheduleTimer = null,
    cancelTimer = null,
    syncBatches = null,
    quality = null,
    prewarmScene = null,
    observeResize,
  } = args

  const scheduleFrame: RequestFrame =
    requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis)
  const unscheduleFrame: CancelFrame =
    cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis)
  const scheduleSpriteTimer: ScheduleTimer =
    scheduleTimer ?? globalThis.setInterval.bind(globalThis)
  const cancelSpriteTimer: CancelTimer =
    cancelTimer ?? globalThis.clearInterval.bind(globalThis)
  const observeResizeDefault = (
    el: HTMLElement,
    cb: () => void,
  ): (() => void) | null => {
    if (typeof ResizeObserver !== 'function') return null
    const observer = new ResizeObserver(cb)
    observer.observe(el)
    return () => observer.disconnect()
  }
  const observeResizeImpl =
    observeResize === undefined ? observeResizeDefault : observeResize

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
  // Visual cell currently lit by pointer hover — dedupes the per-move
  // raycast so an unchanged cell doesn't rebook a render.
  let hoverCell: { x: number; y: number } | null = null
  // Shadow-map refresh bookkeeping: the map only re-renders when the
  // frame actually posed nodes or changed instance/batch structure —
  // sprite texture swaps and pure mood frames skip the whole caster pass.
  let shadowDirty = true
  // ResizeObserver-driven viewport checks; per-tick reads are the
  // fallback when no observer is available.
  let resizeDirty = true
  let resizeObserved = false
  let stopObservingResize: (() => void) | null = null
  // Camera snapshots: billboard cards derive their facing from the camera,
  // so any camera move (readability guard, viewport fit) re-poses even
  // settled nodes once.
  const lastCameraPos = new Vector3()
  const lastCameraQuat = new Quaternion()
  // Batch upload scoping: sync can write node transforms directly (idle
  // snaps, shadow visibility), so the first flush after a sync rewrites
  // every slot; between syncs only posed nodes pay the upload.
  let batchAllDirty = true
  const posedNodes = new Set<EntityNode>()
  // Adaptive-quality sampling state: only gaps between two consecutive
  // animating ticks measure render pacing — idle-timer ticks arrive
  // hundreds of ms apart and would fake a 4fps verdict.
  let prevTickMs = 0
  let prevTickAnimated = false
  let prewarmed = false

  // A particle burst's launch point is the card's live tweened position.
  const nodeSpot = (node: EntityNode): BoardFxSpot => ({
    x: node.toX,
    y: node.toY,
    z: node.toBaseZ,
  })

  // Bursts anchor on the board center when nothing produced a spot.
  const spotsOrCenter = (spots: BoardFxSpot[]): BoardFxSpot[] =>
    spots.length > 0 ? spots : [{ x: 0, y: 0, z: CARD_BASE_Z }]

  // Spots the win fountain bursts from: the you/win cards' live positions.
  const celebrationSpots = (state: GameState): BoardFxSpot[] => {
    const spots: BoardFxSpot[] = []
    for (const item of state.items) {
      if (item.props.includes('hide')) continue
      if (!item.props.includes('you') && !item.props.includes('win')) continue
      const node = nodes.get(item.id)
      if (!node) continue
      spots.push(nodeSpot(node))
    }
    return spotsOrCenter(spots)
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
      spots.push(nodeSpot(node))
    }
    return spotsOrCenter(spots)
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

    const viewportChanged =
      (!resizeObserved || resizeDirty) &&
      viewController.updateViewport(container, boardWidth, boardHeight)
    resizeDirty = false

    let hasAnimation = false
    // Shadow-map gating splits "a node was posed" from "a caster actually
    // moved": idle micro-motion (stretch/float) re-poses settled nodes but
    // shifts the cast silhouette by sub-texel amounts — the blob shadow
    // still updates through the batch, so the caster pass stays skipped.
    let castersMoved = false
    const leavingDoneIds: number[] = []
    // One camera-facing basis serves every card this frame — the pose step
    // receives it lazily so an all-volume board never pays for it.
    let cardFacing: CardFacing | undefined
    const cameraMoved =
      !lastCameraPos.equals(camera.position) ||
      !lastCameraQuat.equals(camera.quaternion)
    lastCameraPos.copy(camera.position)
    lastCameraQuat.copy(camera.quaternion)

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
      if (
        settled &&
        !node.idleStretch &&
        !node.idleFloat &&
        !viewportChanged &&
        !cameraMoved
      ) {
        continue
      }
      if (!settled) castersMoved = true
      posedNodes.add(node)
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
        // Rule sparkles/motes fire once the armed pulse actually starts —
        // formation staggers push pulseStartMs into the near future.
        if (
          !node.ruleFxDone &&
          node.pulseStartMs !== null &&
          nowMs >= node.pulseStartMs
        ) {
          node.ruleFxDone = true
          if (node.pulseKind === 'rule-on') {
            effects.ruleSparkle(node.toX, node.toY, node.toBaseZ)
          } else if (node.pulseKind === 'rule-off') {
            effects.rulePuff(node.toX, node.toY, node.toBaseZ)
          }
        }
      }
    }

    for (const id of leavingDoneIds) {
      removeEntityNode(nodes, entityGroup, id)
    }

    const nodesRemoved = leavingDoneIds.length > 0

    // Particles and the mood timeline keep the frame loop alive on their own.
    if (effects?.update(nowMs)) hasAnimation = true

    // Adaptive quality ladder: only the gap between two consecutive
    // animating ticks measures real pacing. The cap keeps tab-switch /
    // GC stalls out of the average; a downgrade re-renders this frame so
    // the resized buffers never show a stale image.
    if (hasAnimation && prevTickAnimated && nowMs - prevTickMs <= 100) {
      if (quality?.observeFrame(nowMs - prevTickMs, nowMs)) needsRender = true
    }
    prevTickAnimated = hasAnimation
    prevTickMs = nowMs

    const castersChanged =
      syncBatches?.(nodes, batchAllDirty ? null : posedNodes) === true
    batchAllDirty = false
    posedNodes.clear()
    // Accumulate: a frame that skips the render must not drop the flag —
    // the next rendered frame still has to refresh the map. A viewport
    // resize alone doesn't move the light-space map, so it's absent here;
    // a camera move re-faces billboards and counts via `cameraMoved`.
    shadowDirty ||=
      castersMoved || castersChanged || cameraMoved || nodesRemoved

    if (needsRender || viewportChanged || hasAnimation || nodesRemoved) {
      const shadowMap = renderer.shadowMap
      if (shadowMap && shadowDirty) {
        shadowMap.needsUpdate = true
        shadowDirty = false
      }
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
    // cadence, and a visible control-layer rim pulses on it too. The check
    // must run before the frame dedupe — their sine needs a few samples per
    // cycle, and the sprite frame window is coarser than this timer, so
    // gating on it would collapse them into a two-pose flip.
    let idleMotionPending = false
    for (const node of nodes.values()) {
      if (node.idleStretch || node.idleFloat || node.outline.visible) {
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
    // The read above already consumed any pending resize — without this the
    // first tick would re-read the viewport once for nothing.
    resizeDirty = false
    // Mount can re-run on the same container — swap observers, don't pile up.
    stopObservingResize?.()
    stopObservingResize = observeResizeImpl?.(container, () => {
      resizeDirty = true
      ensureFrame()
    }) ?? null
    resizeObserved = stopObservingResize !== null
    startSpriteTimer()
    ensureFrame()
  }

  const unmount = (): void => {
    if (rafId) unscheduleFrame(rafId)
    frameActive = false
    rafId = 0
    needsRender = true
    stopObservingResize?.()
    stopObservingResize = null
    resizeObserved = false
    resizeDirty = true
    shadowDirty = true
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
    hoverCell = null
    hover?.clear()
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
      // The parked cursor may now sit on a different cell — drop the stale
      // marker; the next hover pass re-picks against the new dimensions.
      hoverCell = null
      hover?.clear()
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
    // Sync may have re-posed nodes or swapped visuals — the next rendered
    // frame refreshes the shadow map for whichever actually changed, and
    // the next flush rewrites every slot since sync can snap transforms
    // directly (idle snaps, shadow visibility) without posing.
    shadowDirty = true
    batchAllDirty = true
    ensureFrame()
  }

  const setHoverAtPoint = (
    clientX: number,
    clientY: number,
    rect: BoardPickRect,
  ): { x: number; y: number } | null => {
    if (
      disposed ||
      !container ||
      !container.isConnected ||
      boardWidth <= 0 ||
      boardHeight <= 0
    ) {
      if (hoverCell) {
        hoverCell = null
        hover?.clear()
      }
      return null
    }
    const cell = pickCell(
      camera,
      rect,
      clientX,
      clientY,
      boardWidth,
      boardHeight,
    )
    if (cell?.x === hoverCell?.x && cell?.y === hoverCell?.y) return cell
    hoverCell = cell
    if (cell) hover?.setCell(cell.x, cell.y, boardWidth, boardHeight)
    else hover?.clear()
    needsRender = true
    ensureFrame()
    return cell
  }

  const clearHover = (): void => {
    if (hoverCell === null) return
    hoverCell = null
    hover?.clear()
    needsRender = true
    ensureFrame()
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unmount()
    effects?.dispose()
    hover?.dispose()
    groundVisuals = disposeResources(groundVisuals)
    container = null
  }

  const prewarm = (): void => {
    if (disposed || prewarmed) return
    // One render against the (empty) board: compiles the whole postfx
    // chain plus every material program already in the scene — the
    // prewarmScene hook temporarily adds stand-ins for the per-spec card
    // programs — and primes the shadow pass so its depth variants compile
    // too. All of it happens while the canvas is detached from the DOM.
    // prewarmed flips only on success: a failed warm render lets the next
    // preload retry.
    const warmRender = (): void => {
      const shadowMap = renderer.shadowMap
      if (shadowMap) shadowMap.needsUpdate = true
      composer.render()
    }
    if (prewarmScene) prewarmScene(warmRender)
    else warmRender()
    prewarmed = true
  }

  return {
    mount,
    sync,
    unmount,
    dispose,
    setHoverAtPoint,
    clearHover,
    prewarm,
    isPrewarmed: () => prewarmed,
    qualityTier: () => quality?.tier?.() ?? 0,
  }
}
