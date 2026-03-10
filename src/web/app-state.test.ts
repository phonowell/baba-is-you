import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { mapGameCommandToAction } from './app-commands.js'
import { createWebAppController } from './app-controller.js'
import { createWebAppStore } from './app-store.js'

import {
  reduceWebAppState,
} from './app-model.js'

const levels = [
  parseLevel('title One; size 3x2; Baba 0,0; Baba 0,1; Is 1,1; You 2,1'),
  parseLevel('title Two; size 3x2; Rock 0,0; Baba 0,1; Is 1,1; You 2,1'),
]

const winLevels = [
  parseLevel(
    'title Win; size 3x4; Baba 0,0; Is 1,0; You 2,0; Flag 0,1; Is 1,1; Win 2,1; baba 0,2; flag 0,3',
  ),
  parseLevel('title Next; size 3x1; Rock 0,0; Baba 0,0; Is 1,0; You 2,0'),
]

test('reduceWebAppState enters game through explicit action', () => {
  const store = createWebAppStore({ levels })

  const next = reduceWebAppState(store.getState(), { type: 'enter-game', index: 1 }, levels)

  assert.equal(next.mode, 'game')
  assert.equal(next.levelIndex, 1)
  assert.equal(next.state.title, 'Two')
  assert.deepEqual(next.history, [])
})

test('reduceWebAppState returns to menu and keeps current level selected', () => {
  const entered = reduceWebAppState(
    createWebAppStore({ levels }).getState(),
    { type: 'enter-game', index: 1 },
    levels,
  )

  const next = reduceWebAppState(entered, { type: 'return-to-menu' }, levels)

  assert.equal(next.mode, 'menu')
  assert.equal(next.menuSelectedLevelIndex, 1)
  assert.equal(next.showReferenceDialog, false)
  assert.deepEqual(next.history, [])
})

test('reduceWebAppState ignores game-only actions while in menu', () => {
  const initial = createWebAppStore({ levels }).getState()

  const moved = reduceWebAppState(initial, { type: 'move', direction: 'right' }, levels)
  const toggledDialog = reduceWebAppState(initial, { type: 'toggle-reference-dialog' }, levels)
  const markedHandled = reduceWebAppState(
    initial,
    { type: 'mark-game-action-handled', nowMs: 1234 },
    levels,
  )

  assert.equal(moved, initial)
  assert.equal(toggledDialog, initial)
  assert.equal(markedHandled, initial)
})

test('reduceWebAppState clamps invalid level indices on enter-game', () => {
  const initial = createWebAppStore({ levels }).getState()

  const next = reduceWebAppState(initial, { type: 'enter-game', index: 99 }, levels)

  assert.equal(next.mode, 'game')
  assert.equal(next.levelIndex, 1)
  assert.equal(next.state.title, 'Two')
})

test('reduceWebAppState ignores menu selection changes while in game', () => {
  const entered = reduceWebAppState(
    createWebAppStore({ levels }).getState(),
    { type: 'enter-game', index: 1 },
    levels,
  )

  const next = reduceWebAppState(entered, { type: 'select-menu-level', index: 0 }, levels)

  assert.equal(next, entered)
})

test('reduceWebAppState leaves repeated dialog close unchanged', () => {
  const store = createWebAppStore({ levels })
  store.dispatch({ type: 'enter-game', index: 0 })
  store.dispatch({ type: 'toggle-reference-dialog' })
  const openState = store.getState()

  const closed = reduceWebAppState(openState, { type: 'close-reference-dialog' }, levels)
  const closedAgain = reduceWebAppState(closed, { type: 'close-reference-dialog' }, levels)

  assert.equal(closed.showReferenceDialog, false)
  assert.equal(closedAgain, closed)
})

test('reduceWebAppState returns completed campaign next action to level zero once only', () => {
  const store = createWebAppStore({ levels })
  store.dispatch({ type: 'enter-game', index: 1 })
  store.dispatch({ type: 'mark-campaign-complete' })
  const completed = store.getState()

  const restarted = reduceWebAppState(completed, { type: 'reset-level', index: 0 }, levels)

  assert.equal(completed.state.status, 'complete')
  assert.equal(restarted.levelIndex, 0)
  assert.equal(restarted.state.status, 'playing')
  assert.deepEqual(restarted.history, [])
})

test('createWebAppController handles command flow through store-backed dispatch', () => {
  const store = createWebAppStore({ levels })
  const controller = createWebAppController({ store })

  controller.enterGame(0)
  const moved = controller.handleGameCommand({ type: 'move', direction: 'right' })
  const snapshot = controller.getViewState()
  const debugState = store.getState()

  assert.equal(moved, true)
  assert.equal(snapshot.state.turn, 1)
  assert.equal(debugState.history.length, 1)
  assert.equal(debugState.mode, 'game')
})

test('createWebAppController reports blocked move as unhandled after a prior successful turn', () => {
  const blockedLevels = [
    parseLevel(
      'title Blocked; size 4x1; Baba 0,0; Is 1,0; You 2,0; Wall 1,0; Wall 2,0; Wall 3,0; Is 1,0; Stop 2,0',
    ),
  ]
  const store = createWebAppStore({ levels: blockedLevels })
  const controller = createWebAppController({ store })

  controller.enterGame(0)
  const firstMove = controller.handleGameCommand({ type: 'move', direction: 'left' })
  const blockedMove = controller.handleGameCommand({ type: 'move', direction: 'right' })
  const state = store.getState()

  assert.equal(firstMove, true)
  assert.equal(blockedMove, false)
  assert.equal(state.state.turn, 1)
  assert.equal(state.history.length, 1)
})

