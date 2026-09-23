// Golden replay driver: while `isReplaying()` reports an active playback,
// a plain interval dispatches one `replay-step` per tick (the recorded
// input stream's own cadence — not the player input cooldown). The timer
// only ever exists while a replay owns the board; it stops the moment the
// recording finishes, the player backs out to the map, or the app disposes.

type ScheduleTimer = (callback: () => void, ms: number) => number
type CancelTimer = (handle: number) => void

const REPLAY_STEP_MS = 500

type CreateReplayDriverOptions = {
  isReplaying: () => boolean
  step: () => void
  subscribe: (listener: () => void) => () => void
  stepMs?: number
  scheduleTimer?: ScheduleTimer
  cancelTimer?: CancelTimer
}

export type ReplayDriver = {
  dispose: () => void
}

export const createReplayDriver = (
  options: CreateReplayDriverOptions,
): ReplayDriver => {
  const {
    isReplaying,
    step,
    subscribe,
    stepMs = REPLAY_STEP_MS,
    scheduleTimer = (cb, ms) => window.setInterval(cb, ms),
    cancelTimer = (handle) => window.clearInterval(handle),
  } = options

  let timer: number | null = null
  let disposed = false

  const stop = (): void => {
    if (timer === null) return
    cancelTimer(timer)
    timer = null
  }

  const tick = (): void => {
    if (disposed || !isReplaying()) {
      stop()
      return
    }
    step()
  }

  const syncTimer = (): void => {
    if (disposed) return
    if (isReplaying()) {
      if (timer === null) timer = scheduleTimer(tick, stepMs)
    } else {
      stop()
    }
  }

  const unsubscribe = subscribe(syncTimer)

  return {
    dispose: (): void => {
      if (disposed) return
      disposed = true
      stop()
      unsubscribe()
    },
  }
}
