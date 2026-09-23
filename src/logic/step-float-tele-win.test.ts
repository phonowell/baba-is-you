import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialState } from './state.js'
import { step } from './step.js'

import type { LevelData, LevelItem } from './types.js'
import type { GameState } from './game-types.js'

const createItem = (
  id: number,
  name: string,
  x: number,
  y: number,
  isText: boolean,
): LevelItem => ({
  id,
  name,
  x,
  y,
  isText,
})

test('step TELE uses board-order pad scan, not insertion order', () => {
  const level: LevelData = {
    title: 'tele-pad-order',
    width: 12,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 5, 0, false),
      createItem(3, 'flag', 1, 0, false),
      createItem(4, 'flag', 3, 0, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'flag', 9, 2, true),
      createItem(9, 'is', 10, 2, true),
      createItem(10, 'tele', 11, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 3)
  assert.equal(baba?.y, 0)
})

test('step TELE RNG matches official oorandom seed behavior on turn 0', () => {
  const level: LevelData = {
    title: 'tele-rng-turn0',
    width: 14,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 11, 0, false),
      createItem(3, 'flag', 1, 0, false),
      createItem(4, 'flag', 3, 0, false),
      createItem(5, 'flag', 9, 0, false),
      createItem(6, 'flag', 5, 0, false),
      createItem(7, 'flag', 7, 0, false),
      createItem(8, 'baba', 0, 2, true),
      createItem(9, 'is', 1, 2, true),
      createItem(10, 'you', 2, 2, true),
      createItem(11, 'flag', 11, 2, true),
      createItem(12, 'is', 12, 2, true),
      createItem(13, 'tele', 13, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  assert.equal(baba?.x, 7)
  assert.equal(baba?.y, 0)
})

test('step TELE sends units only to same-name pads', () => {
  const level: LevelData = {
    title: 'tele-same-name',
    width: 10,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'flag', 3, 0, false),
      createItem(4, 'rock', 5, 0, false),
      createItem(5, 'rock', 7, 0, false),
      createItem(6, 'baba', 0, 2, true),
      createItem(7, 'is', 1, 2, true),
      createItem(8, 'you', 2, 2, true),
      createItem(9, 'flag', 4, 2, true),
      createItem(10, 'is', 5, 2, true),
      createItem(11, 'tele', 6, 2, true),
      createItem(12, 'rock', 7, 2, true),
      createItem(13, 'is', 8, 2, true),
      createItem(14, 'tele', 9, 2, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const baba = result.state.items.find(
    (item) => !item.isText && item.name === 'baba',
  )

  // The only other flag pad is at 3,0 — the rock pads are off-limits.
  assert.equal(baba?.x, 3)
  assert.equal(baba?.y, 0)
})

test('step TELE refires every turn a unit stands on a pad', () => {
  const level: LevelData = {
    title: 'tele-per-turn',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'flag', 3, 0, false),
      createItem(4, 'baba', 0, 2, true),
      createItem(5, 'is', 1, 2, true),
      createItem(6, 'you', 2, 2, true),
      createItem(7, 'flag', 3, 2, true),
      createItem(8, 'is', 4, 2, true),
      createItem(9, 'tele', 5, 2, true),
    ],
  }

  const babaX = (items: readonly { isText: boolean; name: string; x: number }[]) =>
    items.find((item) => !item.isText && item.name === 'baba')?.x

  let state = createInitialState(level, 0)
  state = step(state, 'right').state
  assert.equal(babaX(state.items), 3) // stepped onto pad 1,0 -> teleported to 3,0

  // Official `objectdata` clears per turn (`smallclear`): waiting on the
  // pad teleports back to the other pad — pads ping-pong every turn.
  state = step(state, null).state
  assert.equal(babaX(state.items), 1)
  state = step(state, null).state
  assert.equal(babaX(state.items), 3)
})

