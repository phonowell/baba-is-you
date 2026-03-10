import assert from 'node:assert/strict'
import test from 'node:test'

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
    isEmoji: false,
    emojiPhaseOffsetMs: 0,
    rotX: 0,
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
  requestFrame?: RuntimeArgs['requestFrame']
  cancelFrame?: RuntimeArgs['cancelFrame']
}) => {
  const scheduledCallbacks: FrameRequestCallback[] = []
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
  const entityGroup =
    overrides.entityGroup ??
    ({} as Parameters<typeof createBoard3dRendererRuntime>[0]['entityGroup'])
  const viewController = {
    updateViewport: overrides.viewUpdateViewport ?? (() => false),
    updateCamera: () => undefined,
    applyReadabilityGuard: () => undefined,
  }

  const args: RuntimeArgs = {
    renderer,
    composer,
    world,
    entityGroup,
    viewController,
    nodes: overrides.nodes ?? new Map<number, EntityNode>(),
    getMaterial: () => ({}) as never,
    createNode: () => createNode(),
    disposeResources:
      overrides.disposeResources ??
      ((groundVisuals) => groundVisuals),
  }

  if (overrides.rebuildGround) args.rebuildGround = overrides.rebuildGround
  if (overrides.applyNodePoseStep)
    args.applyNodePoseStep = overrides.applyNodePoseStep
  if (overrides.syncNodes) args.syncNodes = overrides.syncNodes
  args.requestFrame =
    overrides.requestFrame ??
    ((callback: FrameRequestCallback) => {
      scheduledCallbacks.push(callback)
      return scheduledCallbacks.length
    })
  args.cancelFrame = overrides.cancelFrame ?? (() => undefined)

  return createBoard3dRendererRuntime(args)
}

test('board-3d runtime does not keep RAF alive for emoji idle micro-motion alone', () => {
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
        playAreaOutline: null,
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
        playAreaOutline: null,
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
  node.shadowMaterial.dispose = () => {
    shadowDisposed += 1
  }
  const nodes = new Map<number, EntityNode>([[7, node]])
  const runtime = createRuntime({
    nodes,
    entityGroup: {
      remove: (value: unknown) => {
        if (value === node.mesh) meshRemoved += 1
        if (value === node.shadow) shadowRemoved += 1
      },
    } as RuntimeArgs['entityGroup'],
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
