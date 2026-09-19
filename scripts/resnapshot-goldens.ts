#!/usr/bin/env tsx
// Re-snapshots `goldens/*.json` against the current `levels/*.txt`
// entity-list fixtures. Item order changed with the format revert, so every
// live-referencing golden needs fresh `initial`/`hashes`/`final` strings.
//
// Per golden:
//   - replay the recorded inputs on the live file; if that reaches a win,
//     rewrite the golden against the live file (dropping stale levelData
//     embeds — the live layout is canonical again)
//   - otherwise, if the golden embeds `levelData`, verify the recorded
//     layout still wins and leave the file untouched
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
  levelData?: LevelData
  inputs: string
  initial: string
  hashes: string[]
  final: string
  status: string
}

let rewritten = 0
let keptEmbed = 0
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

  if (level) {
    const result = replayLevel(level, golden.inputs)
    const winIx = result.states.findIndex((state) => state.status === 'win')
    if (winIx >= 0) {
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
      const cut = replayLevel(level, cutInputs)
      const next = {
        level: golden.level,
        inputs: cutInputs,
        initial: cut.initial,
        hashes: cut.hashes,
        final: cut.snapshots[cut.snapshots.length - 1] ?? '',
        status: cut.finalStatus,
      }
      writeFileSync(path, `${JSON.stringify(next, null, 1)}\n`)
      rewritten += 1
      console.log(
        `✓ ${name}${golden.levelData ? ' (re-pinned to live file)' : ''}`,
      )
      continue
    }
  }

  if (golden.levelData) {
    const result = replayLevel(golden.levelData, golden.inputs)
    const winIx = result.states.findIndex((state) => state.status === 'win')
    if (winIx >= 0) {
      keptEmbed += 1
      console.log(`· ${name} (kept recorded layout)`)
      continue
    }
    console.log(`✗ ${name}: recorded layout no longer wins`)
    failed += 1
    continue
  }

  console.log(`✗ ${name}: live file does not win and no recorded layout`)
  failed += 1
}
console.log(`rewritten=${rewritten} keptEmbed=${keptEmbed} failed=${failed}`)
