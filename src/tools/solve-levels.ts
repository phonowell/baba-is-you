#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { replayLevel, serializeState } from '../logic/replay.js'
import { solveState } from '../logic/solve.js'
import { createInitialState } from '../logic/state.js'

import type { SolveCaps, SolveResult, SolveStrategy } from '../logic/solve.js'
import type { LevelData } from '../logic/types.js'

// Offline solver sweep over the campaign levels. Reports one outcome per
// level: `solved` (with a replay-encoded input string), `exhausted`
// (reachable space fully explored — provably unwinnable under our
// semantics), or `cutoff` (resource bound hit — genuinely unknown).
//
// Usage:
//   pnpm tsx src/tools/solve-levels.ts [--only <substr>] [--start N]
//     [--end N] [--strategy bfs|greedy] [--max-depth N] [--max-states N]
//     [--timeout-ms N] [--out <file>]

type LevelOutcome = {
  index: number
  title: string
  outcome: SolveResult['kind']
  strategy?: SolveStrategy
  reason?: string
  inputs?: string
  depth?: number
  expanded: number
  ms: number
}

const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(`--${flag}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const numArg = (flag: string, fallback: number): number => {
  const raw = argValue(flag)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${flag} expects a number`)
  return value
}

// Golden record shape mirrors goldens.test.ts: `levelData` embeds the
// parsed layout so official levels (which have no .txt fixture) replay
// standalone; `level` stays empty instead of pointing at a missing file.
const goldenRecord = (
  level: LevelData,
  inputs: string,
  levelIndex?: number,
) => {
  const replay = replayLevel(level, inputs)
  const last = replay.states[replay.states.length - 1]
  return {
    level: '',
    ...(levelIndex !== undefined ? { levelIndex } : {}),
    levelData: level,
    inputs,
    initial: replay.initial,
    hashes: replay.hashes,
    final: last ? serializeState(last) : replay.initial,
    status: replay.finalStatus,
  }
}

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'level'

const emitGolden = async (
  dir: string,
  name: string,
  level: LevelData,
  inputs: string,
  levelIndex?: number,
): Promise<void> => {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, `${name}.json`),
    JSON.stringify(goldenRecord(level, inputs, levelIndex), null, 1),
    'utf8',
  )
}

