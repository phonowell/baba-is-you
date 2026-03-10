import { MENU_WINDOW_SIZE } from '../view/render-menu.js'

import type { GameCommand, MenuCommand } from '../view/input.js'
import type { WebAppAction, WebAppStateData } from './app-model.js'

export const mapGameCommandToAction = (
  cmd: GameCommand,
  state: WebAppStateData,
): WebAppAction | null => {
  switch (cmd.type) {
    case 'move':
      return { type: 'move', direction: cmd.direction }
    case 'wait':
      return { type: 'move', direction: null }
    case 'undo':
      return state.history.length > 0 ? { type: 'undo' } : null
    case 'restart':
      return {
        type: 'reset-level',
        index: state.state.status === 'complete' ? 0 : state.levelIndex,
      }
    case 'next':
      if (state.state.status === 'win') {
        if (state.levelIndex === state.levelCount - 1) {
          return { type: 'mark-campaign-complete' }
        }
        return { type: 'reset-level', index: state.levelIndex + 1 }
      }

      if (state.state.status === 'complete') {
        return { type: 'reset-level', index: 0 }
      }

      return null
    case 'back-menu':
      return { type: 'return-to-menu' }
    case 'noop':
      return null
  }
}

export const mapMenuCommandToAction = (
  cmd: MenuCommand,
  state: WebAppStateData,
): WebAppAction | null => {
  switch (cmd.type) {
    case 'up':
      return {
        type: 'select-menu-level',
        index: Math.max(0, state.menuSelectedLevelIndex - 1),
      }
    case 'down':
      return {
        type: 'select-menu-level',
        index: Math.min(state.levelCount - 1, state.menuSelectedLevelIndex + 1),
      }
    case 'page-left':
      return {
        type: 'select-menu-level',
        index: Math.max(0, state.menuSelectedLevelIndex - MENU_WINDOW_SIZE),
      }
    case 'page-right':
      return {
        type: 'select-menu-level',
        index: Math.min(state.levelCount - 1, state.menuSelectedLevelIndex + MENU_WINDOW_SIZE),
      }
    case 'start':
      return { type: 'enter-game', index: state.menuSelectedLevelIndex }
    case 'quit-app':
      return null
    case 'noop':
      return null
  }
}
