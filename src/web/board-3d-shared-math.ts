import {
  BOARD3D_LAYOUT_CONFIG,
} from './board-3d-config-layout.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'

const {
  CARD_WORLD_SIZE,
} = BOARD3D_LAYOUT_CONFIG

const {
  IDLE_STRETCH_CYCLE_MS,
  IDLE_STRETCH_Y_AMP,
  IDLE_STRETCH_X_AMP,
  FLOAT_BOB_CYCLE_MS,
  FLOAT_BOB_AMP,
} = BOARD3D_ANIMATION_CONFIG

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

// Signed shortest arc from→to in radians, in (-π, π].
export const angleDelta = (from: number, to: number): number => {
  const delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) return delta - Math.PI * 2
  if (delta <= -Math.PI) return delta + Math.PI * 2
  return delta
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3

export const easeInCubic = (t: number): number => t * t * t

// Back-out: overshoots 1 by ~OVERSHOOT before settling — the pop a card
// makes when it materializes.
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

export const fnv1a = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const fract = (value: number): number => value - Math.floor(value)

const hash01 = (seed: number): number => fract(Math.sin(seed) * 43758.5453123)

export const hashSeed01 = (seed: number): number => hash01(seed)

export const idleMicroStretch = (
  nowMs: number,
  out: { scaleX: number; scaleY: number } = { scaleX: 0, scaleY: 0 },
): { scaleX: number; scaleY: number } => {
  const phase =
    ((nowMs % IDLE_STRETCH_CYCLE_MS) / IDLE_STRETCH_CYCLE_MS) *
    Math.PI *
    2
  const wave = Math.sin(phase)
  out.scaleX = 1 - wave * IDLE_STRETCH_X_AMP
  out.scaleY = 1 + wave * IDLE_STRETCH_Y_AMP
  return out
}

export const idleStretchBottomAnchorOffset = (
  baseScaleY: number,
  finalScaleY: number,
): number => (finalScaleY - baseScaleY) * CARD_WORLD_SIZE * 0.5

// Vertical bob for FLOAT-prop cards: a slow sine around the lifted base z.
export const idleFloatBob = (nowMs: number): number => {
  const phase =
    ((nowMs % FLOAT_BOB_CYCLE_MS) / FLOAT_BOB_CYCLE_MS) * Math.PI * 2
  return Math.sin(phase) * FLOAT_BOB_AMP
}
