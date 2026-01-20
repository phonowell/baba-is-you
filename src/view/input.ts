import type { Direction } from '../logic/types.js'

export type Command =
  | { type: 'move'; direction: Direction }
  | { type: 'undo' }
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'quit' }
  | { type: 'noop' }

export type Keypress = {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
}

export const mapKeypress = (key: Keypress): Command => {
  if (key.ctrl && key.name === 'c') return { type: 'quit' }

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
      return { type: 'quit' }
    default:
      return { type: 'noop' }
  }
}
