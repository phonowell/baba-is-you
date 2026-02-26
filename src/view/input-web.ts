import { mapGameKeypress, mapMenuKeypress } from './input.js'

import type { GameCommand, Keypress, MenuCommand } from './input.js'

type BrowserKeyboardEvent = {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
}

const toName = (key: string): Keypress['name'] => {
  switch (key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowRight':
      return 'right'
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'left'
    case 'Enter':
      return 'enter'
    case ' ':
    case 'Spacebar':
      return 'space'
    default: {
      if (key.length === 1) return key.toLowerCase()
      return undefined
    }
  }
}

export const mapBrowserKeypress = (event: BrowserKeyboardEvent): Keypress => {
  const name = toName(event.key)
  return {
    ...(name ? { name } : {}),
    ctrl: Boolean(event.ctrlKey),
    meta: Boolean(event.metaKey),
  }
}

export const mapGameKeyboardEvent = (
  event: BrowserKeyboardEvent,
): GameCommand => mapGameKeypress(mapBrowserKeypress(event))

export const mapMenuKeyboardEvent = (
  event: BrowserKeyboardEvent,
): MenuCommand => mapMenuKeypress(mapBrowserKeypress(event))
