type AppLifecycleDeps = {
  root: HTMLElement
  handleRootClick: (event: MouseEvent) => void
  handleWindowKeydown: (event: KeyboardEvent) => void
  draw: () => void
  disposeBoard3d: () => void
  onDispose?: () => void
}

export const registerAppLifecycle = (deps: AppLifecycleDeps): (() => void) => {
  const {
    root,
    handleRootClick,
    handleWindowKeydown,
    draw,
    disposeBoard3d,
    onDispose,
  } = deps

  let resizeTimer = 0
  const handleWindowResize = (): void => {
    clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(draw, 60)
  }

  const disposeApp = (): void => {
    root.removeEventListener('click', handleRootClick)
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
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('beforeunload', disposeApp)

  return disposeApp
}
