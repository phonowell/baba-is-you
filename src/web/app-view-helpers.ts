import type { GameState } from '../logic/types.js'

export const computeCellSizeForState = (state: GameState): number => {
  const gap = 1
  const availW = window.innerWidth - 18
  const availH = window.innerHeight - 104
  const maxByW = Math.floor((availW - gap * (state.width - 1)) / state.width)
  const maxByH = Math.floor((availH - gap * (state.height - 1)) / state.height)
  return Math.min(44, Math.max(12, Math.min(maxByW, maxByH)))
}

export const applyWithTransition = (
  reducedMotionQuery: MediaQueryList,
  fn: () => void,
): void => {
  if (!reducedMotionQuery.matches && document.startViewTransition) {
    document.startViewTransition(fn)
  } else {
    fn()
  }
}
