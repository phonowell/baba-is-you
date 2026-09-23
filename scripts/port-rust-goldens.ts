#!/usr/bin/env tsx
// Ports golden replays from the predecessor Rust project (`../baba`):
// decodes each `goldens/*.ron.br` (brotli'd RON tuple of screens+inputs),
// extracts the input sequence, replays it on this engine over the matching
// entity-list level file, and records our own `goldens/*.json` snapshots for
// the sequences that still reach a win.
//
// Usage: tsx scripts/port-rust-goldens.ts [--src ../baba] [--out goldens]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { parseLevel } from '../src/logic/parse-level.js'
import { replayLevel } from '../src/logic/replay.js'
import { argValue, walkFiles } from '../src/tools/cli.js'
import {
  findLevelFile,
  levelFromScreen,
  loadRustGolden,
  strictLayoutSignature,
} from './lib-rust-golden.js'

import type { LevelData } from '../src/logic/types.js'

const SRC = argValue('src') ?? '../baba'
const OUT = argValue('out') ?? 'goldens'

// Some recordings predate later level-file edits (e.g. legend orientation
// nitpicks). When the recorded first screen disagrees with the current file,
// rebuild the level from the recording itself so the golden stays testable.

let recorded = 0
let skipped = 0
for (const path of walkFiles(join(SRC, 'goldens')).sort()) {
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
    levelData = parseLevel(readFileSync(levelPath, 'utf8'))
    const firstScreen = golden_.screens[0]
    if (!firstScreen) throw new Error('golden has no screens')
    const recorded = levelFromScreen(firstScreen, levelData.title)
    if (strictLayoutSignature(recorded) !== strictLayoutSignature(levelData)) {
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
