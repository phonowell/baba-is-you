import { SWIPE_MIN_PX, mapBoardGesture, mapMapGesture } from '../view/input.js'

import type { GameCommand } from '../view/input.js'

type AppPointerViewState = {
  getMode: () => 'map' | 'game'
  isReferenceDialogOpen: () => boolean
}

// Structural subset of PointerEvent so tests can drive the handlers with
// plain objects, same trick input-web.ts uses for keyboard events.
export type AppPointerEvent = {
  pointerId: number
  clientX: number
  clientY: number
  target: EventTarget | null
  preventDefault: () => void
}

type AppPointerHandlerContext = {
  viewState: AppPointerViewState
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleGameCommand: (cmd: GameCommand) => boolean
  // The forced-landscape frame on portrait phones rotates the whole app
  // (see style.css); client deltas are viewport-space, so they are mapped
  // back into app space before the gesture is classified.
  mapViewportDelta?: (dx: number, dy: number) => { dx: number; dy: number }
  // Haptics etc. — fired only when a command actually advanced the game.
  onHandledAction?: () => void
}

export type AppPointerHandlers = {
  onPointerDown: (event: AppPointerEvent) => void
  onPointerMove: (event: AppPointerEvent) => void
  onPointerUp: (event: AppPointerEvent) => void
  onPointerCancel: (event: AppPointerEvent) => void
}

const IDENTITY_DELTA = (dx: number, dy: number): { dx: number; dy: number } => ({
  dx,
  dy,
})

export const createAppPointerHandlers = (
  context: AppPointerHandlerContext,
): AppPointerHandlers => {
  const {
    viewState,
    canHandleGameAction,
    markGameActionHandled,
    handleGameCommand,
    mapViewportDelta = IDENTITY_DELTA,
    onHandledAction,
  } = context

  let activePointerId: number | null = null
  // The mode the drag started in; a mid-drag mode change (tap → enter a
  // level) invalidates the gesture instead of retargeting it.
  let activeMode: 'map' | 'game' | null = null
  let startX = 0
  let startY = 0
  // One press fires at most one move: the swipe consumes the press at the
  // distance threshold instead of waiting for release.
  let consumed = false

  const closestFromTarget = (
    target: EventTarget | null,
    selector: string,
  ): HTMLElement | null => {
    if (!(target instanceof Element)) return null
    return target.closest(selector)
  }

  const boardReady = (): boolean => !viewState.isReferenceDialogOpen()

  const dispatchGameCommand = (cmd: GameCommand): void => {
    if (!canHandleGameAction()) return
    if (handleGameCommand(cmd)) {
      markGameActionHandled()
      onHandledAction?.()
    }
  }

  const gestureForMode = (mode: 'map' | 'game', dx: number, dy: number): GameCommand =>
    mode === 'map' ? mapMapGesture({ dx, dy }) : mapBoardGesture({ dx, dy })

  const resetDrag = (): void => {
    activePointerId = null
    activeMode = null
    consumed = false
  }

  const onPointerDown = (event: AppPointerEvent): void => {
    if (activePointerId !== null) return
    const mode = viewState.getMode()
    if (mode !== 'map' && mode !== 'game') return
    if (!boardReady()) return
    const board = closestFromTarget(event.target, '.board')
    if (!board) return
    // Capture on the board so the pointerup lands even when the press is
    // released off-app — a mouse has no implicit capture, and without this
    // the stale drag would fire a phantom swipe on the next hover.
    board.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    activePointerId = event.pointerId
    activeMode = mode
    startX = event.clientX
    startY = event.clientY
    consumed = false
  }

  const onPointerMove = (event: AppPointerEvent): void => {
    if (event.pointerId !== activePointerId || consumed) return
    if (activeMode !== viewState.getMode() || !boardReady()) {
      resetDrag()
      return
    }
    const { dx, dy } = mapViewportDelta(
      event.clientX - startX,
      event.clientY - startY,
    )
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return
    consumed = true
    dispatchGameCommand(gestureForMode(viewState.getMode(), dx, dy))
  }

  const onPointerUp = (event: AppPointerEvent): void => {
    if (event.pointerId !== activePointerId) return
    const wasConsumed = consumed
    const mode = activeMode
    resetDrag()
    // Taps resolve through the same gesture map: a press below the swipe
    // threshold is a wait on a level and an enter on the map.
    if (mode !== viewState.getMode() || wasConsumed || !boardReady()) return
    const { dx, dy } = mapViewportDelta(
      event.clientX - startX,
      event.clientY - startY,
    )
    dispatchGameCommand(gestureForMode(viewState.getMode(), dx, dy))
  }

  const onPointerCancel = (event: AppPointerEvent): void => {
    if (event.pointerId === activePointerId) resetDrag()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
