import type { Direction, Property, Rule } from './types.js'

// Overworld icon entry point, from the official map files (`leveltype=1`
// .ld `[levels]` entries). `kind` resolves the target file at import:
// `level` opens a playable level, `map` dives into another map, and
// `unresolved` icons point at levels the importer filtered out.
// `number`/`style`/`colour`/`icon` mirror the .ld display fields
// (style 0 = number dot, 1 = letter, 2 = special, -1 = world icon).
export type LevelIcon = {
  kind: 'level' | 'map' | 'unresolved'
  file: string
  number: number
  style: number
  colour?: string
  icon?: string
  levelIndex?: number
  mapFile?: string
}

export type LevelItem = {
  id: number
  name: string
  x: number
  y: number
  isText: boolean
  dir?: Direction
  // `level` entities only: which map entry this icon opens.
  levelTarget?: LevelIcon
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
  // Official map files: cursor spawn cell and the parent map a bare
  // "leave" falls through to when the session stack is exhausted.
  map?: {
    selector?: readonly [number, number]
    parentFile?: string
  }
}

export type LevelData = {
  title: string
  width: number
  height: number
  items: LevelItem[]
  meta?: LevelMeta
}

export type GameStatus = 'playing' | 'win' | 'lose'

export type GameState = {
  levelIndex: number
  title: string
  width: number
  height: number
  items: Item[]
  rules: Rule[]
  status: GameStatus
  turn: number
  // Ids of text items participating only in overridden rules — the
  // struck-through cards. `step`/`createInitialState` fill it from the rule
  // partition they already compute, so renderers never reparse rules;
  // states built outside step (fixtures) leave it undefined and callers
  // fall back to `collectOverriddenTextIds`.
  overriddenTextIds?: ReadonlySet<number>
  meta?: LevelMeta
}

export type StepResult = {
  state: GameState
  changed: boolean
}
