#!/usr/bin/env tsx
import {
  promises as fs,
  readdirSync,
} from 'node:fs'
import path from 'node:path'

import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { replayLevel } from '../logic/replay.js'
import { argValue, runCliMain, walkFiles } from './cli.js'
import { goldenRecord, slugify } from './solve-levels.js'

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
//     [--prefer-better]
//
// With --prefer-better, solutions are also replayed against levels a
// golden already covers; when the community path wins AND is shorter
// than the recorded inputs, the golden is emitted under the existing
// filename so merging the emit dir replaces it. Equal/longer paths and
// paths that lose keep the incumbent golden untouched.

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
  const preferBetter = process.argv.includes('--prefer-better')

  const campaign: LevelData[] = levels.map((source) => parseLevel(source))
  const byTitle = new Map<string, number[]>()
  campaign.forEach((level, index) => {
    const key = normTitle(level.title)
    const list = byTitle.get(key) ?? []
    list.push(index)
    byTitle.set(key, list)
  })

  // `level-code-map.json` (rebuild: build-level-code-map.ts) pins a
  // filename's `Level <code>` ref to the exact campaign index, resolving
  // same-title variants across worlds (`Secret Garden` exists twice).
  const codeIndex = new Map<string, number>()
  try {
    const codeMap = JSON.parse(
      await fs.readFile(
        path.join(import.meta.dirname, 'level-code-map.json'),
        'utf8',
      ),
    ) as Record<string, { index: number | null }>
    for (const [code, entry] of Object.entries(codeMap)) {
      if (entry.index !== null) codeIndex.set(code.toLowerCase(), entry.index)
    }
  } catch {
    // Map missing — fall back to title-only matching.
  }

  // Levels a recorded golden already binds — importing over them would
  // redo work the corpus already covers. With --prefer-better the
  // incumbent's input length is kept so a shorter community path can
  // still replace it; multiple goldens on one index keep the shortest.
  // The emit dir is scanned too: emitting without an explicit skip set
  // must still respect incumbents, or every equal/longer community
  // replay would churn (or regress) an already-good golden.
  const coverageDir = skipDir ?? emitDir
  const covered = new Map<number, { file: string; inputs: number }>()
  if (coverageDir !== undefined) {
    for (const file of walkFiles(coverageDir)) {
      try {
        const record = JSON.parse(await fs.readFile(file, 'utf8')) as {
          levelIndex?: number
          inputs?: string
        }
        if (record.levelIndex === undefined) continue
        const inputs = record.inputs?.length ?? Number.MAX_SAFE_INTEGER
        const prior = covered.get(record.levelIndex)
        if (prior === undefined || inputs < prior.inputs)
          covered.set(record.levelIndex, { file, inputs })
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
  const tally = {
    verified: 0,
    improved: 0,
    failed: 0,
    unmatched: 0,
    skipped: 0,
  }
  const failed: string[] = []
  const unmatched: string[] = []
  const improved: string[] = []

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

    // A `Level <code>` ref pins the board; the code is authoritative so
    // a failing replay means an engine gap on that exact level — never
    // retried against same-title siblings (that could bind the wrong
    // variant). Entries without a code keep title matching.
    const refCode = entry.levelRef
      .replace(/^Level\s+/i, '')
      .replaceAll('(q)', '?')
    const pinned = codeIndex.get(refCode.toLowerCase())
    const candidates =
      pinned !== undefined
        ? [pinned]
        : (byTitle.get(normTitle(entry.title)) ?? [])
    if (candidates.length === 0) {
      tally.unmatched += 1
      unmatched.push(`${entry.levelRef} ${entry.title}`)
      continue
    }
    // New coverage beats an improvement — uncovered boards are tried
    // first so a same-title duplicate binds there when it can.
    const pending = [
      ...candidates.filter((index) => !covered.has(index)),
      ...(preferBetter
        ? candidates.filter((index) => covered.has(index))
        : []),
    ]
    if (pending.length === 0) {
      tally.skipped += 1
      continue
    }

    // Variant solutions (`LEVEL IS BABA`, `FLAG IS END`) beat the board
    // by rewriting the level itself — officially that exits to the map
    // rather than ending in `win`, so they can never verify under our
    // flat-level engine. Report them apart from real engine gaps.
    const variantSkip =
      entry.variant !== '' &&
      /\b(?:level|flag|all|empty|text) is /i.test(entry.variant)

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
    let replaces: { file: string; inputs: number } | undefined
    let closest = ''
    for (const index of pending) {
      const board = campaign[index]
      if (board === undefined) continue
      const replay = replayLevel(board, inputs)
      if (replay.finalStatus === 'win') {
        bound = index
        const incumbent = covered.get(index)
        replaces =
          incumbent !== undefined && inputs.length < incumbent.inputs
            ? incumbent
            : undefined
        if (emitDir !== undefined && (incumbent === undefined || replaces)) {
          // Improvements reuse the incumbent's filename so merging the
          // emit dir overwrites in place rather than adding a sibling.
          const name =
            replaces !== undefined
              ? path.basename(replaces.file, '.json')
              : `${String(index).padStart(3, '0')}-${slugify(entry.title)}`
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
      const incumbent = covered.get(bound)
      if (incumbent === undefined) {
        tally.verified += 1
        console.log(
          `✓ [${bound}] ${entry.title} — ${inputs.length} inputs (${named.file})`,
        )
      } else if (replaces !== undefined) {
        tally.improved += 1
        improved.push(
          `[${bound}] ${entry.title}: ${replaces.inputs} → ${inputs.length} inputs`,
        )
        console.log(
          `↑ [${bound}] ${entry.title} — ${replaces.inputs} → ` +
            `${inputs.length} inputs (${named.file})`,
        )
      } else {
        tally.skipped += 1
      }
    } else {
      // A path that fails only on uncovered same-title variants is a
      // name collision, not an engine gap — the oracle was recorded on
      // the already-covered sibling. Flag those separately so the
      // failure list stays a clean gap-hunting signal.
      const coveredSibling =
        pinned === undefined &&
        candidates.some((index) => covered.has(index))
      const dupes = ` tried=${pending.join('/')}`
      const tag = variantSkip
        ? 'MAP'
        : coveredSibling
          ? 'VARIANT'
          : 'FAILED'
      if (variantSkip || coveredSibling) tally.skipped += 1
      else tally.failed += 1
      failed.push(
        `${tag === 'FAILED' ? '' : `${tag} `}${entry.levelRef} ` +
          `${entry.title} [${inputs.length}i ${closest}${dupes}]`,
      )
    }
  }

  console.log(
    `\nverified=${tally.verified} improved=${tally.improved} ` +
      `failed=${tally.failed} unmatched=${tally.unmatched} ` +
      `skipped=${tally.skipped}`,
  )
  if (improved.length)
    console.log(`IMPROVED (shorter community path):\n  ${improved.join('\n  ')}`)
  if (failed.length)
    console.log(`FAILED (engine-gap suspects):\n  ${failed.join('\n  ')}`)
  if (unmatched.length)
    console.log(`UNMATCHED titles:\n  ${unmatched.join('\n  ')}`)
}

runCliMain(import.meta.url, main)
