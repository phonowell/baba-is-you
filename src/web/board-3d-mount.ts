import type { GameState } from '../logic/types.js'
import type { Board3dRendererRuntime } from './board-3d-renderer-runtime.js'

export type Board3dLazyModule = {
  createBoard3dRenderer: () => Board3dRendererRuntime
}

export type LazyBoard3d = {
  // draw 每次重绘都会调它：渲染器未就绪时只记录目标 board，chunk 到达后
  // 一次性 mount + 同步最新 state；就绪后与旧的同步路径完全一致。
  mountAndSync: (board: HTMLElement, state: GameState) => void
  unmount: () => void
  dispose: () => void
  // 已就绪的渲染器（hover/射线拾取用），未加载时为 null。
  renderer: () => Board3dRendererRuntime | null
  // 仅拉取/编译模块，不实例化 WebGL——菜单空闲时预热用。
  preload: () => void
}

type LazyBoard3dOptions = {
  loadModule: () => Promise<Board3dLazyModule>
  // 判定发起挂载的 board 是否仍是当前视图：chunk 到达时用户可能已经
  // 退回菜单或换了关卡，迟到的挂载必须丢弃。
  isCurrentBoard: (board: HTMLElement) => boolean
  // 挂载生效时同步的状态：用最新值而不是发起时的快照，避免竞态丢步。
  latestState: () => GameState
}

export const createLazyBoard3d = (options: LazyBoard3dOptions): LazyBoard3d => {
  const { loadModule, isCurrentBoard, latestState } = options

  let modulePromise: Promise<Board3dLazyModule> | null = null
  let rendererPromise: Promise<Board3dRendererRuntime> | null = null
  let renderer: Board3dRendererRuntime | null = null
  let pendingBoard: HTMLElement | null = null
  let mountQueued = false
  let disposed = false

  const loadModuleOnce = (): Promise<Board3dLazyModule> =>
    (modulePromise ??= loadModule())

  const ensureRenderer = (): Promise<Board3dRendererRuntime> =>
    (rendererPromise ??= loadModuleOnce().then((mod) => {
      const created = mod.createBoard3dRenderer()
      // chunk 在途时 dispose() 已跑过——此刻创建出的 WebGL 上下文无人持有，
      // 立即拆掉，避免漏一个永不被引用的渲染器。
      if (disposed) {
        created.dispose()
        return created
      }
      renderer = created
      return created
    }))

  const applyPendingMount = (ready: Board3dRendererRuntime): void => {
    mountQueued = false
    const board = pendingBoard
    if (disposed || !board || !isCurrentBoard(board)) return
    ready.mount(board)
    ready.sync(latestState())
  }

  const queueMount = (): void => {
    if (mountQueued) return
    mountQueued = true
    void ensureRenderer().then(applyPendingMount, () => {
      // 加载失败（如部署态拉取被拒）：复位缓存，让下一次挂载重试。
      mountQueued = false
      rendererPromise = null
      modulePromise = null
    })
  }

  return {
    mountAndSync: (board, state) => {
      if (disposed) return
      if (renderer) {
        renderer.mount(board)
        renderer.sync(state)
        return
      }
      pendingBoard = board
      queueMount()
    },
    unmount: () => {
      pendingBoard = null
      renderer?.unmount()
    },
    dispose: () => {
      disposed = true
      pendingBoard = null
      renderer?.dispose()
      renderer = null
      rendererPromise = null
    },
    renderer: () => renderer,
    preload: () => {
      // 预热失败不留毒化的缓存 Promise——后续挂载走 ensureRenderer 重试。
      void loadModuleOnce().catch(() => {
        modulePromise = null
      })
    },
  }
}
