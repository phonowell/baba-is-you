import type { GameCommand } from '../view/input.js'
import type { WebAppAction, WebAppStateData } from './app-model.js'

// One command pipeline for both modes — map navigation reuses the same
// GameCommand verbs: `enter` opens the icon under the cursor, `back`
// leaves to the parent map, and a post-win `next` returns to the map
// instead of advancing a campaign index.
export const mapGameCommandToAction = (
  cmd: GameCommand,
  state: WebAppStateData,
): WebAppAction | null => {
  // Replay playback is pure spectating: every game command is ignored
  // until the recording finishes — except back, which aborts the
  // playback and exits to the map rather than taking over the board.
  if (state.replay) {
    return cmd.type === 'back' ? { type: 'leave-node' } : null
  }

  if (state.mode === 'map') {
    switch (cmd.type) {
      case 'move':
        return { type: 'move', direction: cmd.direction }
      case 'enter':
      case 'next':
        return { type: 'enter-node' }
      case 'undo':
        return state.history.length > 0 ? { type: 'undo' } : null
      case 'restart':
        return { type: 'reset-level', index: state.levelIndex }
      case 'back':
        return { type: 'leave-node' }
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
      // There is no flat level list to advance through — a finished board
      // just hands control back to the map it was entered from.
      if (state.state.status === 'win') return { type: 'leave-node' }
      return null
    case 'back':
      return { type: 'leave-node' }
    case 'noop':
      return null
  }
}
