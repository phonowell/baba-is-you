import type { GameCommand } from './input.js'

export type BrowserKeyboardEvent = {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
}

// Single-character keys normalize to lowercase ('W' -> 'w'); named keys
// ('ArrowUp', 'Enter') keep their DOM value.
const normalizeKey = (key: string): string =>
  key.length === 1 ? key.toLowerCase() : key

export const mapGameKeyboardEvent = (
  event: BrowserKeyboardEvent,
): GameCommand => {
  if (event.ctrlKey || event.metaKey) return { type: 'noop' }

  switch (normalizeKey(event.key)) {
    case 'ArrowUp':
    case 'w':
      return { type: 'move', direction: 'up' }
    case 'ArrowRight':
    case 'd':
      return { type: 'move', direction: 'right' }
    case 'ArrowDown':
    case 's':
      return { type: 'move', direction: 'down' }
    case 'ArrowLeft':
    case 'a':
      return { type: 'move', direction: 'left' }
    case ' ':
    case 'Space':
    case 'Spacebar':
      return { type: 'wait' }
    case 'u':
    case 'z':
      return { type: 'undo' }
    case 'r':
      return { type: 'restart' }
    case 'n':
    case 'Enter':
      return { type: 'next' }
    case 'q':
      return { type: 'back' }
    default:
      return { type: 'noop' }
  }
}

// Menu list navigation: W/S and arrows step the selection, A/D and
// left/right page a window at a time, Enter/Space starts the highlighted
// level. The command layer reuses the shared direction verbs — the menu
// interprets `move` as list navigation.
export const mapMenuKeyboardEvent = (
  event: BrowserKeyboardEvent,
): GameCommand => {
  if (event.ctrlKey || event.metaKey) return { type: 'noop' }

  switch (normalizeKey(event.key)) {
    case 'ArrowUp':
    case 'w':
      return { type: 'move', direction: 'up' }
    case 'ArrowDown':
    case 's':
      return { type: 'move', direction: 'down' }
    case 'ArrowLeft':
    case 'a':
      return { type: 'move', direction: 'left' }
    case 'ArrowRight':
    case 'd':
      return { type: 'move', direction: 'right' }
    case 'n':
    case 'Enter':
    case ' ':
    case 'Space':
    case 'Spacebar':
      return { type: 'enter' }
    case 'q':
    case 'Escape':
      return { type: 'back' }
    default:
      return { type: 'noop' }
  }
}
