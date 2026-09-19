import { decodeReplayInput } from '../logic/replay-input.js'
import { createInitialState } from '../logic/state.js'
import { step } from '../logic/step.js'

import type { Direction, GameState, LevelData } from '../logic/types.js'

export type AppMode = 'menu' | 'game'

// An in-flight golden playback: the recorded input string is consumed one
// code per `replay-step` action by the replay driver. `null` means the
// player holds the controls.
export type ReplayState = {
  name: string
  inputs: string
  cursor: number
}

// View-facing replay progress (status line): which golden, how far in.
export type ReplayProgress = {
  name: string
  cursor: number
  total: number
}

export type WebAppSnapshot = {
  mode: AppMode
  menuSelectedLevelIndex: number
  levelIndex: number
  state: GameState
  showReferenceDialog: boolean
  replay: ReplayProgress | null
  // Undo is only a live verb with history behind it — the view disables
  // the button instead of offering a dead press.
  canUndo: boolean
}

export type WebAppStateData = Omit<
  WebAppSnapshot,
  'replay' | 'canUndo'
> & {
  history: GameState[]
  lastGameActionMs: number
  levelCount: number
  replay: ReplayState | null
  // A level loaded outside the campaign list (a golden's recorded layout).
  // Restart rebuilds from it; entering/resetting a campaign level clears it.
  customLevel: LevelData | null
}

export type WebAppAction =
  | { type: 'close-reference-dialog' }
  | { type: 'enter-game'; index: number }
  | { type: 'mark-game-action-handled'; nowMs: number }
  | { type: 'move'; direction: Direction | null }
  | { type: 'replay-step' }
  | { type: 'reset-level'; index: number; level?: LevelData }
  | { type: 'return-to-menu' }
  | { type: 'select-menu-level'; index: number }
  | { type: 'start-replay'; name: string; inputs: string; level: LevelData }
  | { type: 'toggle-reference-dialog' }
  | { type: 'undo' }

// Reducer environment: just the campaign level list — menu select needs
// no map lookup anymore.
export type WebAppEnvironment = {
  levels: LevelData[]
}

const clampLevelIndex = (levelCount: number, index: number): number => {
  if (levelCount <= 0) return 0
  return Math.max(0, Math.min(levelCount - 1, index))
}

export const createInitialWebAppState = (
  env: WebAppEnvironment,
): WebAppStateData => {
  const firstLevel = env.levels[0]
  if (!firstLevel) throw new Error('No levels available.')

  return {
    mode: 'menu',
    menuSelectedLevelIndex: 0,
    levelIndex: 0,
    history: [],
    levelCount: env.levels.length,
    state: createInitialState(firstLevel, 0),
    showReferenceDialog: false,
    replay: null,
    customLevel: null,
    lastGameActionMs: 0,
  }
}

export const toWebAppSnapshot = (
  stateData: WebAppStateData,
): WebAppSnapshot => ({
  mode: stateData.mode,
  menuSelectedLevelIndex: stateData.menuSelectedLevelIndex,
  levelIndex: stateData.levelIndex,
  state: stateData.state,
  showReferenceDialog: stateData.showReferenceDialog,
  replay: stateData.replay
    ? {
        name: stateData.replay.name,
        cursor: stateData.replay.cursor,
        total: stateData.replay.inputs.length,
      }
    : null,
  canUndo: stateData.history.length > 0,
})

export const hasViewStateChanged = (
  previous: WebAppStateData,
  next: WebAppStateData,
): boolean =>
  previous.mode !== next.mode ||
  previous.menuSelectedLevelIndex !== next.menuSelectedLevelIndex ||
  previous.levelIndex !== next.levelIndex ||
  previous.state !== next.state ||
  previous.showReferenceDialog !== next.showReferenceDialog ||
  previous.replay !== next.replay

