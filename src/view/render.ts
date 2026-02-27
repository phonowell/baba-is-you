import { CELL_WIDTH } from './render-config.js'
import {
  cellForItem,
  pickItem,
  renderLegend,
  renderRules,
} from './render-helpers.js'
import { statusLine } from './status-line.js'
import { formatCell } from './render-width.js'

import type { GameState, Item } from '../logic/types.js'

export const render = (state: GameState): string => {
  const grid = new Map<number, Item[]>()
  const textNames = new Set<string>()
  for (const item of state.items) {
    if (item.props.includes('hide')) continue

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

  const ruleLines = renderRules(state.rules).map((line) => `  ${line}`)
  const legendLines = renderLegend(state.width * CELL_WIDTH, textNames)

  return [
    `Level ${state.levelIndex + 1}: ${state.title}`,
    statusLine(state.status),
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
