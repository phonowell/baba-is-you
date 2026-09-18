import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { levels } from '../src/levels.js'
import {
  applyEnter,
  applyLeave,
  createOverworldSession,
  placeCursor,
  resolveEnterTarget,
} from '../src/logic/overworld.js'
import { parseAsciiLevel } from '../src/logic/parse-ascii-level.js'
import { parseLevel } from '../src/logic/parse-level.js'
import { createInitialState } from '../src/logic/state.js'
import { step } from '../src/logic/step.js'
import { loadLevelGraph } from '../src/tools/level-graph.js'
import { printBoard } from '../src/tools/print-board.js'

import type { Direction, GameState, LevelData } from '../src/logic/types.js'
import type { OverworldSession } from '../src/logic/overworld.js'

const MOVE_KEYS: Record<string, Direction | null> = {
  d: 'down',
  l: 'left',
  r: 'right',
  u: 'up',
  w: null,
}

const usage = `Usage: tsx scripts/simulate.ts [levelIndex|--ascii <file>] [moves] [--trace]
  levelIndex  0-based index into src/levels.ts (default 0)
  --ascii     load a levels/*.txt ASCII level instead of an imported one
              (index.txt maps get an overworld session: e=enter, b=leave)
  moves       string of u/d/l/r (move), w (wait), e (enter), b (leave)
  --trace     print the board after every step`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(usage)
  process.exit(0)
}

const trace = args.includes('--trace')
const asciiIx = args.indexOf('--ascii')
const positional = args.filter(
  (arg, ix) => !arg.startsWith('--') && (asciiIx < 0 || ix !== asciiIx + 1),
)

let levelIndex = Number(positional[0] ?? 0)
let levelData: LevelData | undefined
let label: string
let asciiPath: string | undefined
if (asciiIx >= 0) {
  asciiPath = args[asciiIx + 1]
  if (!asciiPath) {
    console.error('Missing file after --ascii')
    console.error(usage)
    process.exit(1)
  }
  levelData = parseAsciiLevel(readFileSync(asciiPath, 'utf8'), asciiPath)
  levelIndex = -1
  label = asciiPath
} else {
  const level = levels[levelIndex]
  if (!level || !Number.isInteger(levelIndex)) {
    console.error(`Invalid level index: ${positional[0] ?? '(none)'}`)
    console.error(usage)
    process.exit(1)
  }
  levelData = parseLevel(level)
  label = `level ${levelIndex}`
}

const movesArg = positional[asciiIx >= 0 ? 0 : 1] ?? ''
const moves: Array<Direction | null | 'enter' | 'leave'> = []
for (const char of movesArg.toLowerCase()) {
  if (char === 'e') {
    moves.push('enter')
    continue
  }
  if (char === 'b') {
    moves.push('leave')
    continue
  }
  if (!(char in MOVE_KEYS)) {
    console.error(`Invalid move '${char}' in "${movesArg}" (use u/d/l/r/w/e/b)`)
    process.exit(1)
  }
  moves.push(MOVE_KEYS[char] ?? null)
}

const printState = (state: GameState): void => {
  console.log(printBoard(state))
}

// Map files pull their directory into an overworld session so `e`/`b`
// can dive into level icons and return to the parent map.
let session: OverworldSession | undefined
let state: GameState
if (asciiPath?.endsWith('index.txt')) {
  const root = loadLevelGraph(dirname(asciiPath))
  if (!root) {
    console.error(`Cannot build level graph for ${asciiPath}`)
    process.exit(1)
  }
  session = createOverworldSession(root)
  const node = session.stack[session.stack.length - 1]
  levelData = parseAsciiLevel(readFileSync(node?.node.file ?? asciiPath, 'utf8'), node?.node.file)
  state = createInitialState(levelData, -1)
  state = { ...state, items: placeCursor(state.items, undefined) }
} else {
  state = createInitialState(levelData, levelIndex)
}

console.log(`== ${label}: ${state.title} ==`)
printState(state)

const loadTransitionNode = (
  file: string,
  returnTo: Parameters<typeof placeCursor>[1],
): void => {
  levelData = parseAsciiLevel(readFileSync(file, 'utf8'), file)
  const next = createInitialState(levelData, -1)
  state = { ...next, items: placeCursor(next.items, returnTo) }
  label = file
  console.log(`  -> ${file}`)
  printState(state)
}

for (const [index, move] of moves.entries()) {
  if (move === 'enter' || move === 'leave') {
    if (!session) {
      console.log(`\n> step ${index + 1}: ${move} -> ignored (no overworld session)`)
      continue
    }
    const top = session.stack[session.stack.length - 1]
    if (move === 'leave' || state.status === 'win') {
      const { session: next, transition } = applyLeave(session)
      session = next
      console.log(`\n> step ${index + 1}: leave -> ${transition.type}`)
      if (transition.type === 'return')
        loadTransitionNode(transition.node.file, transition.returnTo)
      continue
    }
    const target = resolveEnterTarget(state.items)
    const { session: next, transition } = applyEnter(session, target)
    session = next
    console.log(`\n> step ${index + 1}: enter -> ${transition.type}`)
    if (transition.type === 'enter') loadTransitionNode(transition.node.file, undefined)
    else if (transition.type === 'return')
      loadTransitionNode(transition.node.file, transition.returnTo)
    if (!top) continue
    continue
  }
  const result = step(state, move)
  const labelText = move ?? 'wait'
  console.log(`\n> step ${index + 1}: ${labelText} -> changed=${result.changed}, status=${result.state.status}`)
  state = result.state
  if (trace) printState(state)
}

if (moves.length && !trace) {
  console.log('')
  printState(state)
}
