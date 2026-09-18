#!/usr/bin/env tsx
// Ports golden replays from the predecessor Rust project (`../baba`):
// decodes each `goldens/*.ron.br` (brotli'd RON tuple of screens+inputs),
// extracts the input sequence, replays it on this engine over the matching
// ASCII level file, and records our own `goldens/*.json` snapshots for the
// sequences that still reach a win.
//
// Usage: tsx scripts/port-rust-goldens.ts [--src ../baba] [--out goldens]

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { parseAsciiLevel } from '../src/logic/parse-ascii-level.js'
import { replayLevel } from '../src/logic/replay.js'
import { levelFromScreen, loadRustGolden } from './lib-rust-golden.js'

import type { LevelData } from '../src/logic/types.js'

const args = process.argv.slice(2)
const argValue = (name: string, fallback: string): string => {
  const ix = args.indexOf(name)
  return ix >= 0 ? (args[ix + 1] ?? fallback) : fallback
}
const SRC = argValue('--src', '../baba')
const OUT = argValue('--out', 'goldens')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

// Some recordings predate later level-file edits (e.g. legend orientation
// nitpicks). When the recorded first screen disagrees with the current file,
// rebuild the level from the recording itself so the golden stays testable.

const layoutOf = (l: LevelData): string =>
  l.items
    .map(
      (i) =>
        `${i.name}${i.isText ? '!' : ''}@${i.x},${i.y}@${i.dir ?? 'right'}`,
    )
    .sort()
    .join(';')

const findLevelFile = (rel: string): string | undefined => {
  const parsed = /^(?:(\d+)\/)?(extra-\d+|[a-z0-9]+)(?:-\d+)?\.ron\.br$/.exec(rel)
  if (!parsed) return undefined
  const [, world, selector] = parsed
  const dirs = world
    ? readdirSync('levels').filter((e) => e.startsWith(`${world}-`))
    : ['']
  for (const dir of dirs) {
    const abs = join('levels', dir)
    if (!statSync(abs).isDirectory()) continue
    const hit = readdirSync(abs).find(
      (e) => e.startsWith(`${selector}-`) && e.endsWith('.txt'),
    )
    if (hit) return join(abs, hit)
  }
  return undefined
}

let recorded = 0
let skipped = 0
for (const path of walk(join(SRC, 'goldens')).sort()) {
  if (!path.endsWith('.ron.br')) continue
  const rel = relative(join(SRC, 'goldens'), path)
  const levelPath = findLevelFile(rel)
  const label = rel.replace(/\.ron\.br$/, '')
  if (!levelPath) {
    console.log(`✗ ${rel}: no level file match`)
    skipped += 1
    continue
  }
  let golden_: ReturnType<typeof loadRustGolden>
  let levelData: LevelData
  let usedRecordedLayout = false
  try {
    golden_ = loadRustGolden(path)
    levelData = parseAsciiLevel(readFileSync(levelPath, 'utf8'), levelPath)
    const recorded = levelFromScreen(golden_.screens[0], levelData.title)
    if (layoutOf(recorded) !== layoutOf(levelData)) {
      levelData = recorded
      usedRecordedLayout = true
    }
  } catch (error) {
    console.log(`✗ ${rel}: ${(error as Error).message}`)
    skipped += 1
    continue
  }
  const inputs = golden_.inputs.join('')

  const result = replayLevel(levelData, inputs)
  // Keep the run up to the first win; a sequence that never wins cannot be
  // a golden under our engine even if it won under the Rust one.
  const winIx = result.states.findIndex((state) => state.status === 'win')
  if (winIx === -1) {
    console.log(
      `✗ ${rel} -> ${levelPath}: no win under our engine${usedRecordedLayout ? ' (recorded layout)' : ''}`,
    )
    skipped += 1
    continue
  }
  const cutInputs = inputs.slice(0, winIx + 1)
  const cut = replayLevel(levelData, cutInputs)
  const golden = {
    level: relative('.', levelPath),
    ...(usedRecordedLayout
      ? {
          levelData: {
            title: levelData.title,
            width: levelData.width,
            height: levelData.height,
            items: levelData.items,
          },
        }
      : {}),
    inputs: cutInputs,
    initial: cut.initial,
    hashes: cut.hashes,
    final: cut.snapshots[cut.snapshots.length - 1] ?? '',
    status: cut.finalStatus,
  }
  const outPath = join(OUT, `${label}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(golden, null, 1)}\n`)
  recorded += 1
  const truncNote =
    winIx + 1 < inputs.length
      ? ` (truncated at first win ${winIx + 1}/${inputs.length})`
      : ''
  const layoutNote = usedRecordedLayout ? ' [recorded layout]' : ''
  console.log(`✓ ${rel} -> ${levelPath}${truncNote}${layoutNote}`)
}
console.log(`recorded=${recorded} skipped=${skipped}`)
