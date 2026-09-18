import { BOARD_SWIPE_MIN_PX, mapBoardGesture } from '../view/input.js'

import type { GameCommand } from '../view/input.js'

type AppPointerViewState = {
  getMode: () => 'menu' | 'game'
  isReferenceDialogOpen: () => boolean
}

// Structural subset of PointerEvent so tests can drive the handlers with
// plain objects, same trick input-web.ts uses for keyboard events.
export type BoardPointerEvent = {
  pointerId: number
  pointerType: string
  clientX: number
  clientY: number
  target: EventTarget | null
  relatedTarget?: EventTarget | null
  preventDefault: () => void
}

type BoardPointerHandlerContext = {
  viewState: AppPointerViewState
  canHandleGameAction: () => boolean
  markGameActionHandled: () => void
  handleGameCommand: (cmd: GameCommand) => boolean
  // Camera parallax feed; absent keeps the handlers input-only.
  setParallaxTarget?: ((nx: number, ny: number) => void) | null
  // Haptics etc. — fired only when a command actually advanced the game.
  onHandledAction?: () => void
}

export type BoardPointerHandlers = {
  onPointerDown: (event: BoardPointerEvent) => void
  onPointerMove: (event: BoardPointerEvent) => void
  onPointerUp: (event: BoardPointerEvent) => void
  onPointerCancel: (event: BoardPointerEvent) => void
  onPointerOut: (event: BoardPointerEvent) => void
}

const clampUnit = (value: number): number =>
  Math.min(1, Math.max(-1, value))

export const createBoardPointerHandlers = (
  context: BoardPointerHandlerContext,
): BoardPointerHandlers => {
  const {
    viewState,
    canHandleGameAction,
    markGameActionHandled,
    handleGameCommand,
    setParallaxTarget = null,
    onHandledAction,
  } = context

  let activePointerId: number | null = null
  let startX = 0
  let startY = 0
  // One press fires at most one move: the swipe consumes the press at the
  // distance threshold instead of waiting for release.
  let consumed = false

  const boardFromTarget = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null
    return target.closest('.board')
  }

  const canInteract = (): boolean =>
    viewState.getMode() === 'game' && !viewState.isReferenceDialogOpen()

  const dispatchCommand = (cmd: GameCommand): void => {
    if (!canHandleGameAction()) return
    if (handleGameCommand(cmd)) {
      markGameActionHandled()
      onHandledAction?.()
    }
  }

  const resetDrag = (): void => {
    activePointerId = null
    consumed = false
  }

  const feedParallax = (event: BoardPointerEvent): void => {
    if (!setParallaxTarget) return
    if (event.pointerType !== 'mouse' || !canInteract()) {
      setParallaxTarget(0, 0)
      return
    }
    const board = boardFromTarget(event.target)
    if (!board) {
      setParallaxTarget(0, 0)
      return
    }
    const rect = board.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    setParallaxTarget(
      clampUnit(((event.clientX - rect.left) / rect.width) * 2 - 1),
      clampUnit(((event.clientY - rect.top) / rect.height) * 2 - 1),
    )
  }

  const onPointerDown = (event: BoardPointerEvent): void => {
    feedParallax(event)
    if (!canInteract()) return
    const board = boardFromTarget(event.target)
    if (!board) return
    if (activePointerId !== null) return
    // Capture on the board so the pointerup lands even when the press is
    // released off-app — a mouse has no implicit capture, and without this
    // the stale drag would fire a phantom swipe on the next hover.
    board.setPointerCapture?.(event.pointerId)
    activePointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    consumed = false
    event.preventDefault()
  }

  const onPointerMove = (event: BoardPointerEvent): void => {
    feedParallax(event)
    if (event.pointerId !== activePointerId || consumed) return
    if (!canInteract()) {
      resetDrag()
      return
    }
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (Math.max(Math.abs(dx), Math.abs(dy)) < BOARD_SWIPE_MIN_PX) return
    consumed = true
    dispatchCommand(mapBoardGesture({ dx, dy }))
  }

  const onPointerUp = (event: BoardPointerEvent): void => {
    if (event.pointerId !== activePointerId) return
    const wasConsumed = consumed
    resetDrag()
    if (wasConsumed || !canInteract()) return
    dispatchCommand(
      mapBoardGesture({ dx: event.clientX - startX, dy: event.clientY - startY }),
    )
  }

  const onPointerCancel = (event: BoardPointerEvent): void => {
    if (event.pointerId === activePointerId) resetDrag()
  }

  // pointerout catches the pointer leaving the app surface entirely —
  // pointermove stops firing there, which would freeze the parallax tilt.
  const onPointerOut = (event: BoardPointerEvent): void => {
    if (!setParallaxTarget) return
    if (event.relatedTarget) return
    setParallaxTarget(0, 0)
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerOut,
  }
}
