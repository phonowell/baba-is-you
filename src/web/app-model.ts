import {
  applyEnter,
  applyLeave,
  createMapSession,
  placeCursor,
  resolveEnterTarget,
  topMapFrame,
} from '../logic/overworld.js'
import { decodeReplayInput } from '../logic/replay-input.js'
import { createInitialState } from '../logic/state.js'
import { step } from '../logic/step.js'

import type {
  Direction,
  GameState,
  LevelData,
} from '../logic/types.js'
import type { IconRef, MapSession } from '../logic/overworld.js'

export type AppMode = 'map' | 'game'

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
  levelIndex: number
  // Map file of the board when mode === 'map'; the parent map otherwise.
  mapFile: string
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
  replay: ReplayState | null
  // A level loaded outside the campaign list (a golden's recorded layout).
  // Restart rebuilds from it; entering/resetting a campaign level clears it.
  customLevel: LevelData | null
  // Overworld navigation stack — the top frame is the shown map.
  session: MapSession
}

export type WebAppAction =
  | { type: 'close-reference-dialog' }
  | { type: 'enter-node' }
  | { type: 'leave-node' }
  | { type: 'mark-game-action-handled'; nowMs: number }
  | { type: 'move'; direction: Direction | null }
  | { type: 'replay-step' }
  | { type: 'reset-level'; index: number; level?: LevelData }
  | { type: 'start-replay'; name: string; inputs: string; level: LevelData }
  | { type: 'toggle-reference-dialog' }
  | { type: 'undo' }

// Reducer environment: the campaign levels plus the map board lookup the
// entry layer assembled — app-model itself never imports level data.
export type WebAppEnvironment = {
  levels: LevelData[]
  rootMapFile: string
  mapFor: (file: string) => LevelData | undefined
}

const clampLevelIndex = (levelCount: number, index: number): number => {
  if (levelCount <= 0) return 0
  return Math.max(0, Math.min(levelCount - 1, index))
}

// Map boards are regular GameStates whose levelIndex carries no campaign
// meaning (-1); the cursor is placed on the icon we came through (a file
// match, or an exact IconRef cell for duplicated targets), falling back
// to the map's selector spawn inside placeCursor.
const mapStateFor = (
  env: WebAppEnvironment,
  mapFile: string,
  target: IconRef | string | undefined,
): GameState | undefined => {
  const data = env.mapFor(mapFile)
  if (!data) return undefined
  const state = createInitialState(data, -1)
  return {
    ...state,
    items: placeCursor(state.items, target, data.meta?.map?.selector),
  }
}

export const createInitialWebAppState = (
  env: WebAppEnvironment,
): WebAppStateData => {
  const firstLevel = env.levels[0]
  if (!firstLevel) throw new Error('No levels available.')
  const session = createMapSession(env.rootMapFile)
  const state =
    mapStateFor(env, env.rootMapFile, undefined) ??
    createInitialState(firstLevel, 0)

  return {
    mode: 'map',
    levelIndex: 0,
    mapFile: env.rootMapFile,
    history: [],
    state,
    showReferenceDialog: false,
    replay: null,
    customLevel: null,
    session,
    lastGameActionMs: 0,
  }
}

export const toWebAppSnapshot = (
  stateData: WebAppStateData,
): WebAppSnapshot => ({
  mode: stateData.mode,
  levelIndex: stateData.levelIndex,
  mapFile: stateData.mapFile,
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
  previous.levelIndex !== next.levelIndex ||
  previous.mapFile !== next.mapFile ||
  previous.state !== next.state ||
  previous.showReferenceDialog !== next.showReferenceDialog ||
  previous.replay !== next.replay

// A map that somehow reaches `win` (decorative flag rules) leaves the way
// a bare leave does — the board is navigation, not a level result.
const leaveMapState = (
  stateData: WebAppStateData,
  env: WebAppEnvironment,
): WebAppStateData => {
  const parentFile = stateData.state.meta?.map?.parentFile
  const { session, transition } = applyLeave(stateData.session, parentFile)
  if (transition.type === 'stay') return stateData
  const state = mapStateFor(
    env,
    transition.mapFile,
    transition.type === 'enter-map'
      ? transition.fromMapFile
      : transition.returnTo,
  )
  if (!state) return stateData
  return {
    ...stateData,
    session,
    history: [],
    state,
    mapFile: transition.mapFile,
  }
}

export const reduceWebAppState = (
  stateData: WebAppStateData,
  action: WebAppAction,
  env: WebAppEnvironment,
): WebAppStateData => {
  const firstLevel = env.levels[0]
  if (!firstLevel) throw new Error('No levels available.')

  switch (action.type) {
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
    case 'enter-node': {
      if (stateData.mode !== 'map') return stateData
      const enter = resolveEnterTarget(stateData.state.items)
      const { session, transition } = applyEnter(stateData.session, enter)
      switch (transition.type) {
        case 'enter-level': {
          const index = clampLevelIndex(
            env.levels.length,
            transition.levelIndex,
          )
          return {
            ...stateData,
            mode: 'game',
            session,
            levelIndex: index,
            history: [],
            showReferenceDialog: false,
            replay: null,
            customLevel: null,
            state: createInitialState(
              env.levels[index] ?? firstLevel,
              index,
            ),
          }
        }
        case 'enter-map': {
          const state = mapStateFor(
            env,
            transition.mapFile,
            transition.fromMapFile,
          )
          if (!state) return stateData
          return {
            ...stateData,
            session,
            history: [],
            state,
            mapFile: transition.mapFile,
          }
        }
        case 'return-map': {
          const state = mapStateFor(
            env,
            transition.mapFile,
            transition.returnTo,
          )
          if (!state) return stateData
          return {
            ...stateData,
            session,
            history: [],
            state,
            mapFile: transition.mapFile,
          }
        }
        case 'stay':
          return stateData
      }
      return stateData
    }
    case 'leave-node': {
      if (stateData.mode === 'game') {
        const top = topMapFrame(stateData.session)
        if (!top) return stateData
        const state = mapStateFor(env, top.mapFile, top.returnTo)
        if (!state) return stateData
        return {
          ...stateData,
          mode: 'map',
          history: [],
          showReferenceDialog: false,
          replay: null,
          customLevel: null,
          state,
          mapFile: top.mapFile,
        }
      }
      return leaveMapState(stateData, env)
    }
    case 'reset-level': {
      if (stateData.mode === 'map') {
        const state = mapStateFor(env, stateData.mapFile, undefined)
        if (!state) return stateData
        return {
          ...stateData,
          history: [],
          showReferenceDialog: false,
          replay: null,
          state,
        }
      }
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
      // returns to the map the session still points at.
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
      if (stateData.replay) return stateData
      if (stateData.state.status !== 'playing') return stateData

      const result = step(stateData.state, action.direction)
      if (!result.changed) return stateData

      const next: WebAppStateData = {
        ...stateData,
        history: [...stateData.history, stateData.state],
        state: result.state,
      }
      // A map board that reaches `win` through decorative rules leaves
      // like a bare leave instead of showing an outcome card.
      if (next.mode === 'map' && next.state.status === 'win') {
        return leaveMapState(next, env)
      }
      return next
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