test('createWebAppController complete next and restart both reset to first level', () => {
  const store = createWebAppStore({ levels: winLevels })
  const controller = createWebAppController({ store })

  controller.enterGame(1)
  store.dispatch({ type: 'mark-campaign-complete' })
  const completeState = store.getState()
  const nextFromComplete = controller.handleGameCommand({ type: 'next' })
  const nextResetState = store.getState()

  assert.equal(completeState.state.status, 'complete')
  assert.equal(nextFromComplete, true)
  assert.equal(nextResetState.levelIndex, 0)
  assert.equal(nextResetState.state.status, 'playing')

  store.dispatch({ type: 'mark-campaign-complete' })
  const restartFromComplete = controller.handleGameCommand({ type: 'restart' })
  const restartedState = store.getState()

  assert.equal(restartFromComplete, true)
  assert.equal(restartedState.levelIndex, 0)
  assert.equal(restartedState.state.status, 'playing')
})

test('createWebAppController rejects cross-mode command handlers', () => {
  const store = createWebAppStore({ levels })
  const controller = createWebAppController({ store })

  const gameWhileInMenu = controller.handleGameCommand({ type: 'move', direction: 'right' })
  controller.enterGame(1)
  const menuWhileInGame = controller.handleMenuCommand({ type: 'down' })
  const state = store.getState()

  assert.equal(gameWhileInMenu, false)
  assert.equal(menuWhileInGame, false)
  assert.equal(state.mode, 'game')
  assert.equal(state.menuSelectedLevelIndex, 0)
  assert.equal(state.state.title, 'Two')
})

test('createWebAppController reports menu edge navigation as unhandled', () => {
  const store = createWebAppStore({ levels })
  const controller = createWebAppController({ store })

  const upAtTop = controller.handleMenuCommand({ type: 'up' })
  const stillAtTop = store.getState()

  controller.handleMenuCommand({ type: 'down' })
  const downAtBottom = controller.handleMenuCommand({ type: 'down' })
  const atBottom = store.getState()

  assert.equal(upAtTop, false)
  assert.equal(stillAtTop.menuSelectedLevelIndex, 0)
  assert.equal(downAtBottom, false)
  assert.equal(atBottom.menuSelectedLevelIndex, 1)
})

test('createWebAppController treats return-to-menu command as handled view change', () => {
  const store = createWebAppStore({ levels })
  const controller = createWebAppController({ store })
  controller.enterGame(1)

  const handled = controller.handleGameCommand({ type: 'back-menu' })

  assert.equal(handled, true)
  assert.equal(store.getState().mode, 'menu')
  assert.equal(store.getState().menuSelectedLevelIndex, 1)
})

test('mapGameCommandToAction enforces next and restart status boundaries', () => {
  const store = createWebAppStore({ levels })
  store.dispatch({ type: 'enter-game', index: 1 })
  const playing = store.getState()
  const won = {
    ...playing,
    state: {
      ...playing.state,
      status: 'win' as const,
    },
  }
  const complete = {
    ...playing,
    state: {
      ...playing.state,
      status: 'complete' as const,
    },
  }

  assert.deepEqual(mapGameCommandToAction({ type: 'restart' }, playing), {
    type: 'reset-level',
    index: 1,
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'restart' }, complete), {
    type: 'reset-level',
    index: 0,
  })
  assert.equal(mapGameCommandToAction({ type: 'next' }, playing), null)
  assert.deepEqual(mapGameCommandToAction({ type: 'next' }, won), {
    type: 'mark-campaign-complete',
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'next' }, complete), {
    type: 'reset-level',
    index: 0,
  })
})

test('createWebAppStore skips repeated campaign-complete notifications', () => {
  const store = createWebAppStore({ levels })
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })

  store.dispatch({ type: 'enter-game', index: 0 })
  store.dispatch({ type: 'mark-campaign-complete' })
  store.dispatch({ type: 'mark-campaign-complete' })

  unsubscribe()

  assert.equal(store.getState().state.status, 'complete')
  assert.equal(calls, 2)
})

test('createWebAppStore records game action timestamp through explicit action', () => {
  const store = createWebAppStore({ levels })
  store.dispatch({ type: 'enter-game', index: 0 })
  const before = store.getState().lastGameActionMs

  store.dispatch({ type: 'mark-game-action-handled', nowMs: 1234 })

  const after = store.getState().lastGameActionMs
  assert.equal(before, 0)
  assert.equal(after, 1234)
})

test('createWebAppStore notifies subscribers only when snapshot-visible state changes', () => {
  const store = createWebAppStore({ levels })
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })

  store.dispatch({ type: 'mark-game-action-handled', nowMs: 1234 })
  store.dispatch({ type: 'select-menu-level', index: 1 })
  store.dispatch({ type: 'select-menu-level', index: 1 })

  unsubscribe()

  assert.equal(calls, 1)
})
