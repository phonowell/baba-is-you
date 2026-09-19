import type { GameState } from '../logic/types.js'

export const statusLine = (
  status: GameState['status'],
  mode: 'map' | 'game' = 'game',
): string => {
  if (mode === 'map') {
    return 'WASD/Arrows move cursor, Enter=Open, Q=Back'
  }
  switch (status) {
    case 'win':
      return 'WIN! Press N/Enter to return to the map, U/Z to undo.'
    case 'lose':
      return 'DEFEAT! Press U/Z to undo, R to restart, Q to map.'
    default:
      return 'WASD/Arrows move, Space=Wait, U/Z=Undo, R=Restart, Q=Map'
  }
}
