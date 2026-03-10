import {
  createInitialWebAppState,
  hasViewStateChanged,
  reduceWebAppState,
  toWebAppSnapshot,
} from './app-model.js'

import type { LevelData } from '../logic/types.js'
import type {
  WebAppAction,
  WebAppSnapshot,
  WebAppStateData,
} from './app-model.js'

type CreateWebAppStoreOptions = {
  levels: LevelData[]
}

export const createWebAppStore = (options: CreateWebAppStoreOptions) => {
  const { levels } = options
  let stateData = createInitialWebAppState(levels)
  const listeners = new Set<() => void>()

  return {
    dispatch: (action: WebAppAction): void => {
      const nextStateData = reduceWebAppState(stateData, action, levels)
      const changed = hasViewStateChanged(stateData, nextStateData)
      stateData = nextStateData
      if (!changed) return
      for (const listener of listeners) listener()
    },
    getState: (): WebAppStateData => stateData,
    snapshot: (): WebAppSnapshot => toWebAppSnapshot(stateData),
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
}
