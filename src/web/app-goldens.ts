import manifest from 'baba-goldens'

import { parseLevel } from '../logic/parse-level.js'

import type { LevelData } from '../logic/types.js'

// Golden replays resolved from the build-time manifest (`baba-goldens`,
// see scripts/build-single-html.mjs) — every recorded playthrough ships
// in the bundle; boards without a bound recording simply never show the
// Solution button.

export type GoldenReplay = {
  // Golden file name relative to goldens/, sans .json ('1/10-0').
  name: string
  // Level title — the recorded layout's own, or the level file's Title
  // statement.
  title: string
  inputs: string
  level: LevelData
  // Solver-emitted goldens pin the campaign index they were generated
  // on; fixture recordings leave it undefined and bind by inference.
  levelIndex?: number
}

const resolveGolden = (entry: {
  name: string
  inputs: string
  levelSource: string
  levelData?: LevelData
  levelText?: string
  levelIndex?: number
}): GoldenReplay => {
  const level =
    entry.levelData ??
    (entry.levelText
      ? parseLevel(entry.levelText)
      : { title: '', width: 0, height: 0, items: [] })
  return {
    name: entry.name,
    title: level.title,
    inputs: entry.inputs,
    level,
    ...(entry.levelIndex !== undefined ? { levelIndex: entry.levelIndex } : {}),
  }
}

export const goldenReplays: GoldenReplay[] = manifest
  .map(resolveGolden)
  .filter((replay) => replay.level.width > 0 && replay.level.height > 0)
