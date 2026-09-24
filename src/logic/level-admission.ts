import { isLetterName } from './letter-words.js'
import { WIN_LIKE_PROPS } from './step/win.js'

import type { LevelData, Property } from './types.js'

// Campaign admission: a level only earns a menu slot if a win condition
// can ever exist on its board. Win-like props (`win`/`end`/`done`, the
// same set checkWin honors) only come from rules, and every rule needs
// its word — so the word's presence is the boundary. The sole exception
// is letter units: contiguous letter cells spell dictionary words
// (letter-words.ts), so a board holding 'w','i','n' can form WIN without
// a win tile. Spawns (has/make/write/more) all reference words that
// already exist and can't bootstrap one.
export const levelHasWinCondition = (level: LevelData): boolean => {
  const letterNames = new Set<string>()
  for (const item of level.items) {
    if (!item.isText) continue
    if (WIN_LIKE_PROPS.has(item.name as Property)) return true
    // Only single-cell letter units spell win words — `ab`/`ba` digraphs
    // and `sharp`/`flat` note tiles contain no w/i/n/e/d/o glyphs.
    if (item.name.length === 1 && isLetterName(item.name)) {
      letterNames.add(item.name)
    }
  }
  return [...WIN_LIKE_PROPS].some((word) =>
    [...new Set(word)].every((ch) => letterNames.has(ch)),
  )
}
