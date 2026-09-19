import { keyFor } from './helpers.js'

import type { RuleMatchContext } from './rule-match.js'
import type {
  Direction,
  Item,
  LevelIcon,
  LevelItem,
} from './types.js'

// Overworld ("map is a level") mechanics on the official map data:
// a map board carries `level` icon entities (entries into levels and
// sub-maps), `line` entities paving the walkable graph, and a single
// `cursor` entity placed at runtime. The cursor is not rule-driven — it
// moves one cell per directional input onto cells holding a line/level.

const CURSOR_NAME = 'cursor'

const findIconAt = (
  items: ReadonlyArray<LevelItem>,
  x: number,
  y: number,
): LevelItem | undefined =>
  items.find(
    (item) =>
      !item.isText &&
      item.name === 'level' &&
      item.x === x &&
      item.y === y &&
      item.levelTarget !== undefined,
  )

const findIconForFile = (
  items: ReadonlyArray<LevelItem>,
  file: string,
  cell?: { x: number; y: number },
): LevelItem | undefined => {
  const matches = (item: LevelItem): boolean =>
    !item.isText &&
    item.name === 'level' &&
    item.levelTarget !== undefined &&
    item.levelTarget.file === file
  if (cell) {
    const exact = items.find(
      (item) => matches(item) && item.x === cell.x && item.y === cell.y,
    )
    if (exact) return exact
  }
  return items.find(matches)
}

const createCursor = (items: Item[], x: number, y: number): Item => ({
  id: items.reduce((max, item) => Math.max(max, item.id), 0) + 1,
  name: CURSOR_NAME,
  x,
  y,
  isText: false,
  dir: 'right',
  props: [],
})

// Places the cursor on the icon we came through — a target file (any
// matching cell) or an exact `IconRef` cell when duplicates exist —
// falling back to the map's selector spawn and then the first icon.
// Returns items without a cursor when nothing matches.
export const placeCursor = (
  items: Item[],
  target: IconRef | string | undefined,
  selector?: readonly [number, number],
): Item[] => {
  const without = items.filter((item) => item.name !== CURSOR_NAME)
  if (target !== undefined) {
    const file = typeof target === 'string' ? target : target.file
    const cell = typeof target === 'string' ? undefined : target
    const icon = findIconForFile(without, file, cell)
    if (icon) return [...without, createCursor(without, icon.x, icon.y)]
  }
  if (selector) {
    const [x, y] = selector
    return [...without, createCursor(without, x, y)]
  }
  const first = without.find(
    (item) =>
      !item.isText && item.name === 'level' && item.levelTarget !== undefined,
  )
  if (first) return [...without, createCursor(without, first.x, first.y)]
  return without
}

// One rail-hop per directional input: the cursor moves onto the
// adjacent cell when it holds a `line` or `level` entity. Not affected
// by stop/push — cursor travel is not object movement.
export const moveCursor = (
  items: Item[],
  direction: Direction,
  width: number,
  height: number,
  context?: RuleMatchContext,
): { items: Item[]; changed: boolean } => {
  const cursor = items.find((item) => item.name === CURSOR_NAME)
  if (!cursor) return { items, changed: false }

  const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
  const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0
  const nx = cursor.x + dx
  const ny = cursor.y + dy
  if (nx < 0 || ny < 0 || nx >= width || ny >= height)
    return { items, changed: false }

  const isWalkable = (item: LevelItem): boolean =>
    !item.isText && (item.name === 'line' || item.name === 'level')
  // A caller-held match context already indexes the board by cell; without
  // it the walkable probe scans all items.
  const cell = context?.byCell.get(keyFor(nx, ny, width))
  const walkable = cell
    ? cell.some(isWalkable)
    : items.some((item) => item.x === nx && item.y === ny && isWalkable(item))
  if (!walkable) return { items, changed: false }

  return {
    items: items.map((item) =>
      item.id === cursor.id
        ? { ...item, x: nx, y: ny, dir: direction }
        : item,
    ),
    changed: true,
  }
}

// Enter resolves the level icon sharing the cursor's cell, keeping the
// cell itself: official maps occasionally show the same target file at
// more than one cell, and a return should land on the icon the player
// actually entered through.
export type EnterTarget = {
  icon: LevelIcon
  x: number
  y: number
}

