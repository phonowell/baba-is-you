import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { mapGameCommandToAction } from './app-commands.js'
import { createWebAppController } from './app-controller.js'
import { createWebAppStore } from './app-store.js'

import type { WebAppEnvironment } from './app-model.js'

const levels = [
  parseLevel('title One; size 3x2; baba 0,0; Baba 0,1; Is 1,1; You 2,1'),
  parseLevel('title Two; size 3x2; rock 0,0; Baba 0,1; Is 1,1; You 2,1'),
]

const env: WebAppEnvironment = { levels }

test('initial state opens on the menu with the first level selected', () => {
  const state = createWebAppStore(env).getState()

  assert.equal(state.mode, 'menu')
  assert.equal(state.menuSelectedLevelIndex, 0)
  assert.equal(state.state.status, 'playing')
})

test('select-menu-level moves the highlight and clamps at both ends', () => {
  const store = createWebAppStore(env)

  store.dispatch({ type: 'select-menu-level', index: 1 })
  assert.equal(store.getState().menuSelectedLevelIndex, 1)

  // Past the end clamps; at the clamp the reducer returns the same state
  // object so the keypress does not count as handled.
  store.dispatch({ type: 'select-menu-level', index: 99 })
  assert.equal(store.getState().menuSelectedLevelIndex, 1)
  const atBottom = store.getState()
  store.dispatch({ type: 'select-menu-level', index: 99 })
  assert.equal(store.getState(), atBottom)

  store.dispatch({ type: 'select-menu-level', index: -5 })
  assert.equal(store.getState().menuSelectedLevelIndex, 0)
})

test('enter-game starts the selected level and return-to-menu keeps it selected', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'select-menu-level', index: 1 })
  store.dispatch({ type: 'enter-game', index: 1 })
  const entered = store.getState()

  assert.equal(entered.mode, 'game')
  assert.equal(entered.levelIndex, 1)
  assert.equal(entered.state.title, 'Two')
  assert.deepEqual(entered.history, [])

  store.dispatch({ type: 'return-to-menu' })
  const state = store.getState()
  assert.equal(state.mode, 'menu')
  assert.equal(state.menuSelectedLevelIndex, 1)
})

test('menuOrder translates between grid slots and campaign levels', () => {
  // Display order swaps the two campaign levels: slot 0 shows level 1.
  const store = createWebAppStore({ levels, menuOrder: [1, 0] })

  store.dispatch({ type: 'enter-game', index: 0 })
  assert.equal(store.getState().levelIndex, 1)
  assert.equal(store.getState().state.title, 'Two')

  // Back on the menu the slot showing the played level is selected.
  store.dispatch({ type: 'return-to-menu' })
  assert.equal(store.getState().menuSelectedLevelIndex, 0)

  // Slot 1 shows campaign level 0 — enter resolves it the same way.
  store.dispatch({ type: 'enter-game', index: 1 })
  assert.equal(store.getState().levelIndex, 0)
  assert.equal(store.getState().state.title, 'One')
  store.dispatch({ type: 'return-to-menu' })
  assert.equal(store.getState().menuSelectedLevelIndex, 1)
})

test('menu-mode ignores game actions; game-mode ignores selection moves', () => {
  const store = createWebAppStore(env)
  const inMenu = store.getState()
  store.dispatch({ type: 'move', direction: 'up' })
  assert.equal(store.getState(), inMenu)
  store.dispatch({ type: 'undo' })
  assert.equal(store.getState(), inMenu)

  store.dispatch({ type: 'enter-game', index: 0 })
  const inGame = store.getState()
  store.dispatch({ type: 'select-menu-level', index: 1 })
  assert.equal(store.getState(), inGame)
})

test('mapGameCommandToAction routes menu-mode commands', () => {
  const state = createWebAppStore(env).getState()

  // Two levels form a single row — horizontal steps move (and wrap at
  // the end), while vertical/page steps wrap onto the same cell and map
  // to no action.
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'right' }, state),
    { type: 'select-menu-level', index: 1 },
  )
  assert.equal(
    mapGameCommandToAction({ type: 'move', direction: 'down' }, state),
    null,
  )
  assert.equal(
    mapGameCommandToAction({ type: 'move', direction: 'up' }, state),
    null,
  )
  assert.equal(
    mapGameCommandToAction({ type: 'page', direction: 'down' }, state),
    null,
  )
  assert.deepEqual(mapGameCommandToAction({ type: 'enter' }, state), {
    type: 'enter-game',
    index: 0,
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'next' }, state), {
    type: 'enter-game',
    index: 0,
  })
  assert.equal(mapGameCommandToAction({ type: 'wait' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'undo' }, state), null)
  assert.equal(mapGameCommandToAction({ type: 'back' }, state), null)
})

test('mapGameCommandToAction wraps menu navigation at the list ends', () => {
  const base = createWebAppStore(env).getState()
  // 30 levels = six full rows of MENU_GRID_COLUMNS (5).
  const state = { ...base, levelCount: 30 }
  const at = (index: number) => ({ ...state, menuSelectedLevelIndex: index })

  // Horizontal wrap: stepping past either end re-enters on the far side.
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'left' }, state),
    { type: 'select-menu-level', index: 29 },
  )
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'right' }, at(29)),
    { type: 'select-menu-level', index: 0 },
  )

  // Vertical wrap stays inside the same column.
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'up' }, state),
    { type: 'select-menu-level', index: 25 },
  )
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'down' }, at(25)),
    { type: 'select-menu-level', index: 0 },
  )

  // Page jumps wrap by whole rows inside the column.
  assert.deepEqual(
    mapGameCommandToAction({ type: 'page', direction: 'down' }, state),
    { type: 'select-menu-level', index: 20 },
  )
  assert.deepEqual(
    mapGameCommandToAction({ type: 'page', direction: 'up' }, at(10)),
    { type: 'select-menu-level', index: 20 },
  )

  // A short last row shrinks only the columns that reach it: index 27
  // (column 2 of 28 levels) still has six rows, while column 4 has five.
  const partial = { ...state, levelCount: 28 }
  const atPartial = (index: number) => ({
    ...partial,
    menuSelectedLevelIndex: index,
  })
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'down' }, atPartial(27)),
    { type: 'select-menu-level', index: 2 },
  )
  assert.deepEqual(
    mapGameCommandToAction({ type: 'move', direction: 'down' }, atPartial(24)),
    { type: 'select-menu-level', index: 4 },
  )
})

