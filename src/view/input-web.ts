import type { GameCommand } from './input.js'
import type { Direction } from '../logic/types.js'

export type BrowserKeyboardEvent = {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
}

// Single-character keys normalize to lowercase ('W' -> 'w'); named keys
// ('ArrowUp', 'Enter') keep their DOM value.
const normalizeKey = (key: string): string =>
  key.length === 1 ? key.toLowerCase() : key

// WASD and arrows both emit the shared direction verbs — in game they
// move, in the menu they navigate the grid.
const moveDirectionFor = (key: string): Direction | undefined => {
  switch (key) {
    case 'ArrowUp':
    case 'w':
      return 'up'
    case 'ArrowRight':
    case 'd':
      return 'right'
    case 'ArrowDown':
    case 's':
      return 'down'
    case 'ArrowLeft':
    case 'a':
      return 'left'
    default:
      return undefined
  }
}

export const mapGameKeyboardEvent = (
  event: BrowserKeyboardEvent,
): GameCommand => {
  if (event.ctrlKey || event.metaKey) return { type: 'noop' }

  const direction = moveDirectionFor(normalizeKey(event.key))
  if (direction) return { type: 'move', direction }

  switch (normalizeKey(event.key)) {
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

// Menu grid navigation: WASD/arrows step the selection (rows via
// up/down), PgUp/PgDn page several rows at once, Enter/Space starts the
// highlighted level. The command layer reuses the shared direction
// verbs — the menu interprets `move` as grid navigation.
export const mapMenuKeyboardEvent = (
  event: BrowserKeyboardEvent,
): GameCommand => {
  if (event.ctrlKey || event.metaKey) return { type: 'noop' }

  const direction = moveDirectionFor(normalizeKey(event.key))
  if (direction) return { type: 'move', direction }

  switch (normalizeKey(event.key)) {
    case 'PageUp':
      return { type: 'page', direction: 'up' }
    case 'PageDown':
      return { type: 'page', direction: 'down' }
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
