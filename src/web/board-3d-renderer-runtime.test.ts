import assert from 'node:assert/strict'
import test from 'node:test'

import { Group, PerspectiveCamera } from 'three'

import { createBoard3dRendererRuntime } from './board-3d-renderer-runtime.js'

import type { GameState } from '../logic/types.js'
import type { EntityNode } from './board-3d-node-types.js'

type RuntimeArgs = Parameters<typeof createBoard3dRendererRuntime>[0]

type TestContainer = HTMLElement & {
  isConnected: boolean
}

const createState = (
  width: number,
  height: number,
  items: GameState['items'] = [],
): GameState => ({
  levelIndex: 0,
  title: 'runtime-test',
  width,
  height,
  items,
  rules: [],
  status: 'playing',
  turn: 0,
})

const createContainer = (): TestContainer => {
  const dataset: DOMStringMap = {}
  const classSet = new Set<string>()
  const classList = {
    add: (value: string) => {
      classSet.add(value)
    },
    remove: (value: string) => {
      classSet.delete(value)
    },
    contains: (value: string) => classSet.has(value),
    toggle: (value: string, force?: boolean) => {
      if (force === undefined) {
        if (classSet.has(value)) classSet.delete(value)
        else classSet.add(value)
      } else if (force) classSet.add(value)
      else classSet.delete(value)
      return classSet.has(value)
    },
  } as DOMTokenList

  const container = {
    isConnected: true,
    clientWidth: 640,
    clientHeight: 480,
    dataset,
    classList,
    textContent: '',
    appendChild: <T extends Node>(child: T): T => {
      if (child && typeof child === 'object' && 'parentElement' in child) {
        ;(child as { parentElement: HTMLElement | null }).parentElement =
          container as unknown as HTMLElement
      }
      return child
    },
  } as unknown as TestContainer

  return container
}

const createNode = (): EntityNode =>
  ({
    mesh: {
      position: { x: 0, y: 0, z: 0, set: () => undefined },
      rotation: { z: 0, set: () => undefined },
      scale: { set: () => undefined },
    },
    shadow: {
      position: { set: () => undefined },
      scale: { set: () => undefined },
    },
    shadowMaterial: { opacity: 1, dispose: () => undefined },
    outline: { visible: false },
    idleStretch: false,
    idleFloat: false,
    idlePhaseOffsetMs: 0,
    idleFrameOffset: 0,
    facesCamera: false,
    rotRoll: 0,
    rollStep: 0,
    fromX: 0,
    fromY: 0,
    fromBaseZ: 0,
    fromRoll: 0,
    toX: 0,
    toY: 0,
    toBaseZ: 0,
    toRoll: 0,
    animStartMs: 0,
    animDurationMs: 1,
    moving: false,
    spawnStartMs: null,
    despawnStartMs: null,
    landStartMs: null,
    fxColors: [],
    spawnFxDone: true,
    despawnFxDone: true,
    pulseStartMs: null,
    pulseKind: null,
  }) as unknown as EntityNode

