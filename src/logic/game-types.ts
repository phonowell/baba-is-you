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
  // Official `flags[CONVERTED]` — set on every unit the engine creates
  // at runtime (has/more/make/write spawns, empty conversions, transform
  // products) and cleared by the native frame loop at turn end. The
  // same-turn `conversion()` pass only transforms units with the flag
  // unset, so units spawned or converted during this turn are immune to
  // `x is y`/`become`/`revert` until the next step.
  converted?: boolean
  // Official `unit.new` — set by `addunit` for every `create()`-origin
  // unit (has/more/make/write drops, empty and `x is all` spawns), but
  // explicitly cleared on `x is y` transform products. Cleared per turn;
  // the `weak` cell sweep skips `new` units, so a fresh spawn sharing a
  // cell does not shatter until the next turn.
  spawned?: boolean
  // `x is back` support: the cell this entity occupied at the start of
  // the previous step. Written by `step` for `back`-prop entities only.
  prevX?: number
  prevY?: number
  // Official `objectdata[id].tele` — set when a unit is teleported (or
  // moved by a `back` restore) and wiped by `smallclear()` each turn
  // (`clearPerTurnFlags`): a unit standing on a tele pad re-teleports
  // every turn but is sent at most once per turn.
  teleported?: boolean
  // `x follow y` support: the id of the adjacent target this unit locked
  // onto last turn (official `unit.followed`). While that unit stays
  // adjacent the follower keeps facing it instead of re-picking.
  followed?: number
  // Official `unit.values[FLOAT]` — a per-unit latch, not a live prop:
  // `statusblock()` writes it once at the top of `movecommand` from the
  // previous turn's rules (and `addunit` latches a freshly-created unit
  // from the rules live at its creation). Every `floating()` layer check
  // — tele pads, shift rides, sink/weak/melt/defeat/open-shut/eat
  // contact, hold riders, move-time lock/eat/weak specials, `level is
  // hold`/`level is shift` sweeps — reads this latch, so a float rule
  // formed mid-turn only takes effect next step. Distinct from
  // `props.includes('float')`, which tracks the live ruleset
  // (`hasfeature`). Undefined means "not yet latched": units that were
  // created this turn and haven't reached a property pass yet.
  floatLatch?: boolean
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
  // Active rule-instance multiplicity (`features` keeps one entry per
  // formation — duplicate `x is move` rules stack `moves`). Stored beside
  // `rules` so the fast-path rebind keeps identical counts.
  ruleCounts?: ReadonlyMap<string, number>
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
