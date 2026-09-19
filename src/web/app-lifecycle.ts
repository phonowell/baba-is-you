import type { AppPointerHandlers } from './app-pointer.js'

type AppLifecycleDeps = {
  root: HTMLElement
  handleRootClick: (event: MouseEvent) => void
  handleWindowKeydown: (event: KeyboardEvent) => void
  pointerHandlers?: AppPointerHandlers | null
  draw: () => void
  disposeBoard3d: () => void
  onDispose?: () => void
}

export const registerAppLifecycle = (deps: AppLifecycleDeps): (() => void) => {
  const {
    root,
    handleRootClick,
    handleWindowKeydown,
    pointerHandlers = null,
    draw,
    disposeBoard3d,
    onDispose,
  } = deps

  let resizeTimer = 0
  const handleWindowResize = (): void => {
    clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(draw, 60)
  }

  const onPointerDown = (event: Event): void => {
    pointerHandlers?.onPointerDown(event as PointerEvent)
  }
  const onPointerMove = (event: Event): void => {
    pointerHandlers?.onPointerMove(event as PointerEvent)
  }
  const onPointerUp = (event: Event): void => {
    pointerHandlers?.onPointerUp(event as PointerEvent)
  }
  const onPointerCancel = (event: Event): void => {
    pointerHandlers?.onPointerCancel(event as PointerEvent)
  }
  // Long-press would otherwise pop the browser context menu mid-gesture
  // (Android); nothing on the app surface uses it.
  const onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  const disposeApp = (): void => {
    root.removeEventListener('click', handleRootClick)
    root.removeEventListener('pointerdown', onPointerDown)
    root.removeEventListener('pointermove', onPointerMove)
    root.removeEventListener('pointerup', onPointerUp)
    root.removeEventListener('pointercancel', onPointerCancel)
    root.removeEventListener('contextmenu', onContextMenu)
    window.removeEventListener('keydown', handleWindowKeydown)
    window.removeEventListener('resize', handleWindowResize)
    window.removeEventListener('beforeunload', disposeApp)

    if (resizeTimer) {
      clearTimeout(resizeTimer)
      resizeTimer = 0
    }

    disposeBoard3d()
    onDispose?.()
  }

  root.addEventListener('click', handleRootClick)
  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('pointermove', onPointerMove)
  root.addEventListener('pointerup', onPointerUp)
  root.addEventListener('pointercancel', onPointerCancel)
  root.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('beforeunload', disposeApp)

  return disposeApp
}
