import type { Direction } from '../logic/types.js'

export type GameCommand =
  | { type: 'move'; direction: Direction }
  | { type: 'wait' }
  | { type: 'enter' }
  | { type: 'undo' }
  | { type: 'restart' }
  | { type: 'next' }
  // Menu-only verb: jumps a full grid window instead of stepping a cell.
  | { type: 'page'; direction: 'up' | 'down' }
  | { type: 'back' }
  | { type: 'noop' }

export type SwipeGesture = {
  dx: number
  dy: number
}

// Drag distance (px) that separates a swipe from a tap. Below it the
// gesture is a tap: a wait turn on a level board.
export const SWIPE_MIN_PX = 24

const swipeDirection = (gesture: SwipeGesture): GameCommand => {
  const absX = Math.abs(gesture.dx)
  const absY = Math.abs(gesture.dy)
  if (absX >= absY) {
    return { type: 'move', direction: gesture.dx > 0 ? 'right' : 'left' }
  }
  return { type: 'move', direction: gesture.dy > 0 ? 'down' : 'up' }
}

export const mapBoardGesture = (gesture: SwipeGesture): GameCommand => {
  const absX = Math.abs(gesture.dx)
  const absY = Math.abs(gesture.dy)
  if (Math.max(absX, absY) < SWIPE_MIN_PX) return { type: 'wait' }
  return swipeDirection(gesture)
}

export type GameControlEntry = {
  keys: string
  action: string
}

export const GAME_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'WASD/Arrows/Swipe', action: 'move' },
  { keys: 'Space/Tap', action: 'wait' },
  { keys: 'U/Z', action: 'undo' },
  { keys: 'R', action: 'restart' },
  { keys: 'N/Enter', action: 'next after win' },
  { keys: 'Q', action: 'menu' },
]

export const MENU_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'WASD/Arrows', action: 'select' },
  { keys: 'PgUp/PgDn', action: 'page' },
  { keys: 'Enter/N or Click', action: 'start' },
]

// Touch-first hints: shown instead of the keyboard/gamepad rows when the
// primary pointer is coarse (see the *-controls media query in style.css).
export const GAME_TOUCH_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'Swipe', action: 'move' },
  { keys: 'Tap', action: 'wait' },
  { keys: 'HUD buttons', action: 'undo / restart / menu' },
]