test('step TELE does not move STILL units', () => {
  const level: LevelData = {
    title: 'tele-still',
    width: 10,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'keke', 0, 1, false),
      createItem(3, 'flag', 0, 1, false),
      createItem(4, 'flag', 2, 1, false),
      createItem(5, 'baba', 0, 2, true),
      createItem(6, 'is', 1, 2, true),
      createItem(7, 'you', 2, 2, true),
      createItem(8, 'flag', 3, 2, true),
      createItem(9, 'is', 4, 2, true),
      createItem(10, 'tele', 5, 2, true),
      createItem(11, 'keke', 7, 0, true),
      createItem(12, 'is', 8, 0, true),
      createItem(13, 'still', 9, 0, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  const keke = result.state.items.find(
    (item) => !item.isText && item.name === 'keke',
  )

  assert.equal(keke?.x, 0)
  assert.equal(keke?.y, 1)
})

test('step TELE float layer uses the turn-start latch, not mid-turn rules', () => {
  // Official `statusblock()` samples `unit.values[FLOAT]` once at
  // `movecommand` entry (blocks.lua:373-384); `floating()` layer checks
  // read that latch all turn. Here the skull pushes "ICE IS" into a
  // parked "FLOAT" so `ice is float` forms mid-turn — the ice tele pads
  // stay grounded-latched until the next step, so the floating text_baba
  // rider on padA cannot teleport yet (verified against the Lua engine).
  const level: LevelData = {
    title: 'tele-float-latch',
    width: 16,
    height: 9,
    items: [
      createItem(1, 'skull', 0, 0, true),
      createItem(2, 'is', 0, 1, true),
      createItem(3, 'you', 0, 2, true),
      createItem(4, 'text', 0, 4, true),
      createItem(5, 'is', 0, 5, true),
      createItem(6, 'push', 0, 6, true),
      createItem(7, 'text', 0, 8, true),
      createItem(8, 'is', 1, 8, true),
      createItem(9, 'float', 2, 8, true),
      createItem(10, 'ice', 15, 0, true),
      createItem(11, 'is', 15, 1, true),
      createItem(12, 'tele', 15, 2, true),
      createItem(13, 'skull', 4, 5, false),
      createItem(14, 'ice', 5, 5, true),
      createItem(15, 'is', 6, 5, true),
      createItem(16, 'float', 9, 5, true),
      createItem(17, 'ice', 11, 3, false),
      createItem(18, 'baba', 11, 3, true),
      createItem(19, 'ice', 12, 5, false),
    ],
  }
  const padA = (state: GameState) =>
    state.items.find((item) => !item.isText && item.name === 'ice' && item.y === 3)
  const rider = (state: GameState) =>
    state.items.find((item) => item.isText && item.name === 'baba')

  let state = createInitialState(level, 0)
  state = step(state, 'right').state // skull pushes "ice is" to 6,5/7,5
  assert.equal(rider(state)?.x, 11)

  state = step(state, 'right').state // "ice is float" forms mid-turn
  // Live props already see the new rule, but the latch was sampled before
  // it existed — the pad still compares as grounded, so no teleport.
  assert.equal(padA(state)?.props.includes('float'), true)
  assert.equal(padA(state)?.floatLatch, false)
  assert.equal(rider(state)?.x, 11)
  assert.equal(rider(state)?.y, 3)

  state = step(state, null).state // next turn: latch resamples
  assert.equal(padA(state)?.floatLatch, true)
  // Both pads now latch float — the rider teleports padA -> padB.
  assert.equal(rider(state)?.x, 12)
  assert.equal(rider(state)?.y, 5)
})

test('step does not win across different FLOAT layers', () => {
  const level: LevelData = {
    title: 'float-win-layer',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'flag', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'win', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'playing')
})

test('step wins on same FLOAT layer when both are FLOAT', () => {
  const level: LevelData = {
    title: 'float-win-same-layer',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'flag', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'win', 2, 1, true),
      createItem(11, 'and', 3, 1, true),
      createItem(12, 'float', 4, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(result.state.status, 'win')
})

test('step does not apply SINK across different FLOAT layers', () => {
  const level: LevelData = {
    title: 'float-sink-layer',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'water', 1, 0, false),
      createItem(3, 'baba', 0, 2, true),
      createItem(4, 'is', 1, 2, true),
      createItem(5, 'you', 2, 2, true),
      createItem(6, 'and', 3, 2, true),
      createItem(7, 'float', 4, 2, true),
      createItem(8, 'water', 0, 1, true),
      createItem(9, 'is', 1, 1, true),
      createItem(10, 'sink', 2, 1, true),
    ],
  }

  const state = createInitialState(level, 0)
  const result = step(state, 'right')

  assert.equal(
    result.state.items.some((item) => !item.isText && item.name === 'baba'),
    true,
  )
})
