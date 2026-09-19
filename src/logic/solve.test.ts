import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeReplayInput } from './replay-input.js'
import { solveState } from './solve.js'
import { parseLevel } from './parse-level.js'
import { createInitialState } from './state.js'
import { step } from './step.js'

import type { GameState } from './types.js'

const CAPS = { maxDepth: 32, maxStates: 100_000, deadlineMs: 10_000 }

// baba at (0,1), flag at (3,1): three rights win. The wall box in the
// second fixture seals baba in — provably unwinnable.
const WINNABLE = parseLevel(
  'Title Win; Size 4x3; baba 0,1; flag 3,1; Baba 0,0; Is 1,0; You 2,0; Flag 0,2; Is 1,2; Win 2,2',
)
const SEALED = parseLevel(
  'Title Sealed; Size 5x5; baba 2,2; wall 1,1 2,1 3,1 1,2 3,2 1,3 2,3 3,3; Baba 0,0; Is 1,0; You 2,0; Wall 0,4; Is 1,4; Stop 2,4',
)

const replayTo = (initial: GameState, inputs: string): GameState => {
  let state = initial
  for (const code of inputs) {
    const decoded = decodeReplayInput(code)
    if (decoded.kind !== 'move') continue
    const result = step(state, decoded.direction)
    if (result.changed) state = result.state
  }
  return state
}

test('solveState finds the shortest path and it replays to a win', () => {
  const initial = createInitialState(WINNABLE, 0)
  const result = solveState(initial, CAPS)

  assert.equal(result.kind, 'solved')
  if (result.kind !== 'solved') return
  assert.equal(result.inputs, 'rrr')
  assert.equal(replayTo(initial, result.inputs).status, 'win')
})

test('solveState exhausts the frontier on a sealed level', () => {
  const initial = createInitialState(SEALED, 0)
  const result = solveState(initial, CAPS)

  // Every reachable position is explored: no wait-loop can resurrect a
  // walled-in you, so this is a genuine unwinnable verdict.
  assert.equal(result.kind, 'exhausted')
})

test('solveState reports a depth cutoff instead of a wrong answer', () => {
  const initial = createInitialState(WINNABLE, 0)
  const result = solveState(initial, { ...CAPS, maxDepth: 1 })

  assert.equal(result.kind, 'cutoff')
  if (result.kind === 'cutoff') assert.equal(result.reason, 'depth')
})

test('solveState reports a state-space cutoff on a tiny visited cap', () => {
  const initial = createInitialState(WINNABLE, 0)
  const result = solveState(initial, { ...CAPS, maxStates: 2 })

  assert.equal(result.kind, 'cutoff')
  if (result.kind === 'cutoff') assert.equal(result.reason, 'states')
})

test('greedy strategy also solves and returns a replayable path', () => {
  const initial = createInitialState(WINNABLE, 0)
  const result = solveState(initial, CAPS, 'greedy')

  assert.equal(result.kind, 'solved')
  if (result.kind !== 'solved') return
  assert.equal(replayTo(initial, result.inputs).status, 'win')
})
