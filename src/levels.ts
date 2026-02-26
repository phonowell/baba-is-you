import { levels as levels_00 } from './levels-data/00-root.js'
import { levels as levels_01 } from './levels-data/01-1-the-lake.js'
import { levels as levels_02 } from './levels-data/02-2-solitary-island.js'
import { levels as levels_03 } from './levels-data/03-3-temple-ruins.js'
import { levels as levels_04 } from './levels-data/04-4-forest-of-fall.js'
import { levels as levels_05 } from './levels-data/05-5-deep-forest.js'
import { levels as levels_06 } from './levels-data/06-6-rocket-trip.js'

export const levels = [
  ...levels_00,
  ...levels_01,
  ...levels_02,
  ...levels_03,
  ...levels_04,
  ...levels_05,
  ...levels_06,
] as const
