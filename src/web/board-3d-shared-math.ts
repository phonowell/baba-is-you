import {
  BOARD3D_LAYOUT_CONFIG,
} from './board-3d-config-layout.js'
import { BOARD3D_ANIMATION_CONFIG } from './board-3d-config-animation.js'

const {
  CARD_WORLD_SIZE,
} = BOARD3D_LAYOUT_CONFIG

const {
  EMOJI_MICRO_STRETCH_CYCLE_MS,
  EMOJI_MICRO_STRETCH_Y_AMP,
  EMOJI_MICRO_STRETCH_X_AMP,
} = BOARD3D_ANIMATION_CONFIG

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3

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

export const emojiMicroStretch = (
  nowMs: number,
): { scaleX: number; scaleY: number } => {
  const phase =
    ((nowMs % EMOJI_MICRO_STRETCH_CYCLE_MS) / EMOJI_MICRO_STRETCH_CYCLE_MS) *
    Math.PI *
    2
  const wave = Math.sin(phase)
  return {
    scaleX: 1 - wave * EMOJI_MICRO_STRETCH_X_AMP,
    scaleY: 1 + wave * EMOJI_MICRO_STRETCH_Y_AMP,
  }
}

export const emojiBottomAnchorOffset = (
  baseScaleY: number,
  finalScaleY: number,
): number => (finalScaleY - baseScaleY) * CARD_WORLD_SIZE * 0.5
