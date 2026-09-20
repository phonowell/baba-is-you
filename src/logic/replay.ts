import { createHash } from 'node:crypto'

import { decodeReplayInput } from './replay-input.js'
import { createInitialState } from './state.js'
import { step } from './step.js'

import type { Direction, GameState, LevelData } from './types.js'

// Replay support shared by golden tests and tooling.
//
// Input string encoding: `u/d/l/r` moves, `w` waits, `z` undoes one
// committed move (undo pops the pre-move state and never empties the
// initial frame) — decoded by `replay-input.ts`, the codec's single
// source shared with the web playback driver.
//
// Inputs are applied unconditionally — matching the predecessor's replay,
// which keeps simulating MOVE/SHIFT after a loss (there is no dead-state
// input gate in its `step`). The win/lose input gate lives in the caller.

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

// Effective-path compression: the recorded inputs may detour through
// `z` undos and no-op moves — simulating the history stack and keeping
// the codes whose states survived yields a z-free path that determinism
// guarantees reaches the same final state.
export const compressInputs = (level: LevelData, inputs: string): string => {
  const history: Array<{ state: GameState; code: string }> = [
    { state: createInitialState(level, 0), code: '' },
  ]
  for (const code of inputs) {
    const decoded = decodeReplayInput(code)
    if (decoded.kind === 'skip') continue
    if (decoded.kind === 'undo') {
      if (history.length > 1) history.pop()
      continue
    }
    const current = history[history.length - 1]
    if (!current) break
    const result = step(current.state, decoded.direction)
    if (result.changed) history.push({ state: result.state, code })
  }
  return history
    .slice(1)
    .map((entry) => entry.code)
    .join('')
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
    const decoded = decodeReplayInput(code)
    if (decoded.kind === 'skip') continue
    if (decoded.kind === 'undo') {
      if (history.length > 1) history.pop()
    } else {
      const result = step(current, decoded.direction)
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
