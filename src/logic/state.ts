import { applyProperties, applyTransforms } from './resolve.js'
import { collectRuleRuntime } from './rule-runtime.js'

import type { GameState, LevelData } from './types.js'

export const createInitialState = (
  level: LevelData,
  levelIndex: number,
): GameState => {
  const baseRuntime = collectRuleRuntime(level.items, level.width, level.height)
  const transformResult = applyTransforms(level.items, baseRuntime)
  // No transform → the second parse would rescan an identical layout and
  // produce the same rules and cell index as `baseRuntime`.
  const runtime = transformResult.changed
    ? collectRuleRuntime(transformResult.items, level.width, level.height)
    : baseRuntime
  const items = applyProperties(transformResult.items, runtime)

  return {
    levelIndex,
    title: level.title,
    width: level.width,
    height: level.height,
    items,
    rules: runtime.rules,
    overriddenTextIds: runtime.overriddenTextIds,
    rulesSourceItems: transformResult.items,
    status: 'playing',
    turn: 0,
    ...(level.meta ? { meta: level.meta } : {}),
  }
}

