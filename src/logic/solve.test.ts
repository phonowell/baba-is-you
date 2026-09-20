import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeReplayInput } from './replay-input.js'
import { solveState, solveToLayout } from './solve.js'
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

test('solveToLayout reaches a mid-path layout and the chain still wins', () => {
  const initial = createInitialState(WINNABLE, 0)
  const mid = replayTo(initial, 'r')

  const segment = solveToLayout(initial, mid, CAPS)
  assert.equal(segment.kind, 'solved')
  if (segment.kind !== 'solved') return
  assert.equal(segment.state.status, 'playing')

  // The reached state feeds the next segment — a plain win search from
  // there finishes the level.
  const rest = solveState(segment.state, CAPS)
  assert.equal(rest.kind, 'solved')
  if (rest.kind !== 'solved') return
  assert.equal(replayTo(initial, segment.inputs + rest.inputs).status, 'win')
})

test('solveToLayout surfaces an early win instead of the waypoint', () => {
  const initial = createInitialState(WINNABLE, 0)
  // The "waypoint" is a layout past the flag — BFS bumps into the win
  // first and returns it rather than chasing the stale target.
  const beyond = replayTo(initial, 'rrr')
  const segment = solveToLayout(initial, beyond, CAPS)
  assert.equal(segment.kind, 'solved')
  if (segment.kind !== 'solved') return
  assert.equal(segment.state.status, 'win')
})

// baba at (0,1), rock at (2,1) blocking the corridor, flag at (4,1):
// 'rrrr' — push the rock twice onto the flag's cell, step on. Only the
// macro strategy treats that push chain as single decisions.
const PUSH = parseLevel(
  'Title Push; Size 6x3; baba 0,1; rock 2,1; flag 4,1; Baba 0,0; Is 1,0; You 2,0; Rock 0,2; Is 1,2; Push 2,2; Flag 3,0; Is 4,0; Win 5,0',
)

test('macro strategy walks to a goal in one decision', () => {
  const initial = createInitialState(WINNABLE, 0)
  const result = solveState(initial, CAPS, 'macro')

  assert.equal(result.kind, 'solved')
  if (result.kind !== 'solved') return
  assert.equal(result.inputs, 'rrr')
  assert.equal(replayTo(initial, result.inputs).status, 'win')
})

test('macro strategy pushes blockers out of the corridor', () => {
  const initial = createInitialState(PUSH, 0)
  const result = solveState(initial, CAPS, 'macro')

  assert.equal(result.kind, 'solved')
  if (result.kind !== 'solved') return
  assert.equal(replayTo(initial, result.inputs).status, 'win')
})
