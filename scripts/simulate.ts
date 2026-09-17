import { levels } from '../src/levels.js'
import { parseLevel } from '../src/logic/parse-level.js'
import { createInitialState } from '../src/logic/state.js'
import { step } from '../src/logic/step.js'
import { render } from '../src/view/render.js'
import { stripAnsi } from '../src/view/render-width.js'

import type { Direction, GameState } from '../src/logic/types.js'

const MOVE_KEYS: Record<string, Direction | null> = {
  d: 'down',
  l: 'left',
  r: 'right',
  u: 'up',
  w: null,
}

const usage = `Usage: tsx scripts/simulate.ts [levelIndex] [moves] [--trace]
  levelIndex  0-based index into src/levels.ts (default 0)
  moves       string of u/d/l/r (move) and w (wait), e.g. "rrdl"
  --trace     print the board after every step`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(usage)
  process.exit(0)
}

const trace = args.includes('--trace')
const positional = args.filter((arg) => !arg.startsWith('--'))

const levelIndex = Number(positional[0] ?? 0)
const level = levels[levelIndex]
if (!level || !Number.isInteger(levelIndex)) {
  console.error(`Invalid level index: ${positional[0] ?? '(none)'}`)
  console.error(usage)
  process.exit(1)
}

const movesArg = positional[1] ?? ''
const moves: Array<Direction | null> = []
for (const char of movesArg.toLowerCase()) {
  if (!(char in MOVE_KEYS)) {
    console.error(`Invalid move '${char}' in "${movesArg}" (use u/d/l/r/w)`)
    process.exit(1)
  }
  moves.push(MOVE_KEYS[char] ?? null)
}

const printState = (state: GameState): void => {
  console.log(stripAnsi(render(state)))
}

let state = createInitialState(parseLevel(level), levelIndex)
console.log(`== level ${levelIndex}: ${state.title} ==`)
printState(state)

for (const [index, move] of moves.entries()) {
  const result = step(state, move)
  const label = move ?? 'wait'
  console.log(`\n> step ${index + 1}: ${label} -> changed=${result.changed}, status=${result.state.status}`)
  state = result.state
  if (trace) printState(state)
}

if (moves.length && !trace) {
  console.log('')
  printState(state)
}
