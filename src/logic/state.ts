import { applyProperties, applyTransforms } from './resolve.js'
import { collectRules } from './rules.js'

import type { GameState, LevelData } from './types.js'

export const createInitialState = (
  level: LevelData,
  levelIndex: number,
): GameState => {
  const baseRules = collectRules(level.items, level.width, level.height)
  const transformResult = applyTransforms(
    level.items,
    baseRules,
    level.width,
    level.height,
  )
  const rules = collectRules(transformResult.items, level.width, level.height)
  const items = applyProperties(transformResult.items, rules)

  return {
    levelIndex,
    title: level.title,
    width: level.width,
    height: level.height,
    items,
    rules,
    status: 'playing',
    turn: 0,
  }
}

export const markCampaignComplete = (state: GameState): GameState => ({
  ...state,
  status: 'complete',
})
