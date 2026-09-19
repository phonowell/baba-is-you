import type { Direction } from '../logic/types.js'

export type GameCommand =
  | { type: 'move'; direction: Direction }
  | { type: 'wait' }
  | { type: 'enter' }
  | { type: 'undo' }
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'noop' }

export type SwipeGesture = {
  dx: number
  dy: number
}

// Drag distance (px) that separates a swipe from a tap. Below it the
// gesture is a tap: a wait turn on a level, an enter press on the map.
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

// Map gestures ride the same rail-hop input as keys: a swipe walks the
// cursor one cell, a tap is the enter press (icon under the cursor).
export const mapMapGesture = (gesture: SwipeGesture): GameCommand => {
  const absX = Math.abs(gesture.dx)
  const absY = Math.abs(gesture.dy)
  if (Math.max(absX, absY) < SWIPE_MIN_PX) return { type: 'enter' }
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
  { keys: 'Q', action: 'map' },
]

export const MAP_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'WASD/Arrows/Swipe', action: 'move cursor' },
  { keys: 'Enter/Space/Tap', action: 'enter' },
  { keys: 'U/Z', action: 'undo' },
  { keys: 'R', action: 'reset map' },
  { keys: 'Q/Esc', action: 'back' },
]

// Touch-first hints: shown instead of the keyboard/gamepad rows when the
// primary pointer is coarse (see the *-controls media query in style.css).
export const MAP_TOUCH_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'Swipe', action: 'move cursor' },
  { keys: 'Tap', action: 'enter' },
]

export const GAME_TOUCH_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'Swipe', action: 'move' },
  { keys: 'Tap', action: 'wait' },
  { keys: 'HUD buttons', action: 'undo / restart / map' },
]
