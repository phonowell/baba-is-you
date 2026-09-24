import assert from 'node:assert/strict'
import test from 'node:test'

import { levels } from './levels.js'
import { levelHasWinCondition } from './logic/level-admission.js'
import { parseLevel } from './logic/parse-level.js'

test('every campaign level has a win condition', () => {
  // `pnpm import-levels:official` rejects boards with no win-condition
  // word (`missing-win`); this pins the invariant so a hand-edited or
  // drifted pack cannot re-admit an unwinnable level.
  levels.forEach((source, index) => {
    assert.equal(
      levelHasWinCondition(parseLevel(source)),
      true,
      `level ${index} has no win-condition word`,
    )
  })
})
