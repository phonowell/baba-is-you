import type { GameState } from '../logic/types.js'

export const statusLine = (status: GameState['status']): string => {
  switch (status) {
    case 'win':
      return 'WIN! Press N/Enter for next level.'
    case 'lose':
      return 'DEFEAT! Press R to restart, Q to menu.'
    case 'complete':
      return 'ALL LEVELS CLEARED! Press N to restart.'
    default:
      return 'WASD/Arrows move, Space=Wait, U=Undo, R=Restart, Q=Menu'
  }
}
