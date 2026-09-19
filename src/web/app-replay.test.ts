import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { mapGameCommandToAction } from './app-commands.js'
import { createWebAppController } from './app-controller.js'
import { reduceWebAppState } from './app-model.js'
import { createReplayDriver } from './app-replay.js'
import { createWebAppStore } from './app-store.js'

import type { WebAppEnvironment } from './app-model.js'

const campaignLevels = [
  parseLevel('title One; size 3x2; Baba 0,0; Baba 0,1; Is 1,1; You 2,1'),
  parseLevel('title Two; size 3x2; Rock 0,0; Baba 0,1; Is 1,1; You 2,1'),
]

// A golden's own recorded level: baba at (0,2), flag at (0,3) — one 'd'
// step wins; 'r' moves freely twice then hits the board edge.
const goldenLevel = parseLevel(
  'title Golden; size 3x4; Baba 0,0; Is 1,0; You 2,0; Flag 0,1; Is 1,1; Win 2,1; baba 0,2; flag 0,3',
)

const env: WebAppEnvironment = {
  levels: campaignLevels,
}

const startReplay = (
  store: ReturnType<typeof createWebAppStore>,
  inputs: string,
): void => {
  store.dispatch({
    type: 'start-replay',
    name: 'test/0-0',
    inputs,
    level: goldenLevel,
  })
}

test('start-replay loads the golden level in game mode with playback armed', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'enter-game', index: 0 })

  startReplay(store, 'rr')

  const state = store.getState()
  assert.equal(state.mode, 'game')
  assert.equal(state.state.title, 'Golden')
  assert.equal(state.state.turn, 0)
  assert.equal(state.customLevel, goldenLevel)
  assert.deepEqual(state.history, [])
  assert.deepEqual(state.replay, { name: 'test/0-0', inputs: 'rr', cursor: 0 })
})

test('replay-step consumes inputs: moves advance, skips pass, cursor ends playback', () => {
  const store = createWebAppStore(env)
  startReplay(store, 'rxr')

  store.dispatch({ type: 'replay-step' })
  let state = store.getState()
  assert.equal(state.state.turn, 1)
  assert.equal(state.history.length, 1)
  assert.equal(state.replay?.cursor, 1)

  // 'x' is not a replay code — cursor advances, board untouched.
  store.dispatch({ type: 'replay-step' })
  state = store.getState()
  assert.equal(state.state.turn, 1)
  assert.equal(state.replay?.cursor, 2)

  store.dispatch({ type: 'replay-step' })
  state = store.getState()
  assert.equal(state.state.turn, 2)
  assert.equal(state.replay?.cursor, 3)

  // Stream exhausted: playback clears and control returns to the player.
  store.dispatch({ type: 'replay-step' })
  state = store.getState()
  assert.equal(state.replay, null)
  assert.equal(state.state.turn, 2)
})

test('replay-step undoes committed moves on z and steps to win on d', () => {
  const store = createWebAppStore(env)
  startReplay(store, 'rzd')

  store.dispatch({ type: 'replay-step' }) // r: move
  store.dispatch({ type: 'replay-step' }) // z: undo the move
  let state = store.getState()
  assert.equal(state.state.turn, 0)
  assert.equal(state.history.length, 0)
  assert.equal(state.replay?.cursor, 2)

  store.dispatch({ type: 'replay-step' }) // d: onto the flag
  state = store.getState()
  assert.equal(state.state.status, 'win')
  assert.equal(state.replay?.cursor, 3)
})

test('replay-step on empty history leaves the initial frame intact', () => {
  const store = createWebAppStore(env)
  startReplay(store, 'z')

  store.dispatch({ type: 'replay-step' })
  const state = store.getState()
  assert.equal(state.state.turn, 0)
  assert.equal(state.history.length, 0)
  assert.equal(state.replay?.cursor, 1)
})

