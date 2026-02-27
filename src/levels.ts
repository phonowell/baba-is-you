import { levels as levels_00 } from './levels-data/00-official.js'
import { levels as levels_01 } from './levels-data/01-official.js'
import { levels as levels_02 } from './levels-data/02-official.js'
import { levels as levels_03 } from './levels-data/03-official.js'
import { levels as levels_04 } from './levels-data/04-official.js'

export const levels = [
  ...levels_00,
  ...levels_01,
  ...levels_02,
  ...levels_03,
  ...levels_04,
] as const
