import {
  createInitialWebAppState,
  hasViewStateChanged,
  reduceWebAppState,
  toWebAppSnapshot,
} from './app-model.js'

import type {
  WebAppAction,
  WebAppEnvironment,
  WebAppSnapshot,
  WebAppStateData,
} from './app-model.js'

export const createWebAppStore = (env: WebAppEnvironment) => {
  let stateData = createInitialWebAppState(env)
  const listeners = new Set<() => void>()

  return {
    dispatch: (action: WebAppAction): void => {
      const nextStateData = reduceWebAppState(stateData, action, env)
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
