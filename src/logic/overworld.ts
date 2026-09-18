import { levelNameKey } from './parse-ascii-level.js'

import type {
  Direction,
  Item,
  LevelItem,
  LevelName,
} from './types.js'

// Overworld ("map is a level") mechanics ported from the predecessor:
// a map file contains `level` icon entities (entries into levels and
// subworlds), `line` entities paving the walkable graph, and a single
// `cursor` entity placed at runtime. The cursor is not rule-driven — it
// moves one cell per directional input onto cells holding a line/level.

export const sameLevelName = (a: LevelName, b: LevelName): boolean =>
  levelNameKey(a) === levelNameKey(b)

// Graph lookup key: subworld icons live in the parent's legend, so
// lookups ignore the icon (`map 1 lake` vs directory `1-the-lake`).
export const levelGraphKey = (target: LevelName): string =>
  target.kind === 'subworld' ? `s${target.n}` : levelNameKey(target)

const CURSOR_NAME = 'cursor'
const PARENT_TARGET: LevelName = { kind: 'parent' }
const FIRST_LEVEL_TARGET: LevelName = { kind: 'number', n: 0 }

const findLevelAt = (
  items: ReadonlyArray<LevelItem>,
  target: LevelName,
): LevelItem | undefined =>
  items.find(
    (item) =>
      !item.isText &&
      item.name === 'level' &&
      item.levelTarget !== undefined &&
      sameLevelName(item.levelTarget, target),
  )

// Places the cursor on the level icon matching `target` (or `parent`
// when entering a map fresh), falling back to level 0 — the
// predecessor's `place_cursor` chain. Returns items unchanged when no
// icon matches at all.
export const placeCursor = (
  items: Item[],
  target: LevelName | undefined,
): Item[] => {
  const without = items.filter((item) => item.name !== CURSOR_NAME)
  for (const wanted of [target ?? PARENT_TARGET, FIRST_LEVEL_TARGET]) {
    const icon = findLevelAt(without, wanted)
    if (!icon) continue
    const cursor: Item = {
      id: without.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      name: CURSOR_NAME,
      x: icon.x,
      y: icon.y,
      isText: false,
      dir: 'right',
      props: [],
    }
    return [...without, cursor]
  }
  return without
}

// One rail-hop per directional input: the first cursor moves onto the
// adjacent cell when it holds a `line` or `level` entity. Not affected
// by stop/push — cursor travel is not object movement.
export const moveCursor = (
  items: Item[],
  direction: Direction,
  width: number,
  height: number,
): { items: Item[]; changed: boolean } => {
  const cursor = items.find((item) => item.name === CURSOR_NAME)
  if (!cursor) return { items, changed: false }

  const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
  const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0
  const nx = cursor.x + dx
  const ny = cursor.y + dy
  if (nx < 0 || ny < 0 || nx >= width || ny >= height)
    return { items, changed: false }

  const walkable = items.some(
    (item) =>
      !item.isText &&
      item.x === nx &&
      item.y === ny &&
      (item.name === 'line' || item.name === 'level'),
  )
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

// Enter resolves the level icon sharing the cursor's cell; `parent`
// means "return to the map that led here".
export const resolveEnterTarget = (
  items: ReadonlyArray<LevelItem>,
): LevelName | undefined => {
  const cursor = items.find((item) => item.name === CURSOR_NAME)
  if (!cursor) return undefined
  const icon = items.find(
    (item) =>
      !item.isText &&
      item.name === 'level' &&
      item.x === cursor.x &&
      item.y === cursor.y &&
      item.levelTarget !== undefined,
  )
  return icon?.levelTarget
}

// A directory of ASCII levels as a graph: `index.txt` is the map of a
// node, its children are sibling level files and subdirectories.
export type OverworldGraph = {
  // Path (or locator) of this node's own level/map file.
  file: string
  // levelGraphKey -> child node.
  children: ReadonlyMap<string, OverworldGraph>
}

export type OverworldSession = {
  // Stack of visited maps; the top is the node currently shown.
  stack: ReadonlyArray<{
    node: OverworldGraph
    // When returning to this map, the cursor resumes on this icon.
    returnTo?: LevelName
  }>
}

export const createOverworldSession = (
  root: OverworldGraph,
): OverworldSession => ({ stack: [{ node: root }] })

export type OverworldTransition =
  | { type: 'enter'; node: OverworldGraph; returnTo: undefined }
  | { type: 'return'; node: OverworldGraph; returnTo: LevelName | undefined }
  | { type: 'exit-map' }

// Resolves an Enter press against the current map state: dive into a
// child node, or pop back to the parent map. `fileFor` loads a node's
// level data — kept outside so the session stays IO-free.
export const applyEnter = (
  session: OverworldSession,
  target: LevelName | undefined,
): { session: OverworldSession; transition: OverworldTransition } => {
  const top = session.stack[session.stack.length - 1]
  if (!top || !target)
    return { session, transition: { type: 'exit-map' } }

  if (target.kind === 'parent') {
    const stack = session.stack.slice(0, -1)
    const parent = stack[stack.length - 1]
    if (!parent)
      return { session, transition: { type: 'exit-map' } }
    return {
      session: { stack },
      transition: {
        type: 'return',
        node: parent.node,
        returnTo: parent.returnTo,
      },
    }
  }

  const child = top.node.children.get(levelGraphKey(target))
  if (!child)
    return { session, transition: { type: 'exit-map' } }

  return {
    session: {
      stack: [
        ...session.stack.slice(0, -1),
        { node: top.node, returnTo: target },
        { node: child },
      ],
    },
    transition: { type: 'enter', node: child, returnTo: undefined },
  }
}

// Winning or leaving a level pops back to the parent map — the stack
// entry kept `returnTo` so the cursor lands on the finished icon.
export const applyLeave = (
  session: OverworldSession,
): { session: OverworldSession; transition: OverworldTransition } => {
  const stack = session.stack.slice(0, -1)
  const parent = stack[stack.length - 1]
  if (!parent)
    return { session, transition: { type: 'exit-map' } }
  return {
    session: { stack },
    transition: {
      type: 'return',
      node: parent.node,
      returnTo: parent.returnTo,
    },
  }
}
