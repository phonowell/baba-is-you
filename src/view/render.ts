import { CELL_WIDTH } from './render-config.js'
import {
  cellForItem,
  pickItem,
  renderLegend,
  renderRules,
} from './render-helpers.js'
import { formatCell } from './render-width.js'

import type { GameState, Item } from '../logic/types.js'

export const render = (state: GameState): string => {
  const grid = new Map<number, Item[]>()
  const textNames = new Set<string>()
  for (const item of state.items) {
    const key = item.y * state.width + item.x
    const list = grid.get(key) ?? []
    list.push(item)
    grid.set(key, list)
    if (item.isText) textNames.add(item.name)
  }

  const rows: string[] = []
  for (let y = 0; y < state.height; y += 1) {
    let row = ''
    for (let x = 0; x < state.width; x += 1) {
      const list = grid.get(y * state.width + x) ?? []
      if (!list.length) {
        row += formatCell('.')
        continue
      }
      row += cellForItem(pickItem(list))
    }
    rows.push(row)
  }

  const statusLine =
    state.status === 'win'
      ? 'WIN! Press N/Enter for next level.'
      : state.status === 'lose'
        ? 'DEFEAT! Press R to restart, Q to menu.'
        : state.status === 'complete'
          ? 'ALL LEVELS CLEARED! Press N to restart.'
          : 'WASD/Arrows move, U=Undo, R=Restart, Q=Menu'

  const ruleLines = renderRules(state.rules).map((line) => `  ${line}`)
  const legendLines = renderLegend(state.width * CELL_WIDTH, textNames)

  return [
    `Level ${state.levelIndex + 1}: ${state.title}`,
    statusLine,
    '',
    ...rows,
    '',
    'Rules:',
    ...ruleLines,
    '',
    'Legend:',
    ...legendLines,
  ].join('\n')
}
