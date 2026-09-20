#!/usr/bin/env tsx
import {
  promises as fs,
  readdirSync,
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { replayLevel } from '../logic/replay.js'
import { goldenRecord } from './solve-levels.js'

import type { LevelData } from '../logic/types.js'

// Import community-verified solutions (the "Discord Collective" archive
// from SzieberthAdam/baba-is-optimized): files named
// `Level <world>-<n>, <Title>[, <variant>], <moves>.txt` hold a compact
// movestring — `R8` means eight rights, `-` is a readability separator,
// `W` waits, `X` exits to the map (dropped), `Z` is the archive's undo
// marker (mapped to our `z`). Replaying through our own engine both
// verifies the path and catches semantics gaps — a solution that loses
// under our step() is a fidelity bug to fix, not a golden.
//
// Usage:
//   pnpm tsx src/tools/import-solutions.ts --solutions <dir>
//     [--emit-goldens <dir>] [--skip-goldens <dir>] [--only <substr>]

const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(`--${flag}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'level'

const normTitle = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9?]+/g, '')

type SolutionEntry = {
  file: string
  levelRef: string
  title: string
  variant: string
  moves: number
}

const parseSolutionName = (file: string): SolutionEntry | undefined => {
  const match = /^(.*), (\d+)\.txt$/.exec(file)
  if (!match || match[1] === undefined || match[2] === undefined)
    return undefined
  const head = match[1]
  const parts = head.split(', ')
  const levelRef = parts[0] ?? ''
  const title = (parts[1] ?? '').replaceAll('(q)', '?')
  const variant = parts
    .slice(2)
    .map((part) => part.replaceAll('(q)', '?'))
    .join(', ')
  return { file, levelRef, title, variant, moves: Number(match[2]) }
}

// Expand `LD4R2D-RUW` style strings to our `ldddr…` input alphabet. A
// digit RUN after a letter is that letter's total count (`R10` = ten
// rights, not R then "1" then "0").
const decodeMoves = (raw: string): string => {
  const out: string[] = []
  let pending = ''
  const flush = (digits: string): void => {
    if (pending === '') return
    const count = digits === '' ? 1 : Number(digits)
    for (let i = 0; i < count; i += 1) out.push(pending)
  }
  let digits = ''
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      digits += ch
      continue
    }
    flush(digits)
    digits = ''
    const mapped = { U: 'u', D: 'd', L: 'l', R: 'r', W: 'w', Z: 'z' }[ch]
    if (mapped !== undefined) {
      pending = mapped
      continue
    }
    pending = ''
    // `-`, whitespace, `X` (exit to map) — separators and post-win noise.
  }
  flush(digits)
  return out.join('')
}

const main = async (): Promise<void> => {
  const solutionsDir = argValue('solutions')
  if (solutionsDir === undefined && argValue('solutions-json') === undefined)
    throw new Error('--solutions <dir> or --solutions-json <file> required')
  const emitDir = argValue('emit-goldens')
  const skipDir = argValue('skip-goldens')
  const only = argValue('only')?.toLowerCase()

  const campaign: LevelData[] = levels.map((source) => parseLevel(source))
  const byTitle = new Map<string, number[]>()
  campaign.forEach((level, index) => {
    const key = normTitle(level.title)
    const list = byTitle.get(key) ?? []
    list.push(index)
    byTitle.set(key, list)
  })

  // Levels a recorded golden already binds — importing over them would
  // redo work the corpus already covers.
  const covered = new Set<number>()
  if (skipDir !== undefined) {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      )
    for (const file of walk(skipDir)) {
      try {
        const record = JSON.parse(await fs.readFile(file, 'utf8')) as {
          levelIndex?: number
        }
        if (record.levelIndex !== undefined) covered.add(record.levelIndex)
      } catch {
        // Unreadable records can't prove coverage — keep them out of the
        // skip set rather than silently trusting them.
      }
    }
  }

  // `--solutions-json <file>`: alternate flat format `{title: movestring}`
  // (e.g. stared/baba-is-harbor's engine-verified oracles). Movestrings are
  // already in our lowercase ud lr w alphabet.
  const jsonPath = argValue('solutions-json')
  type Named = { file: string; levelRef: string; title: string; body: string }
  const entries: Named[] =
    jsonPath !== undefined
      ? Object.entries(
          JSON.parse(await fs.readFile(jsonPath, 'utf8')) as Record<
            string,
            string
          >,
        ).map(([title, body]) => ({
          file: title,
          levelRef: 'harbor',
          title,
          body,
        }))
      : readdirSync(solutionsDir ?? '')
          .filter((f) => f.endsWith('.txt'))
          .map((file) => ({ file, levelRef: '', title: '', body: '' }))
  const tally = { verified: 0, failed: 0, unmatched: 0, skipped: 0 }
  const failed: string[] = []
  const unmatched: string[] = []

  for (const named of entries.sort((a, b) => a.file.localeCompare(b.file))) {
    const entry =
      named.levelRef === 'harbor'
        ? {
            file: named.file,
            levelRef: named.levelRef,
            title: named.title,
            variant: '',
            moves: 0,
          }
        : parseSolutionName(named.file)
    if (entry === undefined) continue
    if (only !== undefined && !normTitle(entry.title).includes(only)) continue

    const candidates = byTitle.get(normTitle(entry.title)) ?? []
    const pending = candidates.filter((index) => !covered.has(index))
    if (candidates.length === 0) {
      tally.unmatched += 1
      unmatched.push(`${entry.levelRef} ${entry.title}`)
      continue
    }
    if (pending.length === 0) {
      tally.skipped += 1
      continue
    }

    const inputs =
      named.levelRef === 'harbor'
        ? named.body.trim()
        : decodeMoves(
            await fs.readFile(
              path.join(solutionsDir ?? '', named.file),
              'utf8',
            ),
          )
    let bound = -1
    let closest = ''
    for (const index of pending) {
      const board = campaign[index]
      if (board === undefined) continue
      const replay = replayLevel(board, inputs)
      if (replay.finalStatus === 'win') {
        bound = index
        if (emitDir !== undefined) {
          const name = `${String(index).padStart(3, '0')}-${slugify(entry.title)}`
          await fs.mkdir(emitDir, { recursive: true })
          await fs.writeFile(
            path.join(emitDir, `${name}.json`),
            JSON.stringify(goldenRecord(board, inputs, index), null, 1),
            'utf8',
          )
        }
        break
      }
      // Report how deep the replay got before diverging: an early `lose`
      // is a lethal-semantics gap, a full-length `playing` means the win
      // condition itself never formed.
      const steps = replay.states.length - 1
      const tag = `${replay.finalStatus}@${steps}/${inputs.length}`
      if (closest === '' || steps > Number(closest.split('@')[1])) closest = tag
    }
    if (bound >= 0) {
      tally.verified += 1
      console.log(
        `✓ [${bound}] ${entry.title} — ${inputs.length} inputs (${named.file})`,
      )
    } else {
      tally.failed += 1
      const dupes = ` tried=${pending.join('/')}`
      failed.push(
        `${entry.levelRef} ${entry.title} ` +
          `[${inputs.length}i ${closest}${dupes}]`,
      )
    }
  }

  console.log(
    `\nverified=${tally.verified} failed=${tally.failed} ` +
      `unmatched=${tally.unmatched} skipped=${tally.skipped}`,
  )
  if (failed.length)
    console.log(`FAILED (engine-gap suspects):\n  ${failed.join('\n  ')}`)
  if (unmatched.length)
    console.log(`UNMATCHED titles:\n  ${unmatched.join('\n  ')}`)
}

const invokedDirectly = (() => {
  const argvEntry = process.argv[1]
  if (!argvEntry) return false
  return pathToFileURL(path.resolve(argvEntry)).href === import.meta.url
})()

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