const createRuntime = (overrides: {
  nodes?: Map<number, EntityNode>
  applyNodePoseStep?: RuntimeArgs['applyNodePoseStep']
  syncNodes?: RuntimeArgs['syncNodes']
  rebuildGround?: RuntimeArgs['rebuildGround']
  disposeResources?: RuntimeArgs['disposeResources']
  composerRender?: () => void
  viewUpdateViewport?: RuntimeArgs['viewController']['updateViewport']
  entityGroup?: RuntimeArgs['entityGroup']
  effects?: RuntimeArgs['effects']
  hover?: RuntimeArgs['hover']
  pickCell?: RuntimeArgs['pickCell']
  requestFrame?: RuntimeArgs['requestFrame']
  cancelFrame?: RuntimeArgs['cancelFrame']
  advanceSpriteFrames?: RuntimeArgs['advanceSpriteFrames']
  scheduleTimer?: RuntimeArgs['scheduleTimer']
  cancelTimer?: RuntimeArgs['cancelTimer']
  syncBatches?: RuntimeArgs['syncBatches']
  observeResize?: RuntimeArgs['observeResize']
  shadowMap?: { enabled: boolean; autoUpdate: boolean; needsUpdate: boolean }
}) => {
  const scheduledCallbacks: FrameRequestCallback[] = []
  const scheduledTimers: Array<() => void> = []
  const rendererDomElement = {
    parentElement: null as HTMLElement | null,
    remove: () => {
      rendererDomElement.parentElement = null
    },
  }
  const renderer = {
    domElement: rendererDomElement,
    shadowMap: overrides.shadowMap ?? {
      enabled: true,
      autoUpdate: false,
      needsUpdate: false,
    },
  } as unknown as Parameters<typeof createBoard3dRendererRuntime>[0]['renderer']
  const composer = {
    render: overrides.composerRender ?? (() => undefined),
  } as unknown as Parameters<typeof createBoard3dRendererRuntime>[0]['composer']
  const world = {} as Parameters<typeof createBoard3dRendererRuntime>[0]['world']
  const entityGroup = overrides.entityGroup ?? new Group()
  const viewController = {
    updateViewport: overrides.viewUpdateViewport ?? (() => false),
    updateCamera: () => undefined,
    applyReadabilityGuard: () => undefined,
    setFxMood: () => undefined,
  }

  const args: RuntimeArgs = {
    renderer,
    composer,
    world,
    entityGroup,
    viewController,
    nodes: overrides.nodes ?? new Map<number, EntityNode>(),
    getVisual: () => ({}) as never,
    createNode: () => createNode(),
    camera: new PerspectiveCamera(),
    disposeResources:
      overrides.disposeResources ??
      ((groundVisuals) => groundVisuals),
  }

  if (overrides.rebuildGround) args.rebuildGround = overrides.rebuildGround
  if (overrides.applyNodePoseStep)
    args.applyNodePoseStep = overrides.applyNodePoseStep
  if (overrides.syncNodes) args.syncNodes = overrides.syncNodes
  if (overrides.effects) args.effects = overrides.effects
  if (overrides.hover) args.hover = overrides.hover
  if (overrides.pickCell) args.pickCell = overrides.pickCell
  args.requestFrame =
    overrides.requestFrame ??
    ((callback: FrameRequestCallback) => {
      scheduledCallbacks.push(callback)
      return scheduledCallbacks.length
    })
  args.cancelFrame = overrides.cancelFrame ?? (() => undefined)
  if (overrides.advanceSpriteFrames)
    args.advanceSpriteFrames = overrides.advanceSpriteFrames
  args.scheduleTimer =
    overrides.scheduleTimer ??
    ((callback: () => void) => {
      scheduledTimers.push(callback)
      return scheduledTimers.length
    })
  args.cancelTimer = overrides.cancelTimer ?? (() => undefined)
  if (overrides.syncBatches) args.syncBatches = overrides.syncBatches
  if (overrides.observeResize !== undefined)
    args.observeResize = overrides.observeResize

  return createBoard3dRendererRuntime(args)
}

test('board-3d runtime does not keep RAF alive for idle micro-motion alone', () => {
  const callbacks: FrameRequestCallback[] = []
  const nodes = new Map<number, EntityNode>([[1, createNode()]])
  const runtime = createRuntime({
    nodes,
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    cancelFrame: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)
  assert.equal(callbacks.length, 1)

  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)

  assert.equal(callbacks.length, 0)
})

