import {
  MENU_GRID_COLUMNS,
  MENU_PAGE_ROWS,
} from '../view/render-menu-html.js'

import type { GameCommand } from '../view/input.js'
import type { WebAppAction, WebAppStateData } from './app-model.js'

// One command pipeline for both modes: the menu reuses direction verbs
// for grid navigation (left/right step a cell, up/down step a row),
// `page` jumps rows, `enter` starts the highlighted level, and `next`
// on a won board advances the list.
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
    // The list is circular — stepping past either end re-enters on the
    // far side. Vertical movement wraps inside the same column (the
    // short last row means columns can differ by one cell), so a
    // wrapped step can land back on the start cell: that maps to no
    // action rather than a selection that changes nothing.
    const total = state.levelCount
    const index = state.menuSelectedLevelIndex
    const column = index % MENU_GRID_COLUMNS
    const row = Math.floor(index / MENU_GRID_COLUMNS)
    const columnRows = Math.ceil((total - column) / MENU_GRID_COLUMNS)
    const wrapRow = (rowDelta: number): number =>
      ((((row + rowDelta) % columnRows) + columnRows) % columnRows) *
        MENU_GRID_COLUMNS +
      column
    const select = (next: number): WebAppAction | null =>
      next === index ? null : { type: 'select-menu-level', index: next }

    switch (cmd.type) {
      case 'move': {
        if (cmd.direction === 'left' || cmd.direction === 'right') {
          const step = cmd.direction === 'left' ? -1 : 1
          return select((index + step + total) % total)
        }
        return select(wrapRow(cmd.direction === 'up' ? -1 : 1))
      }
      case 'page':
        return select(
          wrapRow(cmd.direction === 'up' ? -MENU_PAGE_ROWS : MENU_PAGE_ROWS),
        )
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
    case 'page':
    case 'noop':
      return null
  }
}