test('mapGameCommandToAction routes game-mode commands', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'enter-game', index: 0 })
  const playing = store.getState()
  const won = {
    ...playing,
    state: { ...playing.state, status: 'win' as const },
  }

  assert.equal(mapGameCommandToAction({ type: 'enter' }, playing), null)
  assert.equal(mapGameCommandToAction({ type: 'next' }, playing), null)
  assert.deepEqual(mapGameCommandToAction({ type: 'next' }, won), {
    type: 'reset-level',
    index: 1,
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'back' }, playing), {
    type: 'return-to-menu',
  })
  assert.deepEqual(mapGameCommandToAction({ type: 'wait' }, playing), {
    type: 'move',
    direction: null,
  })
})

test('next on a won final level is a no-op', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'enter-game', index: 1 })
  const playing = store.getState()
  const won = {
    ...playing,
    state: { ...playing.state, status: 'win' as const },
  }

  assert.equal(mapGameCommandToAction({ type: 'next' }, won), null)
})

test('createWebAppController reports handled commands by real state change', () => {
  const store = createWebAppStore(env)
  const controller = createWebAppController({ store })

  // Menu mode: the right arrow selects level 2 (a real change), a noop
  // keypress produces no state change and is reported unhandled.
  const moved = controller.handleGameCommand({ type: 'move', direction: 'right' })
  const noop = controller.handleGameCommand({ type: 'noop' })

  assert.equal(moved, true)
  assert.equal(noop, false)
  assert.equal(store.getState().menuSelectedLevelIndex, 1)
})

test('createWebAppStore notifies subscribers only on snapshot-visible changes', () => {
  const store = createWebAppStore(env)
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

test('createWebAppStore records game action timestamp through explicit action', () => {
  const store = createWebAppStore(env)
  const before = store.getState().lastGameActionMs

  store.dispatch({ type: 'mark-game-action-handled', nowMs: 1234 })

  const after = store.getState().lastGameActionMs
  assert.equal(before, 0)
  assert.equal(after, 1234)
})

test('game-mode moves push history and undo rewinds it', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'enter-game', index: 0 })

  store.dispatch({ type: 'move', direction: 'right' })
  const moved = store.getState()
  assert.equal(moved.state.turn, 1)
  assert.equal(moved.history.length, 1)

  store.dispatch({ type: 'undo' })
  const undone = store.getState()
  assert.equal(undone.state.turn, 0)
  assert.equal(undone.history.length, 0)
})

test('return-to-menu clears history, dialog, and replay state', () => {
  const store = createWebAppStore(env)
  store.dispatch({ type: 'enter-game', index: 0 })
  store.dispatch({ type: 'move', direction: 'right' })
  store.dispatch({ type: 'toggle-reference-dialog' })

  store.dispatch({ type: 'return-to-menu' })
  const state = store.getState()

  assert.equal(state.mode, 'menu')
  assert.equal(state.history.length, 0)
  assert.equal(state.showReferenceDialog, false)
  assert.equal(state.replay, null)
})

test('replay confirm opens only in game, stays exclusive with the reference dialog, and clears on start-replay', () => {
  const store = createWebAppStore(env)

  // The ask belongs to the board — the menu ignores it entirely.
  const inMenu = store.getState()
  store.dispatch({ type: 'open-replay-confirm' })
  assert.equal(store.getState(), inMenu)

  store.dispatch({ type: 'enter-game', index: 0 })
  store.dispatch({ type: 'toggle-reference-dialog' })
  store.dispatch({ type: 'open-replay-confirm' })
  const asking = store.getState()
  // One modal at a time: opening the confirm evicts the controls dialog.
  assert.equal(asking.showReplayConfirm, true)
  assert.equal(asking.showReferenceDialog, false)

  // Re-asking is a same-state no-op; closing returns to a clean board.
  store.dispatch({ type: 'open-replay-confirm' })
  assert.equal(store.getState(), asking)
  store.dispatch({ type: 'close-replay-confirm' })
  assert.equal(store.getState().showReplayConfirm, false)
  const closed = store.getState()
  store.dispatch({ type: 'close-replay-confirm' })
  assert.equal(store.getState(), closed)

  // The reference dialog and the confirm never stack either way.
  store.dispatch({ type: 'open-replay-confirm' })
  store.dispatch({ type: 'toggle-reference-dialog' })
  assert.equal(store.getState().showReplayConfirm, false)
  assert.equal(store.getState().showReferenceDialog, true)

  // Committing to playback dismisses the ask itself.
  store.dispatch({ type: 'open-replay-confirm' })
  const level = levels[0]
  assert.ok(level)
  store.dispatch({
    type: 'start-replay',
    name: 'g',
    inputs: 'r',
    level,
  })
  assert.equal(store.getState().showReplayConfirm, false)
  assert.notEqual(store.getState().replay, null)
})