test('board-3d runtime keeps RAF alive while a turn tween runs', () => {
  const callbacks: FrameRequestCallback[] = []
  let poseCalls = 0
  const node = createNode()
  node.facingYaw = Math.PI / 2
  node.fromYaw = 0
  node.yawStartMs = 0
  node.yawDurationMs = 140
  const nodes = new Map<number, EntityNode>([[1, node]])
  const runtime = createRuntime({
    nodes,
    applyNodePoseStep: () => {
      poseCalls += 1
      return { animating: true, finishedLeaving: false }
    },
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()

  runtime.mount(container)
  const midTween = callbacks.shift()
  assert.ok(midTween)
  midTween(50)

  // Mid-tween the node is not settled: it gets posed and RAF continues.
  assert.equal(poseCalls, 1)
  assert.equal(callbacks.length, 1)

  const settledTick = callbacks.shift()
  assert.ok(settledTick)
  settledTick(200)

  // Once the turn finishes the node settles: pose skipped, RAF released.
  assert.equal(poseCalls, 1)
  assert.equal(callbacks.length, 0)
})

test('board-3d runtime cancels RAF on unmount', () => {
  const callbacks: FrameRequestCallback[] = []
  const cancelled: number[] = []
  const runtime = createRuntime({
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    cancelFrame: (id) => {
      cancelled.push(id)
    },
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.unmount()

  assert.deepEqual(cancelled, [1])
})

test('board-3d runtime rebuilds ground only when board size changes', () => {
  const rebuilds: Array<[number, number]> = []
  const runtime = createRuntime({
    syncNodes: () => undefined,
    rebuildGround: (_world, width, height, visuals) => {
      rebuilds.push([width, height])
      return visuals
    },
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.sync(createState(3, 2))
  runtime.sync(createState(3, 2))
  runtime.sync(createState(4, 2))

  assert.deepEqual(rebuilds, [
    [3, 2],
    [4, 2],
  ])
})

test('board-3d runtime skips re-syncing an identical state object', () => {
  let syncCalls = 0
  const runtime = createRuntime({
    rebuildGround: (_world, _width, _height, visuals) => visuals,
    syncNodes: () => {
      syncCalls += 1
    },
  })
  const container = createContainer()
  const state = createState(3, 2)

  runtime.mount(container)
  runtime.sync(state)
  runtime.sync(state)
  runtime.sync(createState(3, 2))

  assert.equal(syncCalls, 2)
})

test('board-3d runtime dispose clears resources once and blocks further work', () => {
  let disposeCalls = 0
  const rebuilds: Array<[number, number]> = []
  const runtime = createRuntime({
    syncNodes: () => undefined,
    rebuildGround: (_world, width, height, visuals) => {
      rebuilds.push([width, height])
      return visuals
    },
    disposeResources: () => {
      disposeCalls += 1
      return {
        groundMesh: null,
        playAreaFillMesh: null,
        cellGrid: null,
      }
    },
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.sync(createState(2, 2))
  runtime.dispose()
  runtime.sync(createState(3, 3))
  runtime.mount(container)

  assert.equal(disposeCalls, 1)
  assert.deepEqual(rebuilds, [[2, 2]])
})

test('board-3d runtime double dispose stays idempotent', () => {
  let disposeCalls = 0
  const runtime = createRuntime({
    disposeResources: () => {
      disposeCalls += 1
      return {
        groundMesh: null,
        playAreaFillMesh: null,
        cellGrid: null,
      }
    },
  })

  runtime.dispose()
  runtime.dispose()

  assert.equal(disposeCalls, 1)
})

test('board-3d runtime remount moves canvas ownership to the new container', () => {
  const callbacks: FrameRequestCallback[] = []
  const firstContainer = createContainer()
  const secondContainer = createContainer()
  let firstAppendCount = 0
  let secondAppendCount = 0
  firstContainer.appendChild = <T extends Node>(child: T): T => {
    firstAppendCount += 1
    return child
  }
  secondContainer.appendChild = <T extends Node>(child: T): T => {
    secondAppendCount += 1
    return child
  }

  const runtime = createRuntime({
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })

  runtime.mount(firstContainer)
  runtime.mount(secondContainer)

  assert.equal(firstContainer.classList.contains('board-3d'), false)
  assert.equal(secondContainer.classList.contains('board-3d'), true)
  assert.equal(firstContainer.dataset.clayPreset, undefined)
  assert.equal(secondContainer.dataset.clayPreset, 'single')
  assert.equal(firstAppendCount, 1)
  assert.equal(secondAppendCount, 1)
  assert.equal(callbacks.length, 1)
})

test('board-3d runtime remount on same container does not duplicate canvas work', () => {
  const container = createContainer()
  let appendCount = 0
  container.appendChild = <T extends Node>(child: T): T => {
    appendCount += 1
    if (child && typeof child === 'object' && 'parentElement' in child) {
      ;(child as { parentElement: HTMLElement | null }).parentElement =
        container as unknown as HTMLElement
    }
    return child
  }

  const runtime = createRuntime({})

  runtime.mount(container)
  runtime.mount(container)

  assert.equal(appendCount, 1)
  assert.equal(container.classList.contains('board-3d'), true)
  assert.equal(container.dataset.clayPreset, 'single')
})

test('board-3d runtime sync before mount is a no-op', () => {
  let rebuilds = 0
  let syncCalls = 0
  const runtime = createRuntime({
    rebuildGround: (_world, _width, _height, visuals) => {
      rebuilds += 1
      return visuals
    },
    syncNodes: () => {
      syncCalls += 1
    },
  })

  runtime.sync(createState(2, 2))

  assert.equal(rebuilds, 0)
  assert.equal(syncCalls, 0)
})

test('board-3d runtime stops scheduling when mounted container disconnects', () => {
  const callbacks: FrameRequestCallback[] = []
  const renders: number[] = []
  const container = createContainer()
  const runtime = createRuntime({
    composerRender: () => {
      renders.push(1)
    },
    applyNodePoseStep: () => ({
      animating: true,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })

  runtime.mount(container)
  assert.equal(callbacks.length, 1)

  container.isConnected = false
  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)

  assert.equal(renders.length, 0)
  assert.equal(callbacks.length, 0)
})

test('board-3d runtime renders the leaving cleanup frame and removes finished nodes', () => {
  const callbacks: FrameRequestCallback[] = []
  const renders: number[] = []
  let cardReleased = 0
  let shadowReleased = 0
  let shadowDisposed = 0
  const node = createNode()
  node.despawnStartMs = 5
  // Off-scene carriers: removal frees the instanced slots and disposes the
  // opacity carrier rather than detaching meshes from the group.
  node.cardSlot = {
    key: 'card',
    index: 0,
    release: () => {
      cardReleased += 1
    },
  }
  node.shadowSlot = {
    key: 'shadow',
    index: 0,
    release: () => {
      shadowReleased += 1
    },
  }
  node.shadowMaterial.dispose = () => {
    shadowDisposed += 1
  }
  const nodes = new Map<number, EntityNode>([[7, node]])
  const runtime = createRuntime({
    nodes,
    composerRender: () => {
      renders.push(1)
    },
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: true,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })

  const container = createContainer()
  runtime.mount(container)
  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)

  assert.equal(renders.length, 1)
  assert.equal(nodes.size, 0)
  assert.equal(cardReleased, 1)
  assert.equal(shadowReleased, 1)
  assert.equal(shadowDisposed, 1)
  assert.equal(callbacks.length, 0)
})

test('board-3d runtime drives sprite frames on the slow timer without holding RAF', () => {
  const callbacks: FrameRequestCallback[] = []
  const timers: Array<() => void> = []
  const renders: number[] = []
  const advances: number[] = []
  const runtime = createRuntime({
    composerRender: () => {
      renders.push(1)
    },
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    advanceSpriteFrames: (frameIx) => {
      advances.push(frameIx)
      return 2
    },
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)
  assert.equal(timers.length, 1)
  assert.equal(callbacks.length, 1)

  const mountTick = callbacks.shift()
  assert.ok(mountTick)
  mountTick(16)
  assert.equal(renders.length, 1)
  assert.equal(callbacks.length, 0)

  const realNow = performance.now
  performance.now = () => 0
  try {
    timers[0]!()
  } finally {
    performance.now = realNow
  }

  assert.equal(advances.length, 1)
  assert.equal(callbacks.length, 1)
  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)
  assert.equal(renders.length, 2)
  assert.equal(callbacks.length, 0)
})

test('board-3d runtime poses idle-stretch nodes on the slow timer without sprite frames', () => {
  const callbacks: FrameRequestCallback[] = []
  const timers: Array<() => void> = []
  const node = createNode()
  node.idleStretch = true
  const nodes = new Map<number, EntityNode>([[1, node]])
  const runtime = createRuntime({
    nodes,
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    advanceSpriteFrames: () => 0,
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)
  const mountTick = callbacks.shift()
  assert.ok(mountTick)
  mountTick(16)
  assert.equal(callbacks.length, 0)

  const realNow = performance.now
  performance.now = () => 0
  try {
    timers[0]!()
  } finally {
    performance.now = realNow
  }

  assert.equal(callbacks.length, 1)
})

test('board-3d runtime re-poses float-bob nodes on the slow timer without sprite frames', () => {
  const callbacks: FrameRequestCallback[] = []
  const timers: Array<() => void> = []
  let poseCalls = 0
  const node = createNode()
  node.idleFloat = true
  const nodes = new Map<number, EntityNode>([[1, node]])
  const runtime = createRuntime({
    nodes,
    applyNodePoseStep: () => {
      poseCalls += 1
      return { animating: false, finishedLeaving: false }
    },
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    advanceSpriteFrames: () => 0,
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)
  const mountTick = callbacks.shift()
  assert.ok(mountTick)
  mountTick(16)
  assert.equal(poseCalls, 1)
  assert.equal(callbacks.length, 0)

  const realNow = performance.now
  try {
    performance.now = () => 0
    timers[0]!()
  } finally {
    performance.now = realNow
  }

  const firstWake = callbacks.shift()
  assert.ok(firstWake)
  firstWake(16)
  assert.equal(poseCalls, 2)

  try {
    // Second fire in a later sprite slot: the first fire always wakes a
    // frame (lastSpriteFrameIx < 0); only the float node keeps the second
    // one alive since nothing else changed.
    performance.now = () => 500
    timers[0]!()
  } finally {
    performance.now = realNow
  }

  assert.equal(callbacks.length, 1)
  const secondWake = callbacks.shift()
  assert.ok(secondWake)
  secondWake(16)
  assert.equal(poseCalls, 3)
  assert.equal(callbacks.length, 0)
})

test('board-3d runtime dedupes sprite timer fires inside the same frame slot', () => {
  const timers: Array<() => void> = []
  const advances: number[] = []
  const runtime = createRuntime({
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    advanceSpriteFrames: (frameIx) => {
      advances.push(frameIx)
      return 1
    },
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: () => undefined,
  })
  const container = createContainer()
  runtime.mount(container)

  const realNow = performance.now
  performance.now = () => 0
  try {
    timers[0]!()
    timers[0]!()
    timers[0]!()
  } finally {
    performance.now = realNow
  }

  assert.equal(advances.length, 1)
})

test('board-3d runtime re-poses idle nodes on every timer fire within a frame slot', () => {
  const callbacks: FrameRequestCallback[] = []
  const timers: Array<() => void> = []
  let poseCalls = 0
  const node = createNode()
  node.idleStretch = true
  const nodes = new Map<number, EntityNode>([[1, node]])
  const runtime = createRuntime({
    nodes,
    applyNodePoseStep: () => {
      poseCalls += 1
      return { animating: false, finishedLeaving: false }
    },
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    advanceSpriteFrames: () => 0,
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: () => undefined,
  })
  const container = createContainer()
  runtime.mount(container)
  const mountTick = callbacks.shift()
  assert.ok(mountTick)
  mountTick(16)
  assert.equal(poseCalls, 1)

  const realNow = performance.now
  try {
    // Both fires land in the same sprite-frame slot: the sprite dedupe must
    // not swallow the idle re-pose — idle sines need every timer sample.
    performance.now = () => 0
    timers[0]!()
    const firstWake = callbacks.shift()
    assert.ok(firstWake)
    firstWake(0)
    performance.now = () => 100
    timers[0]!()
    const secondWake = callbacks.shift()
    assert.ok(secondWake)
    secondWake(100)
  } finally {
    performance.now = realNow
  }

  assert.equal(poseCalls, 3)
})

test('board-3d runtime cancels the sprite timer on unmount', () => {
  const cancelled: number[] = []
  const runtime = createRuntime({
    advanceSpriteFrames: () => 0,
    scheduleTimer: () => 7,
    cancelTimer: (id) => {
      cancelled.push(id)
    },
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.unmount()

  assert.deepEqual(cancelled, [7])
})

test('board-3d runtime stops the sprite timer and ignores fires after dispose', () => {
  const timers: Array<() => void> = []
  const cancelled: number[] = []
  const advances: number[] = []
  const runtime = createRuntime({
    advanceSpriteFrames: (frameIx) => {
      advances.push(frameIx)
      return 1
    },
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: (id) => {
      cancelled.push(id)
    },
  })
  const container = createContainer()

  runtime.mount(container)
  assert.equal(timers.length, 1)
  runtime.dispose()

  assert.deepEqual(cancelled, [1])
  timers[0]!()
  assert.equal(advances.length, 0)
})

test('board-3d runtime skips the sprite timer when no frame advancer is wired', () => {
  const timers: Array<() => void> = []
  const runtime = createRuntime({
    scheduleTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancelTimer: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)

  assert.equal(timers.length, 0)
})

type FxCalls = {
  spawnPuff: unknown[][]
  despawnPoof: unknown[][]
  ruleSparkle: unknown[][]
  rulePuff: unknown[][]
  playWin: number
  playLose: number
  neutralMood: number
  clear: number
  dispose: number
}

const createEffectsStub = (updateResult = false) => {
  const calls: FxCalls = {
    spawnPuff: [],
    despawnPoof: [],
    ruleSparkle: [],
    rulePuff: [],
    playWin: 0,
    playLose: 0,
    neutralMood: 0,
    clear: 0,
    dispose: 0,
  }
  const effects = {
    spawnPuff: (...args: unknown[]) => {
      calls.spawnPuff.push(args)
    },
    despawnPoof: (...args: unknown[]) => {
      calls.despawnPoof.push(args)
    },
    ruleSparkle: (...args: unknown[]) => {
      calls.ruleSparkle.push(args)
    },
    rulePuff: (...args: unknown[]) => {
      calls.rulePuff.push(args)
    },
    playWin: () => {
      calls.playWin += 1
    },
    playLose: () => {
      calls.playLose += 1
    },
    neutralMood: () => {
      calls.neutralMood += 1
    },
    update: () => updateResult,
    clear: () => {
      calls.clear += 1
    },
    dispose: () => {
      calls.dispose += 1
    },
  }
  return { effects, calls }
}

test('board-3d runtime keeps RAF alive while board effects animate', () => {
  const callbacks: FrameRequestCallback[] = []
  const { effects } = createEffectsStub(true)
  const runtime = createRuntime({
    effects,
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()

  runtime.mount(container)
  assert.equal(callbacks.length, 1)

  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)

  assert.equal(callbacks.length, 1)
})

test('board-3d runtime fires win/lose effects only on status transitions', () => {
  const { effects, calls } = createEffectsStub()
  const runtime = createRuntime({
    effects,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
    syncNodes: () => undefined,
  })
  const container = createContainer()
  const playing = createState(3, 2)

  runtime.mount(container)
  runtime.sync(playing)
  assert.equal(calls.playWin, 0)
  assert.equal(calls.neutralMood, 0)

  runtime.sync({ ...playing, status: 'win' })
  assert.equal(calls.playWin, 1)
  runtime.sync({ ...playing, status: 'win' })
  assert.equal(calls.playWin, 1)

  runtime.sync({ ...playing, status: 'lose' })
  assert.equal(calls.playLose, 1)

  runtime.sync({ ...playing, status: 'win' })
  assert.equal(calls.playWin, 2)

  runtime.sync({ ...playing, status: 'playing' })
  assert.equal(calls.neutralMood, 1)
})

test('board-3d runtime staggers hop pulses across nodes on win', () => {
  const { effects } = createEffectsStub()
  const near = createNode()
  const far = createNode()
  near.toX = 0
  near.toY = 0
  far.toX = 6
  far.toY = 0
  const nodes = new Map<number, EntityNode>([
    [1, near],
    [2, far],
  ])
  const playing = createState(7, 3, [
    { id: 1, name: 'baba', x: 3, y: 1, isText: false, props: ['you'] },
    { id: 2, name: 'rock', x: 5, y: 1, isText: false, props: ['push'] },
  ])
  const runtime = createRuntime({
    effects,
    nodes,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
    syncNodes: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.sync(playing)
  runtime.sync({ ...playing, status: 'win' })

  assert.equal(near.pulseKind, 'hop')
  assert.equal(far.pulseKind, 'hop')
  assert.ok(near.pulseStartMs !== null && far.pulseStartMs !== null)
  assert.ok((far.pulseStartMs ?? 0) > (near.pulseStartMs ?? 0))
})

test('board-3d runtime slump-pulses nodes on lose', () => {
  const { effects } = createEffectsStub()
  const node = createNode()
  const nodes = new Map<number, EntityNode>([[1, node]])
  const playing = createState(3, 2)
  const runtime = createRuntime({
    effects,
    nodes,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
    syncNodes: () => undefined,
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.sync(playing)
  runtime.sync({ ...playing, status: 'lose' })

  assert.equal(node.pulseKind, 'slump')
  assert.ok(node.pulseStartMs !== null)
})

test('board-3d runtime fires a spawn puff once when the spawn starts', () => {
  const callbacks: FrameRequestCallback[] = []
  const { effects, calls } = createEffectsStub()
  const node = createNode()
  node.spawnStartMs = 100
  node.spawnFxDone = false
  const nodes = new Map<number, EntityNode>([[1, node]])
  const runtime = createRuntime({
    effects,
    nodes,
    applyNodePoseStep: () => ({
      animating: true,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()

  runtime.mount(container)
  const tick1 = callbacks.shift()
  assert.ok(tick1)
  tick1(50)
  assert.equal(calls.spawnPuff.length, 0)

  const tick2 = callbacks.shift()
  assert.ok(tick2)
  tick2(120)
  assert.equal(calls.spawnPuff.length, 1)

  const tick3 = callbacks.shift()
  assert.ok(tick3)
  tick3(160)
  assert.equal(calls.spawnPuff.length, 1)
})

test('board-3d runtime fires a despawn poof once while leaving', () => {
  const callbacks: FrameRequestCallback[] = []
  const { effects, calls } = createEffectsStub()
  const node = createNode()
  node.despawnStartMs = 5
  node.despawnFxDone = false
  const nodes = new Map<number, EntityNode>([[1, node]])
  const runtime = createRuntime({
    effects,
    nodes,
    applyNodePoseStep: () => ({
      animating: true,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()

  runtime.mount(container)
  const tick1 = callbacks.shift()
  assert.ok(tick1)
  tick1(16)
  assert.equal(calls.despawnPoof.length, 1)

  const tick2 = callbacks.shift()
  assert.ok(tick2)
  tick2(32)
  assert.equal(calls.despawnPoof.length, 1)
})

test('board-3d runtime fires rule sparkles and motes once per armed pulse', () => {
  const callbacks: FrameRequestCallback[] = []
  const { effects, calls } = createEffectsStub()
  const onNode = createNode()
  onNode.pulseStartMs = 100
  onNode.pulseKind = 'rule-on'
  onNode.ruleFxDone = false
  const offNode = createNode()
  offNode.pulseStartMs = 140
  offNode.pulseKind = 'rule-off'
  offNode.ruleFxDone = false
  const nodes = new Map<number, EntityNode>([
    [1, onNode],
    [2, offNode],
  ])
  const runtime = createRuntime({
    effects,
    nodes,
    applyNodePoseStep: () => ({
      animating: true,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()

  runtime.mount(container)
  const tick1 = callbacks.shift()
  assert.ok(tick1)
  tick1(50)
  assert.equal(calls.ruleSparkle.length, 0)
  assert.equal(calls.rulePuff.length, 0)

  // The sparkle fires at its stagger slot; the mote waits for its own.
  const tick2 = callbacks.shift()
  assert.ok(tick2)
  tick2(120)
  assert.equal(calls.ruleSparkle.length, 1)
  assert.equal(calls.rulePuff.length, 0)

  const tick3 = callbacks.shift()
  assert.ok(tick3)
  tick3(160)
  assert.equal(calls.ruleSparkle.length, 1)
  assert.equal(calls.rulePuff.length, 1)

  const tick4 = callbacks.shift()
  assert.ok(tick4)
  tick4(200)
  assert.equal(calls.ruleSparkle.length, 1)
  assert.equal(calls.rulePuff.length, 1)
})

test('board-3d runtime clears board effects on unmount and disposes with the renderer', () => {
  const { effects, calls } = createEffectsStub()
  const runtime = createRuntime({ effects })
  const container = createContainer()

  runtime.mount(container)
  runtime.unmount()
  assert.equal(calls.clear, 1)

  runtime.mount(container)
  runtime.dispose()
  assert.equal(calls.dispose, 1)
})

type HoverStub = {
  calls: { setCell: Array<[number, number]>; clears: number; disposes: number }
  hover: NonNullable<RuntimeArgs['hover']>
}

const createHoverStub = (): HoverStub => {
  const calls: HoverStub['calls'] = { setCell: [], clears: 0, disposes: 0 }
  return {
    calls,
    hover: {
      setCell: (x, y) => {
        calls.setCell.push([x, y])
      },
      clear: () => {
        calls.clears += 1
      },
      dispose: () => {
        calls.disposes += 1
      },
    },
  }
}

const HOVER_RECT = { left: 0, top: 0, width: 640, height: 480 }

test('board-3d runtime marks the picked cell and renders one frame', () => {
  const { calls, hover } = createHoverStub()
  const callbacks: FrameRequestCallback[] = []
  const runtime = createRuntime({
    hover,
    pickCell: () => ({ x: 2, y: 3 }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    syncNodes: () => undefined,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.sync(createState(5, 5))
  // Drain the mount frame so the next schedule is observable.
  callbacks.shift()?.(16)
  assert.equal(callbacks.length, 0)

  const cell = runtime.setHoverAtPoint(100, 80, HOVER_RECT)
  assert.deepEqual(cell, { x: 2, y: 3 })
  assert.deepEqual(calls.setCell, [[2, 3]])
  assert.equal(callbacks.length, 1)

  // Same cell again — no second visual update, no extra frame.
  callbacks.shift()?.(32)
  runtime.setHoverAtPoint(101, 81, HOVER_RECT)
  assert.deepEqual(calls.setCell, [[2, 3]])
  assert.equal(callbacks.length, 0)
})

test('board-3d runtime clears hover on miss, clear, unmount and board resize', () => {
  const { calls, hover } = createHoverStub()
  let picked: { x: number; y: number } | null = { x: 1, y: 1 }
  const runtime = createRuntime({
    hover,
    pickCell: () => picked,
    syncNodes: () => undefined,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
  })
  const container = createContainer()

  // Before mount there is no board to hover.
  assert.equal(runtime.setHoverAtPoint(1, 1, HOVER_RECT), null)
  assert.equal(calls.setCell.length, 0)

  runtime.mount(container)
  runtime.sync(createState(4, 4))
  // The first sync rebuilds the ground and clears any stale marker.
  let clears = calls.clears
  runtime.setHoverAtPoint(10, 10, HOVER_RECT)
  assert.equal(calls.setCell.length, 1)

  // A miss hides the marker; repeating a miss stays deduped.
  picked = null
  assert.equal(runtime.setHoverAtPoint(999, 999, HOVER_RECT), null)
  assert.equal(calls.clears, clears + 1)
  runtime.clearHover()
  assert.equal(calls.clears, clears + 1)

  picked = { x: 0, y: 0 }
  runtime.setHoverAtPoint(10, 10, HOVER_RECT)
  runtime.unmount()
  assert.equal(calls.clears, clears + 2)

  runtime.mount(container)
  runtime.sync(createState(4, 4))
  runtime.setHoverAtPoint(10, 10, HOVER_RECT)
  clears = calls.clears
  runtime.sync(createState(6, 4))
  assert.equal(calls.clears, clears + 1)
})

test('board-3d runtime dispose releases the hover visual once', () => {
  const { calls, hover } = createHoverStub()
  const runtime = createRuntime({
    hover,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
  })
  const container = createContainer()

  runtime.mount(container)
  runtime.sync(createState(3, 3))
  runtime.setHoverAtPoint(5, 5, HOVER_RECT)
  runtime.dispose()
  runtime.dispose()

  assert.equal(calls.disposes, 1)
  // After dispose the surface is dead — no picks, no clears.
  assert.equal(runtime.setHoverAtPoint(5, 5, HOVER_RECT), null)
})

test('board-3d runtime refreshes the shadow map only on frames that need it', () => {
  const callbacks: FrameRequestCallback[] = []
  const renders: number[] = []
  const shadowMap = { enabled: true, autoUpdate: false, needsUpdate: false }
  const nodes = new Map<number, EntityNode>([[1, createNode()]])
  const runtime = createRuntime({
    nodes,
    shadowMap,
    composerRender: () => {
      renders.push(1)
    },
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()
  runtime.mount(container)

  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)
  assert.equal(renders.length, 1)
  // First rendered frame seeds the map once, then consumes the dirty flag.
  assert.equal(shadowMap.needsUpdate, true)

  shadowMap.needsUpdate = false
  tick(32)
  // Settled board: nothing rendered, nothing re-baked.
  assert.equal(renders.length, 1)
  assert.equal(shadowMap.needsUpdate, false)
})

test('board-3d runtime carries a pending shadow refresh across skipped frames', () => {
  const callbacks: FrameRequestCallback[] = []
  const renders: number[] = []
  const shadowMap = { enabled: true, autoUpdate: false, needsUpdate: false }
  let structureChanged = false
  const nodes = new Map<number, EntityNode>([[1, createNode()]])
  const runtime = createRuntime({
    nodes,
    shadowMap,
    composerRender: () => {
      renders.push(1)
    },
    applyNodePoseStep: () => ({
      animating: false,
      finishedLeaving: false,
    }),
    syncBatches: () => structureChanged,
    syncNodes: () => undefined,
    rebuildGround: (_world, _width, _height, visuals) => visuals,
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()
  runtime.mount(container)

  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)
  assert.equal(shadowMap.needsUpdate, true)
  shadowMap.needsUpdate = false

  // Batch churn without a rendered frame: the dirty flag must survive.
  structureChanged = true
  tick(32)
  assert.equal(renders.length, 1)
  assert.equal(shadowMap.needsUpdate, false)

  structureChanged = false
  runtime.sync(createState(4, 4))
  const nextTick = callbacks.shift()
  assert.ok(nextTick)
  nextTick(48)
  assert.equal(renders.length, 2)
  assert.equal(shadowMap.needsUpdate, true)
})

test('board-3d runtime observes resize and re-reads the viewport once per event', () => {
  const callbacks: FrameRequestCallback[] = []
  const observed: HTMLElement[] = []
  const stops: number[] = []
  const resizeCbs: Array<() => void> = []
  let viewportReads = 0
  const runtime = createRuntime({
    observeResize: (el, cb) => {
      observed.push(el)
      resizeCbs.push(cb)
      return () => {
        stops.push(1)
      }
    },
    viewUpdateViewport: () => {
      viewportReads += 1
      return true
    },
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()
  runtime.mount(container)
  assert.equal(observed.length, 1)
  assert.equal(viewportReads, 1)

  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)
  // Observer-driven: no per-tick layout read while quiet.
  assert.equal(viewportReads, 1)

  resizeCbs[0]?.()
  const resizeTick = callbacks.shift()
  assert.ok(resizeTick)
  resizeTick(32)
  assert.equal(viewportReads, 2)

  runtime.unmount()
  assert.equal(stops.length, 1)

  // Remount replaces the observer rather than piling a second one up.
  runtime.mount(container)
  assert.equal(observed.length, 2)
  runtime.unmount()
  assert.equal(stops.length, 2)
})

test('board-3d runtime falls back to per-tick viewport reads without an observer', () => {
  const callbacks: FrameRequestCallback[] = []
  let viewportReads = 0
  const runtime = createRuntime({
    observeResize: () => null,
    viewUpdateViewport: () => {
      viewportReads += 1
      return false
    },
    requestFrame: (callback) => {
      callbacks.push(callback)
      return callbacks.length
    },
  })
  const container = createContainer()
  runtime.mount(container)

  const tick = callbacks.shift()
  assert.ok(tick)
  tick(16)
  tick(32)
  assert.equal(viewportReads, 3)
})
