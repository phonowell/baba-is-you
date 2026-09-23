#!/usr/bin/env tsx
// Re-snapshots `goldens/*.json` against the current `levels/*.txt`
// entity-list fixtures. Item order changed with the format revert, so every
// live-referencing golden needs fresh `initial`/`hashes`/`final` strings.
//
// Per golden:
//   - replay the recorded inputs on the live file; if that reaches a win,
//     rewrite the golden against the live file (dropping stale levelData
//     embeds — the live layout is canonical again)
//   - otherwise, if the golden embeds `levelData`, replay against the
//     recorded layout; a still-winning run gets a fresh hash trajectory
//     on that layout (intermediate snapshots drift with engine fixes)
//   - otherwise report the failure and leave the file untouched
//
// Usage: tsx scripts/resnapshot-goldens.ts [--out goldens]

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { parseLevel } from '../src/logic/parse-level.js'
import { replayLevel } from '../src/logic/replay.js'
import { decodeReplayInput } from '../src/logic/replay-input.js'

import type { LevelData } from '../src/logic/types.js'

const args = process.argv.slice(2)
const argValue = (name: string, fallback: string): string => {
  const ix = args.indexOf(name)
  return ix >= 0 ? (args[ix + 1] ?? fallback) : fallback
}
const OUT = argValue('--out', 'goldens')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

type Golden = {
  level: string
  levelIndex?: number
  levelData?: LevelData
  inputs: string
  initial: string
  hashes: string[]
  final: string
  status: string
}

let rewritten = 0
let failed = 0
for (const path of walk(OUT).sort()) {
  if (!path.endsWith('.json')) continue
  const name = relative(OUT, path).replace(/\.json$/, '')
  const golden = JSON.parse(readFileSync(path, 'utf8')) as Golden

  let level: LevelData | undefined
  try {
    level = parseLevel(readFileSync(golden.level, 'utf8'))
  } catch {
    level = undefined
  }

  const rewrite = (levelData: LevelData, extra: Record<string, unknown>) => {
    const result = replayLevel(levelData, golden.inputs)
    const winIx = result.states.findIndex((state) => state.status === 'win')
    if (winIx < 0) return false
    // states[] records one entry per consumed input — skip codes push
    // none — so the winning press is the (winIx + 1)-th non-skip char.
    let cutLen = 0
    let consumed = 0
    for (const code of golden.inputs) {
      cutLen += 1
      if (decodeReplayInput(code).kind === 'skip') continue
      consumed += 1
      if (consumed > winIx) break
    }
    const cutInputs = golden.inputs.slice(0, cutLen)
    const cut = replayLevel(levelData, cutInputs)
    const next = {
      level: golden.level,
      ...extra,
      inputs: cutInputs,
      initial: cut.initial,
      hashes: cut.hashes,
      final: cut.snapshots[cut.snapshots.length - 1] ?? '',
      status: cut.finalStatus,
    }
    writeFileSync(path, `${JSON.stringify(next, null, 1)}\n`)
    return true
  }

  if (level) {
    if (rewrite(level, {})) {
      rewritten += 1
      console.log(
        `✓ ${name}${golden.levelData ? ' (re-pinned to live file)' : ''}`,
      )
      continue
    }
  }

  if (golden.levelData) {
    // Embedded-layout goldens still pin their recorded board; when the
    // replay still wins, refresh the hash trajectory too — intermediate
    // snapshots drift with engine fixes even when the inputs still solve.
    if (rewrite(golden.levelData, {
      ...(golden.levelIndex !== undefined
        ? { levelIndex: golden.levelIndex }
        : {}),
      levelData: golden.levelData,
    })) {
      rewritten += 1
      console.log(`· ${name} (re-hashed on recorded layout)`)
      continue
    }
    console.log(`✗ ${name}: recorded layout no longer wins`)
    failed += 1
    continue
  }

  console.log(`✗ ${name}: live file does not win and no recorded layout`)
  failed += 1
}
console.log(`rewritten=${rewritten} failed=${failed}`)
