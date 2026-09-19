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
  requestFrame?: RuntimeArgs['requestFrame']
  cancelFrame?: RuntimeArgs['cancelFrame']
  advanceSpriteFrames?: RuntimeArgs['advanceSpriteFrames']
  scheduleTimer?: RuntimeArgs['scheduleTimer']
  cancelTimer?: RuntimeArgs['cancelTimer']
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
  let meshRemoved = 0
  let shadowRemoved = 0
  let shadowDisposed = 0
  const node = createNode()
  node.despawnStartMs = 5
  node.shadowMaterial.dispose = () => {
    shadowDisposed += 1
  }
  const nodes = new Map<number, EntityNode>([[7, node]])
  const runtime = createRuntime({
    nodes,
    entityGroup: Object.assign(new Group(), {
      remove: (value: unknown) => {
        if (value === node.mesh) meshRemoved += 1
        if (value === node.shadow) shadowRemoved += 1
      },
    }) as RuntimeArgs['entityGroup'],
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
  assert.equal(meshRemoved, 1)
  assert.equal(shadowRemoved, 1)
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
