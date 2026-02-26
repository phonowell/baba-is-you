import type { Direction } from '../logic/types.js'

export type GameCommand =
  | { type: 'move'; direction: Direction }
  | { type: 'undo' }
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'back-menu' }
  | { type: 'noop' }

export type MenuCommand =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'start' }
  | { type: 'quit-app' }
  | { type: 'noop' }

export type Keypress = {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
}

export const mapGameKeypress = (key: Keypress): GameCommand => {
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

export const mapMenuKeypress = (key: Keypress): MenuCommand => {
  switch (key.name) {
    case 'up':
    case 'w':
      return { type: 'up' }
    case 'down':
    case 's':
      return { type: 'down' }
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