test('replay playback is pure spectating: game commands blocked, back aborts', () => {
  const store = createWebAppStore(env)
  const controller = createWebAppController({ store })
  startReplay(store, 'rrrr')

  const state = store.getState()
  assert.equal(mapGameCommandToAction({ type: 'move', direction: 'right' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'wait' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'undo' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'restart' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'next' }, state), null)
  assert.deepEqual(mapGameCommandToAction({ type: 'back' }, state), {
    type: 'return-to-menu',
  })

  assert.equal(
    controller.handleGameCommand({ type: 'move', direction: 'right' }),
    false,
  )
  assert.equal(store.getState().state.turn, 0)

  const aborted = controller.handleGameCommand({ type: 'back' })
  assert.equal(aborted, true)
  const after = store.getState()
  assert.equal(after.mode, 'menu')
  assert.equal(after.replay, null)
  assert.equal(after.customLevel, null)
})

test('finished playback leaves the custom level restartable in place', () => {
  const store = createWebAppStore(env)
  const controller = createWebAppController({ store })
  startReplay(store, 'r')

  store.dispatch({ type: 'replay-step' })
  store.dispatch({ type: 'replay-step' })
  assert.equal(store.getState().replay, null)

  // Manual play resumes on the golden's own level — restart rebuilds it,
  // not the campaign slot the index still points at.
  assert.equal(controller.handleGameCommand({ type: 'restart' }), true)
  const state = store.getState()
  assert.equal(state.state.title, 'Golden')
  assert.equal(state.state.turn, 0)
  assert.equal(state.customLevel, goldenLevel)

  // Leaving back to the menu clears the custom level again.
  store.dispatch({ type: 'return-to-menu' })
  assert.equal(store.getState().customLevel, null)
  assert.equal(store.getState().mode, 'menu')
})

test('reducer ignores replay-step without an active replay', () => {
  const store = createWebAppStore(env)
  const menu = store.getState()

  const stepped = reduceWebAppState(menu, { type: 'replay-step' }, env)
  assert.equal(stepped, menu)

  store.dispatch({ type: 'enter-game', index: 0 })
  const playing = store.getState()
  const steppedInGame = reduceWebAppState(
    playing,
    { type: 'replay-step' },
    env,
  )
  assert.equal(steppedInGame, playing)
})

test('start-replay re-arms an in-flight playback from the top', () => {
  const store = createWebAppStore(env)
  startReplay(store, 'rr')
  store.dispatch({ type: 'replay-step' })
  assert.equal(store.getState().replay?.cursor, 1)

  // The toolbar button stays live during playback — a second click
  // restarts the recording rather than resuming it.
  startReplay(store, 'rr')
  const state = store.getState()
  assert.deepEqual(state.replay, { name: 'test/0-0', inputs: 'rr', cursor: 0 })
  assert.equal(state.state.turn, 0)
})

test('replay driver ticks only while playback is armed and cleans up on dispose', () => {
  const store = createWebAppStore(env)
  const scheduled: Array<{ cb: () => void; ms: number }> = []
  let nextHandle = 0
  const cancelled: number[] = []

  const driver = createReplayDriver({
    isReplaying: () => store.getState().replay !== null,
    step: () => store.dispatch({ type: 'replay-step' }),
    subscribe: (fn) => store.subscribe(fn),
    scheduleTimer: (cb, ms) => {
      scheduled.push({ cb, ms })
      nextHandle += 1
      return nextHandle
    },
    cancelTimer: (handle) => {
      cancelled.push(handle)
    },
  })

  // No replay — no timer.
  store.dispatch({ type: 'enter-game', index: 0 })
  assert.equal(scheduled.length, 0)

  startReplay(store, 'rr')
  assert.equal(scheduled.length, 1)
  const timer = scheduled[0]
  assert.ok(timer)
  assert.equal(timer.ms > 0, true)

  timer.cb() // replay-step → cursor 1
  assert.equal(store.getState().replay?.cursor, 1)
  timer.cb() // replay-step → cursor 2 (end)
  timer.cb() // replay-step → clears replay → subscription stops timer
  assert.equal(store.getState().replay, null)
  assert.equal(cancelled.length > 0, true)

  driver.dispose()
  // Post-dispose ticks are inert.
  timer.cb()
  assert.equal(store.getState().replay, null)
})
