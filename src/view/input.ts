import type { Direction } from '../logic/types.js'

export type GameCommand =
  | { type: 'move'; direction: Direction }
  | { type: 'wait' }
  | { type: 'undo' }
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'back-menu' }
  | { type: 'noop' }

export type MenuCommand =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'page-left' }
  | { type: 'page-right' }
  | { type: 'start' }
  | { type: 'quit-app' }
  | { type: 'noop' }

export type Keypress = {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
}

export type BoardGesture = {
  dx: number
  dy: number
}

// Drag distance (px) that separates a swipe from a tap. Below it the
// gesture is a tap, which plays a wait turn.
export const BOARD_SWIPE_MIN_PX = 24

export const mapBoardGesture = (gesture: BoardGesture): GameCommand => {
  const absX = Math.abs(gesture.dx)
  const absY = Math.abs(gesture.dy)
  if (Math.max(absX, absY) < BOARD_SWIPE_MIN_PX) return { type: 'wait' }
  if (absX >= absY) {
    return { type: 'move', direction: gesture.dx > 0 ? 'right' : 'left' }
  }
  return { type: 'move', direction: gesture.dy > 0 ? 'down' : 'up' }
}

export type GameControlEntry = {
  keys: string
  action: string
}

export const GAME_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'WASD/Arrows/Swipe', action: 'move' },
  { keys: 'Space/Tap', action: 'wait' },
  { keys: 'U', action: 'undo' },
  { keys: 'R', action: 'restart' },
  { keys: 'N/Enter', action: 'next after win' },
  { keys: 'Q', action: 'menu' },
]

export const mapGameKeypress = (key: Keypress): GameCommand => {
  if (key.ctrl || key.meta) return { type: 'noop' }

  switch (key.name) {
    case 'up':
      return { type: 'move', direction: 'up' }
    case 'right':
      return { type: 'move', direction: 'right' }
    case 'down':
      return { type: 'move', direction: 'down' }
    case 'left':
      return { type: 'move', direction: 'left' }
    case 'w':
      return { type: 'move', direction: 'up' }
    case 'd':
      return { type: 'move', direction: 'right' }
    case 's':
      return { type: 'move', direction: 'down' }
    case 'a':
      return { type: 'move', direction: 'left' }
    case 'space':
      return { type: 'wait' }
    case 'u':
      return { type: 'undo' }
    case 'r':
      return { type: 'restart' }
    case 'n':
    case 'return':
    case 'enter':
      return { type: 'next' }
    case 'q':
      return { type: 'back-menu' }
    default:
      return { type: 'noop' }
  }
}

export const MENU_CONTROLS: readonly GameControlEntry[] = [
  { keys: 'W/S or ↑/↓', action: 'select' },
  { keys: 'A/D or ←/→', action: 'page' },
  { keys: 'Enter/N or Click', action: 'start' },
]

export const mapMenuKeypress = (key: Keypress): MenuCommand => {
  if (key.ctrl || key.meta) return { type: 'noop' }

  switch (key.name) {
    case 'up':
    case 'w':
      return { type: 'up' }
    case 'down':
    case 's':
      return { type: 'down' }
    case 'left':
    case 'a':
      return { type: 'page-left' }
    case 'right':
    case 'd':
      return { type: 'page-right' }
    case 'n':
    case 'return':
    case 'enter':
    case 'space':
      return { type: 'start' }
    case 'q':
      return { type: 'quit-app' }
    default:
      return { type: 'noop' }
  }
}