const main = async (): Promise<void> => {
  const caps: SolveCaps = {
    maxDepth: numArg('max-depth', 64),
    maxStates: numArg('max-states', 250_000),
    deadlineMs: numArg('timeout-ms', 30_000),
    beamWidth: numArg('beam-width', 5000),
  }
  // `auto` runs bfs first (proven-shortest wins), then retries cutoffs
  // with beam search — beam wins are valid but neither optimal nor
  // exhaustive, so the report records which strategy produced them.
  const strategy = (argValue('strategy') ?? 'auto') as SolveStrategy | 'auto'
  if (
    !['bfs', 'greedy', 'astar', 'wastar', 'beam', 'auto'].includes(strategy)
  ) {
    throw new Error(
      '--strategy must be bfs, greedy, astar, wastar, beam, or auto',
    )
  }
  const only = argValue('only')?.toLowerCase()
  const start = numArg('start', 0)
  const end = numArg('end', levels.length - 1)
  // `--mod k/n` runs levels where index % n === k — balances the sweep
  // across parallel shards better than contiguous ranges do.
  const mod = argValue('mod')
  const [modKRaw, modNRaw] = mod ? mod.split('/').map(Number) : [0, 1]
  const modK = modKRaw ?? 0
  const modN = modNRaw ?? 1
  if (!Number.isInteger(modK) || !Number.isInteger(modN) || modN < 1) {
    throw new Error('--mod expects k/n')
  }
  const emitDir = argValue('emit-goldens')
  const improveDir = argValue('improve-goldens')

  // `--improve-goldens <dir>` re-solves every recorded golden with BFS
  // bounded to inputs.length-1: `solved` means a strictly shorter path
  // exists (emitted when --emit-goldens is set), `exhausted` proves the
  // recording was already optimal, `cutoff` stays unknown.
  if (improveDir) {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const root = path.resolve(process.cwd(), improveDir)
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })
    const files = walk(root).filter((f) => f.endsWith('.json'))
    let improved = 0
    let optimal = 0
    let unknown = 0
    for (const file of files) {
      const golden = JSON.parse(readFileSync(file, 'utf8')) as {
        level: string
        levelData?: LevelData
        inputs: string
      }
      const level =
        golden.levelData ??
        parseLevel(
          readFileSync(path.join(root, '..', golden.level), 'utf8'),
        )
      const name = path.relative(root, file).replace(/\.json$/, '')
      const bound = golden.inputs.length - 1
      const result = solveState(
        createInitialState(level, 0),
        { ...caps, maxDepth: bound },
        'bfs',
      )
      if (result.kind === 'solved') {
        improved += 1
        console.log(
          `${name}: improved ${golden.inputs.length} -> ${result.depth}`,
        )
        if (emitDir) {
          await emitGolden(
            emitDir,
            name.replaceAll('/', '-'),
            level,
            result.inputs,
          )
        }
      } else if (result.kind === 'exhausted') {
        optimal += 1
        console.log(`${name}: optimal at ${golden.inputs.length}`)
      } else {
        unknown += 1
        console.log(`${name}: unknown (${result.reason})`)
      }
    }
    console.log(
      `goldens: improved=${improved} optimal=${optimal} unknown=${unknown}`,
    )
    return
  }

  // `--level <path>` solves a single level file (e.g. a fixture under
  // levels/) instead of iterating the campaign list.
  const levelFile = argValue('level')
  const sources: Array<{ index: number; source: string }> = levelFile
    ? [
        {
          index: -1,
          source: await fs.readFile(
            path.resolve(process.cwd(), levelFile),
            'utf8',
          ),
        },
      ]
    : levels.map((source, index) => ({ index, source }))

  const outcomes: LevelOutcome[] = []
  const tally = { solved: 0, exhausted: 0, cutoff: 0, skipped: 0 }

  for (const { index, source } of sources) {
    if (!source) continue
    const data = parseLevel(source)
    const title = data.title
    if (
      index >= 0 &&
      (index < start ||
        index > end ||
        index % modN !== modK ||
        (only !== undefined && !title.toLowerCase().includes(only)))
    ) {
      tally.skipped += 1
      continue
    }

    const initial = createInitialState(data, index)
    const t0 = Date.now()
    const first: SolveStrategy = strategy === 'auto' ? 'bfs' : strategy
    let result = solveState(initial, caps, first)
    let used = first
    if (result.kind === 'cutoff' && strategy === 'auto') {
      result = solveState(initial, caps, 'beam')
      used = 'beam'
    }
    const ms = Date.now() - t0

    const outcome: LevelOutcome = {
      index,
      title,
      outcome: result.kind,
      strategy: used,
      expanded: result.expanded,
      ms,
      ...(result.kind === 'solved'
        ? { inputs: result.inputs, depth: result.depth }
        : {}),
      ...(result.kind === 'cutoff' ? { reason: result.reason } : {}),
    }
    outcomes.push(outcome)
    tally[result.kind] += 1
    const detail =
      result.kind === 'solved'
        ? `${result.depth} moves ${result.inputs}`
        : `${result.kind === 'cutoff' ? `${result.reason}, ` : ''}${result.expanded} expanded`
    console.log(
      `[${index}] ${title}: ${result.kind} (${detail}, ${ms}ms)`,
    )
    if (result.kind === 'solved' && emitDir) {
      const name = `${String(index).padStart(3, '0')}-${slugify(title)}`
      await emitGolden(emitDir, name, data, result.inputs, index)
    }
  }

  console.log(
    `solved=${tally.solved} exhausted=${tally.exhausted} ` +
      `cutoff=${tally.cutoff} skipped=${tally.skipped}`,
  )

  const out = argValue('out')
  if (out) {
    const report = {
      caps,
      strategy,
      tally,
      levels: outcomes,
    }
    await fs.mkdir(path.dirname(path.resolve(process.cwd(), out)), {
      recursive: true,
    })
    await fs.writeFile(
      path.resolve(process.cwd(), out),
      JSON.stringify(report, null, 2),
      'utf8',
    )
    console.log(`wrote ${out}`)
  }
}

const isDirectRun = (() => {
  const argvEntry = process.argv[1]
  if (!argvEntry) return false
  return pathToFileURL(path.resolve(argvEntry)).href === import.meta.url
})()

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}