export const resolveEnterTarget = (
  items: ReadonlyArray<LevelItem>,
): EnterTarget | undefined => {
  const cursor = items.find((item) => item.name === CURSOR_NAME)
  if (!cursor) return undefined
  const item = findIconAt(items, cursor.x, cursor.y)
  if (!item || !item.levelTarget) return undefined
  return { icon: item.levelTarget, x: item.x, y: item.y }
}

// A specific icon cell on a map — target file plus position.
export type IconRef = {
  file: string
  x: number
  y: number
}

// Navigation stack: the top frame is the map currently shown, and each
// frame records `returnTo` — the icon we entered through — so a return
// can land the cursor back on that exact cell.
export type MapFrame = {
  mapFile: string
  returnTo?: IconRef
}

export type MapSession = {
  stack: ReadonlyArray<MapFrame>
}

export const createMapSession = (rootMapFile: string): MapSession => ({
  stack: [{ mapFile: rootMapFile }],
})

export const topMapFrame = (session: MapSession): MapFrame | undefined =>
  session.stack[session.stack.length - 1]

export type MapTransition =
  | { type: 'enter-level'; levelIndex: number }
  | { type: 'enter-map'; mapFile: string; fromMapFile: string }
  | { type: 'return-map'; mapFile: string; returnTo?: IconRef }
  | { type: 'stay' }

// A bare leave can only travel between maps — never into a level.
export type MapLeaveTransition = Exclude<MapTransition, { type: 'enter-level' }>

// Resolves an Enter press against the current map: open a level, dive
// into a sub-map, or follow a return icon back to an ancestor map.
export const applyEnter = (
  session: MapSession,
  enter: EnterTarget | undefined,
): { session: MapSession; transition: MapTransition } => {
  const top = topMapFrame(session)
  if (!top || !enter || enter.icon.kind === 'unresolved')
    return { session, transition: { type: 'stay' } }
  const { icon } = enter
  const returnTo: IconRef = { file: icon.file, x: enter.x, y: enter.y }

  if (icon.kind === 'level' && icon.levelIndex !== undefined) {
    return {
      session: {
        stack: [
          ...session.stack.slice(0, -1),
          { mapFile: top.mapFile, returnTo },
        ],
      },
      transition: { type: 'enter-level', levelIndex: icon.levelIndex },
    }
  }

  if (icon.kind === 'map' && icon.mapFile !== undefined) {
    const existing = session.stack.findIndex(
      (frame) => frame.mapFile === icon.mapFile,
    )
    if (existing === session.stack.length - 1)
      return { session, transition: { type: 'stay' } }
    if (existing >= 0) {
      const stack = session.stack.slice(0, existing + 1)
      const parent = stack[stack.length - 1]
      return {
        session: { stack },
        transition: {
          type: 'return-map',
          mapFile: parent?.mapFile ?? icon.mapFile,
          ...(parent?.returnTo !== undefined
            ? { returnTo: parent.returnTo }
            : {}),
        },
      }
    }
    return {
      session: {
        stack: [
          ...session.stack.slice(0, -1),
          { mapFile: top.mapFile, returnTo },
          { mapFile: icon.mapFile },
        ],
      },
      transition: {
        type: 'enter-map',
        mapFile: icon.mapFile,
        fromMapFile: top.mapFile,
      },
    }
  }

  return { session, transition: { type: 'stay' } }
}

// A bare leave on a map: pop to the ancestor frame when there is one,
// otherwise follow the map's declared `customparent` link.
export const applyLeave = (
  session: MapSession,
  parentFile: string | undefined,
): { session: MapSession; transition: MapLeaveTransition } => {
  const top = topMapFrame(session)
  if (!top) return { session, transition: { type: 'stay' } }

  if (session.stack.length > 1) {
    const stack = session.stack.slice(0, -1)
    const parent = stack[stack.length - 1]
    return {
      session: { stack },
      transition: {
        type: 'return-map',
        mapFile: parent?.mapFile ?? top.mapFile,
        ...(parent?.returnTo !== undefined
          ? { returnTo: parent.returnTo }
          : {}),
      },
    }
  }

  if (parentFile !== undefined && parentFile !== top.mapFile) {
    // The declared parent link climbs one direction only — a fresh
    // single-frame stack. Keeping the child as a breadcrumb would make a
    // subsequent leave on the parent pop straight back down into it.
    return {
      session: { stack: [{ mapFile: parentFile }] },
      transition: {
        type: 'enter-map',
        mapFile: parentFile,
        fromMapFile: top.mapFile,
      },
    }
  }

  return { session, transition: { type: 'stay' } }
}
