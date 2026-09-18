import type { GameState } from '../logic/types.js'

export const statusLine = (status: GameState['status']): string => {
  switch (status) {
    case 'win':
      return 'WIN! Press N/Enter for next level, U to undo.'
    case 'lose':
      return 'DEFEAT! Press U to undo, R to restart, Q to menu.'
    case 'complete':
      return 'ALL LEVELS CLEARED! Press N/Enter (or R) to restart, U to undo.'
    default:
      return 'WASD/Arrows move, Space=Wait, U=Undo, R=Restart, Q=Menu'
  }
}
