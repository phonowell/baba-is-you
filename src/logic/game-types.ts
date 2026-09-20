import type { Direction, Property, Rule } from './types.js'

export type LevelItem = {
  id: number
  name: string
  x: number
  y: number
  isText: boolean
  dir?: Direction
  // `x is revert` support: the kind this entity was first spawned/loaded
  // as. Set when a transform first renames the entity; untouched items
  // fall back to their own `name`.
  originName?: string
  // `x is back` support: the cell this entity occupied at the start of
  // the previous step. Written by `step` for `back`-prop entities only.
  prevX?: number
  prevY?: number
  // `x follow y` support: the id of the adjacent target this unit locked
  // onto last turn (official `unit.followed`). While that unit stays
  // adjacent the follower keeps facing it instead of re-picking.
  followed?: number
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
  // The items array `rules`/`overriddenTextIds` were last parsed from.
  // Rule collection reads only id/name/x/y/isText and the `word` prop, so a
  // later step whose items match those fields element-wise can reuse the
  // stored rules verbatim instead of rescanning the text grid.
  rulesSourceItems?: readonly LevelItem[]
  // `level is you/move/…` scrolls the whole room (official
  // `MF_scrollroom`): purely visual — logical positions and rule
  // adjacency never move. `levelOffset` accumulates in whole cells and
  // wraps at the edges; `levelDir` is the official `mapdir` (starts at
  // `down`) that `level is move`/`auto`/`fall*` scroll along.
  levelOffset?: { x: number; y: number }
  levelDir?: Direction
  // Official `emptydata[tileid].conv`: a cell converted by `empty is X`
  // (or vacated via an `x is empty` transform) can never be
  // empty-converted again for the rest of the level. Keys are
  // `y * width + x`; absent when no empty conversion has ever fired.
  emptyConverted?: ReadonlySet<number>
  meta?: LevelMeta
}

export type StepResult = {
  state: GameState
  changed: boolean
}
