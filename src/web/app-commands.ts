import type { GameStatus } from '../logic/types.js'
import type { Direction } from '../logic/types.js'
import type { GameCommand, MenuCommand } from '../view/input.js'

type GameCommandContext = {
  status: GameStatus
  levelIndex: number
  levelCount: number
  canUndo: boolean
  move: (direction: Direction | null) => boolean
  undo: () => void
  resetLevel: (index: number) => void
  markCampaignComplete: () => void
  returnToMenu: () => void
}

export const runGameCommand = (
  cmd: GameCommand,
  context: GameCommandContext,
): boolean => {
  switch (cmd.type) {
    case 'move':
      return context.move(cmd.direction)
    case 'wait':
      context.move(null)
      return true
    case 'undo':
      if (!context.canUndo) return false
      context.undo()
      return true
    case 'restart':
      if (context.status === 'complete') {
        context.resetLevel(0)
        return true
      }
      context.resetLevel(context.levelIndex)
      return true
    case 'next':
      if (context.status === 'win') {
        if (context.levelIndex === context.levelCount - 1) {
          context.markCampaignComplete()
          return true
        }
        context.resetLevel(context.levelIndex + 1)
        return true
      }

      if (context.status === 'complete') {
        context.resetLevel(0)
        return true
      }

      return false
    case 'back-menu':
      context.returnToMenu()
      return true
    case 'noop':
      return false
  }
}

type MenuCommandContext = {
  selectedLevelIndex: number
  latestLevelIndex: number
  pageSize: number
  setSelectedLevelIndex: (index: number) => void
  enterGame: (index: number) => void
}

export const runMenuCommand = (
  cmd: MenuCommand,
  context: MenuCommandContext,
): boolean => {
  switch (cmd.type) {
    case 'up':
      if (context.selectedLevelIndex > 0) {
        context.setSelectedLevelIndex(context.selectedLevelIndex - 1)
      }
      return true
    case 'down':
      if (context.selectedLevelIndex < context.latestLevelIndex) {
        context.setSelectedLevelIndex(context.selectedLevelIndex + 1)
      }
      return true
    case 'page-left':
      context.setSelectedLevelIndex(
        Math.max(0, context.selectedLevelIndex - context.pageSize),
      )
      return true
    case 'page-right':
      context.setSelectedLevelIndex(
        Math.min(context.latestLevelIndex, context.selectedLevelIndex + context.pageSize),
      )
      return true
    case 'start':
      context.enterGame(context.selectedLevelIndex)
      return true
    case 'quit-app':
      return true
    case 'noop':
      return false
  }
}
