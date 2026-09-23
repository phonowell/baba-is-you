#!/usr/bin/env tsx
// Diffs our engine against a recorded Rust golden, step by step.
// Decodes the `.ron.br` replay (screens + inputs), replays the inputs on
// our engine over the matching entity-list level (or the recording's own initial
// layout when the level file was edited afterwards), and prints the first
// screen where the two engines diverge plus the cells that differ.
//
// Usage: tsx scripts/diff-rust-golden.ts <golden.ron.br>

import { readFileSync } from 'node:fs'

import { parseLevel } from '../src/logic/parse-level.js'
import { createInitialState } from '../src/logic/state.js'
import { step } from '../src/logic/step.js'
import {
  entityItem,
  findLevelFile,
  levelFromScreen,
  loadRustGolden,
  strictLayoutSignature,
} from './lib-rust-golden.js'

import type { Direction, GameState } from '../src/logic/types.js'

const rustScreenCells = (level: unknown): Map<string, string[]> => {
  const cells = new Map<string, string[]>()
  if (!Array.isArray(level)) return cells
  level.forEach((row, y) => {
    if (!Array.isArray(row)) return
    row.forEach((cell, x) => {
      if (!Array.isArray(cell)) return
      const names: string[] = []
      for (const ent of cell) {
        if (typeof ent !== 'object' || Array.isArray(ent)) continue
        const parsed = entityItem(ent.fields.e, ent.fields.dir)
        if (parsed)
          names.push(
            `${parsed.name}${parsed.isText ? '!' : ''}@${parsed.dir ?? 'right'}`,
          )
      }
      if (names.length) cells.set(`${x},${y}`, names.sort())
    })
  })
  return cells
}

const ourCells = (state: GameState): Map<string, string[]> => {
  const cells = new Map<string, string[]>()
  for (const item of state.items) {
    const key = `${item.x},${item.y}`
    const list = cells.get(key) ?? []
    list.push(`${item.name}${item.isText ? '!' : ''}@${item.dir ?? 'right'}`)
    cells.set(key, list)
  }
  for (const [k, v] of cells) cells.set(k, v.sort())
  return cells
}

const diffCells = (
  expected: Map<string, string[]>,
  actual: Map<string, string[]>,
): string[] => {
  const out: string[] = []
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const a = expected.get(key) ?? []
    const b = actual.get(key) ?? []
    if (a.join(',') !== b.join(','))
      out.push(`  ${key}: rust=[${a.join(' ')}] ours=[${b.join(' ')}]`)
  }
  return out
}

const goldenPath = process.argv[2]
if (!goldenPath) {
  console.error('Usage: tsx scripts/diff-rust-golden.ts <golden.ron.br>')
  process.exit(1)
}

const rel = goldenPath.replace(/.*goldens\//, '')
const levelPath = findLevelFile(rel)
if (!levelPath) throw new Error(`no level for ${rel}`)
const { screens, inputs } = loadRustGolden(goldenPath)

const parsed = parseLevel(readFileSync(levelPath, 'utf8'))
const firstScreen = screens[0]
if (!firstScreen) throw new Error('golden has no screens')
const recorded = levelFromScreen(firstScreen, parsed.title)
const level =
  strictLayoutSignature(recorded) !== strictLayoutSignature(parsed)
    ? recorded
    : parsed
console.log(
  `golden=${rel} level=${levelPath} inputs=${inputs.length} screens=${screens.length}` +
    (level === recorded ? ' [recorded layout]' : ''),
)

const history: GameState[] = [createInitialState(level, 0)]
const DIRS: Record<string, Direction> = {
  u: 'up',
  d: 'down',
  l: 'left',
  r: 'right',
}

// Compare the raw parsed layout (pre-transform) — the predecessor's first
// recorded screen is the level as loaded, while our createInitialState
// already applies transforms.
const rawCells = new Map<string, string[]>()
for (const item of level.items) {
  const key = `${item.x},${item.y}`
  const list = rawCells.get(key) ?? []
  list.push(`${item.name}${item.isText ? '!' : ''}@${item.dir ?? 'right'}`)
  rawCells.set(key, list)
}
for (const [k, v] of rawCells) rawCells.set(k, v.sort())
const first = diffCells(rustScreenCells(firstScreen), rawCells)
if (first.length) {
  console.log(`initial screen diverges:`)
  console.log(first.slice(0, 30).join('\n'))
  process.exit(1)
}

for (let i = 0; i < inputs.length; i += 1) {
  // history never empties: pops are guarded by length > 1
  const current = history.at(-1)!
  const code = inputs[i] ?? '?'
  if (code === 'z') {
    if (history.length > 1) history.pop()
  } else {
    const result = step(current, code === 'w' ? null : (DIRS[code] ?? null))
    if (result.changed) history.push(result.state)
  }
  const expected = rustScreenCells(screens[i + 1])
  const actual = ourCells(history.at(-1)!)
  const diff = diffCells(expected, actual)
  if (diff.length) {
    console.log(`\nfirst divergence at input ${i} ('${code}'), screen ${i + 1}:`)
    console.log(`context inputs: ${inputs.slice(Math.max(0, i - 12), i + 1).join('')}`)
    console.log(diff.slice(0, 40).join('\n'))
    if (diff.length > 40) console.log(`  ... ${diff.length - 40} more cells`)
    process.exit(1)
  }
}
console.log('no divergence: every screen matches')
