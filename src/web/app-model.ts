import { createInitialState, markCampaignComplete } from '../logic/state.js'
import { step } from '../logic/step.js'

import type { Direction, LevelData } from '../logic/types.js'
import type { GameState } from '../logic/types.js'

export type AppMode = 'menu' | 'game'

export type WebAppSnapshot = {
  mode: AppMode
  menuSelectedLevelIndex: number
  levelIndex: number
  state: GameState
  showReferenceDialog: boolean
}

export type WebAppStateData = WebAppSnapshot & {
  history: GameState[]
  lastGameActionMs: number
  levelCount: number
}

export type WebAppAction =
  | { type: 'close-reference-dialog' }
  | { type: 'enter-game'; index: number }
  | { type: 'mark-campaign-complete' }
  | { type: 'mark-game-action-handled'; nowMs: number }
  | { type: 'move'; direction: Direction | null }
  | { type: 'reset-level'; index: number }
  | { type: 'return-to-menu' }
  | { type: 'select-menu-level'; index: number }
  | { type: 'toggle-reference-dialog' }
  | { type: 'undo' }

export const createStateForLevel = (
  levels: LevelData[],
  index: number,
  fallback: LevelData,
): GameState => {
  const level = levels[index] ?? fallback
  return createInitialState(level, index)
}

const clampLevelIndex = (levelCount: number, index: number): number => {
  if (levelCount <= 0) return 0
  return Math.max(0, Math.min(levelCount - 1, index))
}

export const createInitialWebAppState = (
  levels: LevelData[],
): WebAppStateData => {
  const firstLevel = levels[0]
  if (!firstLevel) throw new Error('No levels available.')

  return {
    mode: 'menu',
    menuSelectedLevelIndex: 0,
    levelIndex: 0,
    history: [],
    state: createStateForLevel(levels, 0, firstLevel),
    showReferenceDialog: false,
    lastGameActionMs: 0,
    levelCount: levels.length,
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
})

export const hasViewStateChanged = (
  previous: WebAppStateData,
  next: WebAppStateData,
): boolean =>
  previous.mode !== next.mode ||
  previous.menuSelectedLevelIndex !== next.menuSelectedLevelIndex ||
  previous.levelIndex !== next.levelIndex ||
  previous.state !== next.state ||
  previous.showReferenceDialog !== next.showReferenceDialog

export const reduceWebAppState = (
  stateData: WebAppStateData,
  action: WebAppAction,
  levels: LevelData[],
): WebAppStateData => {
  const firstLevel = levels[0]
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
      if (stateData.mode !== 'game') return stateData
      if (!stateData.showReferenceDialog) return stateData
      return {
        ...stateData,
        showReferenceDialog: false,
      }
    case 'toggle-reference-dialog':
      if (stateData.mode !== 'game') return stateData
      return {
        ...stateData,
        showReferenceDialog: !stateData.showReferenceDialog,
      }
    case 'reset-level': {
      const nextIndex = clampLevelIndex(stateData.levelCount, action.index)
      return {
        ...stateData,
        levelIndex: nextIndex,
        history: [],
        showReferenceDialog: false,
        state: createStateForLevel(levels, nextIndex, firstLevel),
      }
    }
    case 'enter-game': {
      const resetState = reduceWebAppState(
        stateData,
        {
          type: 'reset-level',
          index: clampLevelIndex(stateData.levelCount, action.index),
        },
        levels,
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
      }
    case 'move': {
      if (stateData.mode !== 'game') return stateData
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
      if (stateData.mode !== 'game') return stateData
      const previous = stateData.history.at(-1)
      if (!previous) return stateData
      return {
        ...stateData,
        history: stateData.history.slice(0, -1),
        state: previous,
      }
    }
    case 'mark-campaign-complete':
      if (stateData.mode !== 'game') return stateData
      if (stateData.state.status === 'complete') return stateData
      return {
        ...stateData,
        state: markCampaignComplete(stateData.state),
      }
    case 'mark-game-action-handled':
      if (stateData.mode !== 'game') return stateData
      return {
        ...stateData,
        lastGameActionMs: action.nowMs,
      }
  }
}
