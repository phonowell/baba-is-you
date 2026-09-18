import { createHash } from 'node:crypto'

import { createInitialState } from './state.js'
import { step } from './step.js'

import type { Direction, GameState, LevelData } from './types.js'

// Replay support shared by golden tests and tooling.
//
// Input string encoding: `u/d/l/r` moves, `w` waits, `z` undoes one
// committed move (mirrors the CLI history stack: undo pops the pre-move
// state and never empties the initial frame).
//
// Inputs are applied unconditionally — matching the predecessor's replay,
// which keeps simulating MOVE/SHIFT after a loss (there is no dead-state
// input gate in its `step`). The win/lose input gate lives in the CLI.

const INPUT_DIRS: Record<string, Direction> = {
  u: 'up',
  d: 'down',
  l: 'left',
  r: 'right',
}

export const encodeInput = (direction: Direction | null): string =>
  direction === null ? 'w' : direction[0] ?? 'w'

export const serializeState = (state: GameState): string => {
  const items = state.items
    .map(
      (item) =>
        `${item.name}${item.dir ? `@${item.dir}` : ''}${item.isText ? '!' : ''}@${item.x},${item.y}(${[...item.props].sort().join('+')})`,
    )
    .join(';')
  return `${state.status}|${items}`
}

export const hashState = (state: GameState): string =>
  createHash('sha256').update(serializeState(state)).digest('hex').slice(0, 16)

export type ReplayResult = {
  initial: string
  snapshots: string[]
  hashes: string[]
  finalStatus: GameState['status']
  states: GameState[]
}

export const replayLevel = (
  level: LevelData,
  inputs: string,
): ReplayResult => {
  const history: GameState[] = [createInitialState(level, 0)]
  const snapshots: string[] = []
  const hashes: string[] = []
  const states: GameState[] = []

  for (const code of inputs) {
    const current = history[history.length - 1]
    if (!current) break
    if (code === 'z') {
      if (history.length > 1) history.pop()
    } else {
      const direction = code === 'w' ? null : INPUT_DIRS[code]
      if (direction === undefined) continue
      const result = step(current, direction)
      if (result.changed) history.push(result.state)
    }
    const last = history[history.length - 1]
    if (!last) break
    snapshots.push(serializeState(last))
    hashes.push(hashState(last))
    states.push(last)
  }

  const last = history[history.length - 1]
  return {
    initial: serializeState(history[0] ?? createInitialState(level, 0)),
    snapshots,
    hashes,
    finalStatus: last?.status ?? 'playing',
    states,
  }
}
