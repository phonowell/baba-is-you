import type { Direction, Property, Rule } from './types.js'

// Overworld entry points, ported from the predecessor's `LevelName`.
// `subworld` icons carry the icon name from `x = map N icon` legend entries.
export type LevelName =
  | { kind: 'number'; n: number }
  | { kind: 'letter'; c: string }
  | { kind: 'extra'; n: number }
  | { kind: 'subworld'; n: number; icon: string }
  | { kind: 'parent' }

export type LevelItem = {
  id: number
  name: string
  x: number
  y: number
  isText: boolean
  dir?: Direction
  // `level` entities only: which map entry this icon opens.
  levelTarget?: LevelName
}

export type Item = LevelItem & {
  props: Property[]
}

// Per-level display metadata from ASCII level files. Colors are (cx, cy)
// coordinates into the original game's 7x5 palette grid.
export type LevelMeta = {
  palette: string
  backgrounds: string[]
  colorOverrides: Record<string, readonly [number, number]>
  textColorOverrides: Record<
    string,
    readonly [readonly [number, number], readonly [number, number]]
  >
}

export type LevelData = {
  title: string
  width: number
  height: number
  items: LevelItem[]
  meta?: LevelMeta
}

export type GameStatus = 'playing' | 'win' | 'lose' | 'complete'

export type GameState = {
  levelIndex: number
  title: string
  width: number
  height: number
  items: Item[]
  rules: Rule[]
  status: GameStatus
  turn: number
  meta?: LevelMeta
}

export type StepResult = {
  state: GameState
  changed: boolean
}
