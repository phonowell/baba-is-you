import { applyProperties } from './resolve.js'
import { collectRuleRuntime } from './rule-runtime.js'

import type { GameState, LevelData } from './types.js'

export const createInitialState = (
  level: LevelData,
  levelIndex: number,
): GameState => {
  // The official engine runs conversion() only inside movecommand — never
  // at load — so transforms like `x is all`/`empty is X` first fire after
  // the initial move at post-move positions.
  const runtime = collectRuleRuntime(level.items, level.width, level.height)
  const items = applyProperties(level.items, runtime)

  return {
    levelIndex,
    title: level.title,
    width: level.width,
    height: level.height,
    items,
    rules: runtime.rules,
    overriddenTextIds: runtime.overriddenTextIds,
    rulesSourceItems: level.items,
    status: 'playing',
    turn: 0,
    ...(level.meta ? { meta: level.meta } : {}),
  }
}

