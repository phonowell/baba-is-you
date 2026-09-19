import type { GameState } from '../logic/types.js'

export const statusLine = (status: GameState['status']): string => {
  switch (status) {
    case 'win':
      return 'WIN! Press N/Enter for the next level, U/Z to undo.'
    case 'lose':
      return 'DEFEAT! Press U/Z to undo, R to restart, Q for menu.'
    default:
      return 'WASD/Arrows move, Space=Wait, U/Z=Undo, R=Restart, Q=Menu'
  }
}
