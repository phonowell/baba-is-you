import { applyProperties, applyTransforms } from './resolve.js'
import { collectRuleRuntime } from './rule-runtime.js'

import type { GameState, LevelData } from './types.js'

export const createInitialState = (
  level: LevelData,
  levelIndex: number,
): GameState => {
  const baseRuntime = collectRuleRuntime(level.items, level.width, level.height)
  const transformResult = applyTransforms(level.items, baseRuntime)
  const runtime = collectRuleRuntime(
    transformResult.items,
    level.width,
    level.height,
  )
  const items = applyProperties(transformResult.items, runtime)

  return {
    levelIndex,
    title: level.title,
    width: level.width,
    height: level.height,
    items,
    rules: runtime.rules,
    status: 'playing',
    turn: 0,
  }
}

export const markCampaignComplete = (state: GameState): GameState => ({
  ...state,
  status: 'complete',
})