export const reduceWebAppState = (
  stateData: WebAppStateData,
  action: WebAppAction,
  env: WebAppEnvironment,
): WebAppStateData => {
  const firstLevel = env.levels[0]
  if (!firstLevel) throw new Error('No levels available.')

  switch (action.type) {
    case 'select-menu-level': {
      if (stateData.mode !== 'menu') return stateData
      const nextIndex = clampLevelIndex(stateData.levelCount, action.index)
      if (nextIndex === stateData.menuSelectedLevelIndex) return stateData
      return {
        ...stateData,
        menuSelectedLevelIndex: nextIndex,
      }
    }
    case 'close-reference-dialog':
      if (!stateData.showReferenceDialog) return stateData
      return {
        ...stateData,
        showReferenceDialog: false,
      }
    case 'toggle-reference-dialog':
      return {
        ...stateData,
        showReferenceDialog: !stateData.showReferenceDialog,
      }
    case 'enter-game': {
      const resetState = reduceWebAppState(
        stateData,
        {
          type: 'reset-level',
          index: clampLevelIndex(stateData.levelCount, action.index),
        },
        env,
      )
      return {
        ...resetState,
        mode: 'game',
      }
    }
    case 'return-to-menu':
      if (stateData.mode !== 'game') return stateData
      return {
        ...stateData,
        mode: 'menu',
        menuSelectedLevelIndex: stateData.levelIndex,
        history: [],
        showReferenceDialog: false,
        replay: null,
        customLevel: null,
      }
    case 'reset-level': {
      // `action.level` restarts a custom (golden-replayed) level in place;
      // without it the campaign list is the source and any custom level —
      // plus a lingering replay — is cleared.
      const custom = action.level ?? null
      const nextIndex = custom
        ? stateData.levelIndex
        : clampLevelIndex(env.levels.length, action.index)
      return {
        ...stateData,
        levelIndex: nextIndex,
        history: [],
        showReferenceDialog: false,
        replay: null,
        customLevel: custom,
        state: createInitialState(
          custom ?? env.levels[nextIndex] ?? firstLevel,
          nextIndex,
        ),
      }
    }
    case 'start-replay': {
      // Load the golden's own recorded level as the live board; leaving it
      // returns to the menu.
      return {
        ...stateData,
        mode: 'game',
        history: [],
        showReferenceDialog: false,
        customLevel: action.level,
        state: createInitialState(action.level, stateData.levelIndex),
        replay: {
          name: action.name,
          inputs: action.inputs,
          cursor: 0,
        },
      }
    }
    case 'replay-step': {
      const replay = stateData.replay
      if (stateData.mode !== 'game' || !replay) return stateData
      const code = replay.inputs[replay.cursor]
      if (code === undefined) {
        // Playback consumed the whole recording — controls return to the
        // player on the finished (recorded) state.
        return { ...stateData, replay: null }
      }
      const advanced: WebAppStateData = {
        ...stateData,
        replay: { ...replay, cursor: replay.cursor + 1 },
      }
      const decoded = decodeReplayInput(code)
      if (decoded.kind === 'skip') return advanced
      if (decoded.kind === 'undo') {
        const previous = stateData.history.at(-1)
        if (!previous) return advanced
        return {
          ...advanced,
          history: stateData.history.slice(0, -1),
          state: previous,
        }
      }
      const result = step(stateData.state, decoded.direction)
      if (!result.changed) return advanced
      return {
        ...advanced,
        history: [...stateData.history, stateData.state],
        state: result.state,
      }
    }
    case 'move': {
      if (stateData.mode !== 'game') return stateData
      if (stateData.replay) return stateData
      if (stateData.state.status !== 'playing') return stateData

      const result = step(stateData.state, action.direction)
      if (!result.changed) return stateData

      return {
        ...stateData,
        history: [...stateData.history, stateData.state],
        state: result.state,
      }
    }
    case 'undo': {
      if (stateData.replay) return stateData
      const previous = stateData.history.at(-1)
      if (!previous) return stateData
      return {
        ...stateData,
        history: stateData.history.slice(0, -1),
        state: previous,
      }
    }
    case 'mark-game-action-handled':
      return {
        ...stateData,
        lastGameActionMs: action.nowMs,
      }
  }
}
