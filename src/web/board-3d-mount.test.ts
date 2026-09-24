import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'
import { createLazyBoard3d } from './board-3d-mount.js'

import type { GameState } from '../logic/types.js'
import type { Board3dRendererRuntime } from './board-3d-renderer-runtime.js'
import type { Board3dLazyModule } from './board-3d-mount.js'

const state = (): GameState =>
  createInitialState(
    parseLevel('title T; size 4x3; Baba 0,0; Is 1,0; You 2,0'),
    0,
  )

// A renderer stub that records calls — the lazy seam only needs
// mount/sync/unmount/dispose; the rest satisfies the type.
const makeRenderer = () => {
  const calls: string[] = []
  const renderer: Board3dRendererRuntime = {
    mount: (board) => calls.push(`mount:${board.tagName}`),
    sync: (s) => calls.push(`sync:${s.turn}`),
    unmount: () => calls.push('unmount'),
    dispose: () => calls.push('dispose'),
    setHoverAtPoint: () => null,
    clearHover: () => undefined,
    prewarm: () => calls.push('prewarm'),
    isPrewarmed: () => true,
    qualityTier: () => 0,
  }
  return { renderer, calls }
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const board = (): HTMLElement =>
  ({ tagName: 'DIV', isConnected: true }) as unknown as HTMLElement

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLazyBoard3d', () => {
  it('mounts with the latest state once the chunk arrives', async () => {
    const { renderer, calls } = makeRenderer()
    const mod = deferred<Board3dLazyModule>()
    const lazy = createLazyBoard3d({
      loadModule: () => mod.promise,
      isCurrentBoard: () => true,
      latestState: () => latest,
    })
    let latest = state()

    const el = board()
    lazy.mountAndSync(el, latest)
    assert.deepEqual(calls, [])

    // A second draw before the chunk resolves just re-marks the board —
    // no duplicate mount queues up.
    latest = { ...latest, turn: 7 }
    lazy.mountAndSync(el, latest)
    mod.resolve({ createBoard3dRenderer: () => renderer })
    await flush()

    assert.deepEqual(calls, ['mount:DIV', 'sync:7'])
    assert.equal(lazy.renderer(), renderer)
  })

  it('drops a pending mount when the board was unmounted before arrival', async () => {
    const { calls } = makeRenderer()
    const mod = deferred<Board3dLazyModule>()
    const el = board()
    let current: HTMLElement | null = el
    const lazy = createLazyBoard3d({
      loadModule: () => mod.promise,
      isCurrentBoard: (b) => b === current,
      latestState: state,
    })

    lazy.mountAndSync(el, state())
    lazy.unmount()
    current = null
    mod.resolve({
      createBoard3dRenderer: () => makeRenderer().renderer,
    })
    await flush()

    assert.deepEqual(calls, [])
  })

  it('passes straight through once the renderer exists', async () => {
    const { renderer, calls } = makeRenderer()
    const lazy = createLazyBoard3d({
      loadModule: () =>
        Promise.resolve({ createBoard3dRenderer: () => renderer }),
      isCurrentBoard: () => true,
      latestState: state,
    })
    lazy.mountAndSync(board(), state())
    await flush()
    calls.length = 0

    const el = board()
    lazy.mountAndSync(el, state())
    assert.deepEqual(calls, ['mount:DIV', 'sync:0'])
  })

  it('retries the load after a rejected module fetch', async () => {
    const { renderer, calls } = makeRenderer()
    let attempt = 0
    const lazy = createLazyBoard3d({
      loadModule: () => {
        attempt += 1
        return attempt === 1
          ? Promise.reject(new Error('network'))
          : Promise.resolve({ createBoard3dRenderer: () => renderer })
      },
      isCurrentBoard: () => true,
      latestState: state,
    })

    const el = board()
    lazy.mountAndSync(el, state())
    await flush()
    assert.deepEqual(calls, [])
    assert.equal(attempt, 1)

    lazy.mountAndSync(el, state())
    await flush()
    assert.equal(attempt, 2)
    assert.deepEqual(calls, ['mount:DIV', 'sync:0'])
  })

  it('blocks mounts after dispose and keeps the renderer gone', async () => {
    const { renderer, calls } = makeRenderer()
    const lazy = createLazyBoard3d({
      loadModule: () =>
        Promise.resolve({ createBoard3dRenderer: () => renderer }),
      isCurrentBoard: () => true,
      latestState: state,
    })
    lazy.mountAndSync(board(), state())
    await flush()

    lazy.dispose()
    assert.deepEqual(calls.at(-1), 'dispose')
    assert.equal(lazy.renderer(), null)

    lazy.mountAndSync(board(), state())
    await flush()
    assert.deepEqual(calls.filter((c) => c.startsWith('mount')).length, 1)
  })

  it('preload builds the renderer and warms shaders ahead of mount', async () => {
    let created = 0
    let loaded = 0
    const { renderer, calls } = makeRenderer()
    const lazy = createLazyBoard3d({
      loadModule: () => {
        loaded += 1
        return Promise.resolve({
          createBoard3dRenderer: () => {
            created += 1
            return renderer
          },
        })
      },
      isCurrentBoard: () => true,
      latestState: state,
    })

    lazy.preload()
    await flush()
    assert.equal(loaded, 1)
    // The renderer is built AND warmed at menu idle — the first board
    // mount reuses it instead of paying construction + compile on entry.
    assert.equal(created, 1)
    assert.deepEqual(calls, ['prewarm'])
    assert.equal(lazy.renderer(), renderer)

    lazy.mountAndSync(board(), state())
    await flush()
    assert.equal(created, 1)
    assert.deepEqual(calls.slice(-2), ['mount:DIV', 'sync:0'])
  })

  it('keeps the renderer cached when prewarm throws', async () => {
    const { renderer, calls } = makeRenderer()
    renderer.prewarm = () => {
      throw new Error('gl lost')
    }
    const lazy = createLazyBoard3d({
      loadModule: () =>
        Promise.resolve({ createBoard3dRenderer: () => renderer }),
      isCurrentBoard: () => true,
      latestState: state,
    })

    lazy.preload()
    await flush()
    // A failed warm-up is best-effort: the renderer stays cached and the
    // next mount still works — the first frame just pays compile as before.
    assert.equal(lazy.renderer(), renderer)
    lazy.mountAndSync(board(), state())
    await flush()
    assert.deepEqual(calls, ['mount:DIV', 'sync:0'])
  })
})
