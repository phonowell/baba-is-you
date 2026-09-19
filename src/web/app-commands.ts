import { MENU_WINDOW_SIZE } from '../view/render-menu-html.js'

import type { GameCommand } from '../view/input.js'
import type { WebAppAction, WebAppStateData } from './app-model.js'

// One command pipeline for both modes: the menu reuses direction verbs
// for list navigation (up/down step, left/right page), `enter` starts
// the highlighted level, and `next` on a won board advances the list.
export const mapGameCommandToAction = (
  cmd: GameCommand,
  state: WebAppStateData,
): WebAppAction | null => {
  // Replay playback is pure spectating: every game command is ignored
  // until the recording finishes — except back, which aborts the
  // playback and exits to the menu rather than taking over the board.
  if (state.replay) {
    return cmd.type === 'back' ? { type: 'return-to-menu' } : null
  }

  if (state.mode === 'menu') {
    switch (cmd.type) {
      case 'move': {
        const step =
          cmd.direction === 'up'
            ? -1
            : cmd.direction === 'down'
              ? 1
              : cmd.direction === 'left'
                ? -MENU_WINDOW_SIZE
                : MENU_WINDOW_SIZE
        return {
          type: 'select-menu-level',
          index: state.menuSelectedLevelIndex + step,
        }
      }
      case 'enter':
      case 'next':
        return { type: 'enter-game', index: state.menuSelectedLevelIndex }
      case 'back':
      case 'undo':
      case 'restart':
      case 'wait':
      case 'noop':
        return null
    }
  }

  switch (cmd.type) {
    case 'move':
      return { type: 'move', direction: cmd.direction }
    case 'wait':
      return { type: 'move', direction: null }
    case 'enter':
      // Enter means nothing on a level board — keep it a true no-op so
      // the press is not counted as handled.
      return null
    case 'undo':
      return state.history.length > 0 ? { type: 'undo' } : null
    case 'restart':
      return {
        type: 'reset-level',
        index: state.levelIndex,
        // A custom (golden-replayed) level restarts in place — it is not
        // in the campaign list, so its own LevelData rides the action.
        ...(state.customLevel ? { level: state.customLevel } : {}),
      }
    case 'next':
      // A finished board hands control to the next campaign level.
      if (state.state.status === 'win' && state.levelIndex < state.levelCount - 1)
        return { type: 'reset-level', index: state.levelIndex + 1 }
      return null
    case 'back':
      return { type: 'return-to-menu' }
    case 'noop':
      return null
  }
}
