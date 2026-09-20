#!/usr/bin/env tsx
import {
  promises as fs,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { decodeReplayInput } from '../logic/replay-input.js'
import {
  compressInputs,
  replayLevel,
  serializeState,
} from '../logic/replay.js'
import { solveState, solveToLayout } from '../logic/solve.js'
import { createInitialState } from '../logic/state.js'
import { step } from '../logic/step.js'

import type { SolveCaps, SolveResult, SolveStrategy } from '../logic/solve.js'
import type { GameState, LevelData } from '../logic/types.js'

// Offline solver sweep over the campaign levels. Reports one outcome per
// level: `solved` (with a replay-encoded input string), `exhausted`
// (reachable space fully explored — provably unwinnable under our
// semantics), or `cutoff` (resource bound hit — genuinely unknown).
//
// Usage:
//   pnpm tsx src/tools/solve-levels.ts [--only <substr>] [--start N]
//     [--end N] [--strategy bfs|greedy] [--max-depth N] [--max-states N]
//     [--timeout-ms N] [--out <file>]
//     [--resolve-goldens <dir>] [--waypoint-stride N]
//     [--seg-timeout-ms N] [--seg-max-states N]

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
// Exported for the community-solutions importer (import-solutions.ts).
export const goldenRecord = (
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

const walkJson = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walkJson(full) : [full]
  })

// Layout identity matching goldens.test.ts and the web binding —
// (text-flagged name, cell) set, facing/dupes collapsed.
const layoutSignature = (level: LevelData): string =>
  `${level.width}x${level.height}|` +
  [
    ...new Set(
      level.items.map(
        (item) => `${item.isText ? '!' : ''}${item.name}@${item.x},${item.y}`,
      ),
    ),
  ]
    .sort()
    .join(';')

const normalizeTitle = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '')

// Step a state through an input slice — unchanged moves leave the state
// alone, mirroring replayLevel's history handling without the undo stack
// (the spliced inputs we generate never contain `z`).
const replayFrom = (state: GameState, inputs: string): GameState => {
  let current = state
  for (const code of inputs) {
    const decoded = decodeReplayInput(code)
    if (decoded.kind !== 'move') continue
    const result = step(current, decoded.direction)
    if (result.changed) current = result.state
  }
  return current
}

type CampaignEntry = { index: number; data: LevelData }

// Wire a golden to its campaign level. Signature hits are only
// candidates: the signature ignores `dir`, so an old fixture lacking
// facings can collide with a campaign board full of directional movers —
// the recorded inputs are the ground truth, so every candidate must
// actually be beaten by them before it counts as wired.
const findCampaignIndex = (
  level: LevelData,
  inputs: string,
  campaign: CampaignEntry[],
  bySignature: Map<string, number[]>,
  byTitle: Map<string, number[]>,
): number | undefined => {
  const signatureHits = bySignature.get(layoutSignature(level)) ?? []
  const titleHits = byTitle.get(normalizeTitle(level.title)) ?? []
  const candidates = [
    ...signatureHits,
    ...titleHits.filter((index) => !signatureHits.includes(index)),
  ]
  for (const index of candidates) {
    const candidate = campaign[index]
    if (!candidate) continue
    if (replayLevel(candidate.data, inputs).finalStatus === 'win')
      return index
  }
  return undefined
}

type ResolveReport = {
  name: string
  levelIndex?: number
  wired: boolean
  recorded: number
  compressed: number
  final: number
  segments: number
  solvedSegments: number
  verified: boolean
  emitted?: string
}

// `--resolve-goldens <dir>` re-solves every recorded golden: the inputs
// are compressed to their effective (z-free) path, replayed into sparse
// waypoint states, and each segment is re-found by a bounded BFS toward
// the next waypoint's layout. Segments the search can't reach fall back
// to the recorded slice, and the whole splice is verified end-to-end —
// a failed verification keeps the compressed recording (still a win).
const resolveGoldens = async (
  root: string,
  emitDir: string | undefined,
  only: string | undefined,
  mod: { k: number; n: number },
): Promise<void> => {
  const stride = numArg('waypoint-stride', 10)
  const segDeadline = numArg('seg-timeout-ms', 8_000)
  const segStates = numArg('seg-max-states', 60_000)

  const campaign: CampaignEntry[] = levels.map((source, index) => ({
    index,
    data: parseLevel(source),
  }))
  const bySignature = new Map<string, number[]>()
  const byTitle = new Map<string, number[]>()
  for (const entry of campaign) {
    const sig = layoutSignature(entry.data)
    bySignature.set(sig, [...(bySignature.get(sig) ?? []), entry.index])
    const title = normalizeTitle(entry.data.title)
    byTitle.set(title, [...(byTitle.get(title) ?? []), entry.index])
  }

  const files = walkJson(root)
    .filter((file) => file.endsWith('.json'))
    .sort()
  const reports: ResolveReport[] = []
  const tally = { wired: 0, unwired: 0, improved: 0, failed: 0 }

  let fileIdx = -1
  for (const file of files) {
    fileIdx += 1
    if (fileIdx % mod.n !== mod.k) continue
    const name = path.relative(root, file).replace(/\.json$/, '')
    if (only !== undefined && !name.toLowerCase().includes(only)) continue
    const golden = JSON.parse(readFileSync(file, 'utf8')) as {
      level: string
      levelIndex?: number
      levelData?: LevelData
      inputs: string
    }
    const fixtureLevel =
      golden.levelData ??
      parseLevel(readFileSync(path.join(root, '..', golden.level), 'utf8'))
    const compressed = compressInputs(fixtureLevel, golden.inputs)

    // Pick the board the re-solve runs on: the wired campaign level when
    // the recording binds to one, otherwise the golden's own layout.
    const wiredIndex =
      golden.levelIndex ??
      findCampaignIndex(
        fixtureLevel,
        compressed,
        campaign,
        bySignature,
        byTitle,
      )
    const board =
      wiredIndex !== undefined
        ? (campaign[wiredIndex]?.data ?? fixtureLevel)
        : fixtureLevel
    // Re-compress when the campaign board differs — the compressed path
    // still wins there (that's what the binding check proved).
    const boardInputs =
      board === fixtureLevel
        ? compressed
        : compressInputs(board, compressed)
    // The trajectory ends at the first win — anything the recording did
    // afterwards is post-win drift, not a waypoint worth chasing.
    const replayed = replayLevel(board, boardInputs).states
    const winAt = replayed.findIndex((state) => state.status === 'win')
    const states = winAt >= 0 ? replayed.slice(0, winAt + 1) : replayed

    // Sparse waypoints over the effective trajectory; the final recorded
    // state is a win, so the last segment searches for the win itself.
    const waypointIdx: number[] = []
    for (let i = stride; i < states.length - 1; i += stride)
      waypointIdx.push(i)
    if (states.length > 0) waypointIdx.push(states.length - 1)

    let out = ''
    let cursor = createInitialState(board, wiredIndex ?? 0)
    let prevIdx = -1
    let solvedSegments = 0
    for (const wi of waypointIdx) {
      const target = states[wi]
      if (!target) continue
      const slice = boardInputs.slice(prevIdx + 1, wi + 1)
      const segCaps: SolveCaps = {
        maxDepth: Math.max(8, Math.ceil(slice.length * 1.5)),
        maxStates: segStates,
        deadlineMs: segDeadline,
      }
      const isFinal = wi === states.length - 1
      const result = isFinal
        ? solveState(cursor, segCaps, 'bfs')
        : solveToLayout(cursor, target, segCaps)
      if (result.kind === 'solved') {
        out += result.inputs
        cursor = result.state
        solvedSegments += 1
      } else {
        out += slice
        cursor = replayFrom(cursor, slice)
      }
      prevIdx = wi
      // A mid-chain win already ends the level — the remaining waypoints
      // are moot once the board is beaten.
      if (cursor.status === 'win') break
    }

    const verified = replayLevel(board, out).finalStatus === 'win'
    if (!verified) out = boardInputs

    const report: ResolveReport = {
      name,
      wired: wiredIndex !== undefined,
      ...(wiredIndex !== undefined ? { levelIndex: wiredIndex } : {}),
      recorded: golden.inputs.length,
      compressed: boardInputs.length,
      final: out.length,
      segments: waypointIdx.length,
      solvedSegments,
      verified,
    }
    reports.push(report)
    tally[wiredIndex !== undefined ? 'wired' : 'unwired'] += 1
    if (out.length < golden.inputs.length) tally.improved += 1
    if (!verified) tally.failed += 1

    if (emitDir) {
      // Never stamp a campaign index on a record that doesn't beat the
      // board it will be bound to — a losing NNN-slug file fails the
      // golden gate and misleads the web solution button.
      if (wiredIndex !== undefined) {
        if (replayLevel(board, out).finalStatus === 'win') {
          const title = campaign[wiredIndex]?.data.title ?? board.title
          const emitName = `${String(wiredIndex).padStart(3, '0')}-${slugify(title)}`
          await emitGolden(emitDir, emitName, board, out, wiredIndex)
          report.emitted = emitName
        }
      } else {
        // Unwired recordings stay fixture-bound — same shape as the
        // original record so the consistency gate still passes. Emit
        // under the original relative name: pointed at goldens/ this
        // upgrades the recording in place instead of duplicating it.
        // `levelData` must be carried over when the original had it —
        // the embedded board is what the recording actually replays on;
        // dropping it would bind a drifted fixture file to stale inputs.
        const replay = replayLevel(board, out)
        const last = replay.states[replay.states.length - 1]
        const emitPath = path.join(emitDir, `${name}.json`)
        await fs.mkdir(path.dirname(emitPath), { recursive: true })
        await fs.writeFile(
          emitPath,
          JSON.stringify(
            {
              level: golden.level,
              ...(golden.levelData !== undefined
                ? { levelData: golden.levelData }
                : {}),
              inputs: out,
              initial: replay.initial,
              hashes: replay.hashes,
              final: last ? serializeState(last) : replay.initial,
              status: replay.finalStatus,
            },
            null,
            1,
          ),
          'utf8',
        )
        report.emitted = name
      }
    }

    console.log(
      `${name}: ${golden.inputs.length} -> ${out.length} ` +
        `(${solvedSegments}/${waypointIdx.length} segs` +
        `${wiredIndex !== undefined ? `, -> level ${wiredIndex}` : ', unwired'}` +
        `${verified ? '' : ', FALLBACK'})`,
    )
  }

  console.log(
    `resolve: wired=${tally.wired} unwired=${tally.unwired} ` +
      `shorter=${tally.improved} fallback=${tally.failed}`,
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
  // with wastar's deeper dives, then beam — beam wins are valid but
  // neither optimal nor exhaustive, so the report records which strategy
  // produced them.
  const strategy = (argValue('strategy') ?? 'auto') as SolveStrategy | 'auto'
  if (
    !['bfs', 'greedy', 'astar', 'wastar', 'beam', 'macro', 'auto'].includes(
      strategy,
    )
  ) {
    throw new Error(
      '--strategy must be bfs, greedy, astar, wastar, beam, macro, or auto',
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
  const resolveDir = argValue('resolve-goldens')
  const skipDir = argValue('skip-goldens')

  if (resolveDir) {
    await resolveGoldens(
      path.resolve(process.cwd(), resolveDir),
      emitDir ? path.resolve(process.cwd(), emitDir) : undefined,
      only,
      { k: modK, n: modN },
    )
    return
  }

  // `--improve-goldens <dir>` re-solves every recorded golden with BFS
  // bounded to inputs.length-1: `solved` means a strictly shorter path
  // exists (emitted when --emit-goldens is set), `exhausted` proves the
  // recording was already optimal, `cutoff` stays unknown.
  if (improveDir) {
    const root = path.resolve(process.cwd(), improveDir)
    const files = walkJson(root).filter((f) => f.endsWith('.json'))
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

  // `--skip-goldens <dir>` drops levels a recorded golden already binds
  // to — replay coverage exists for them, so sweep time is better spent
  // on boards nobody has beaten under this engine.
  const skipIndices = new Set<number>()
  if (skipDir) {
    const root = path.resolve(process.cwd(), skipDir)
    const campaign: CampaignEntry[] = levels.map((source, index) => ({
      index,
      data: parseLevel(source),
    }))
    const bySignature = new Map<string, number[]>()
    const byTitle = new Map<string, number[]>()
    for (const entry of campaign) {
      const sig = layoutSignature(entry.data)
      bySignature.set(sig, [...(bySignature.get(sig) ?? []), entry.index])
      const titleKey = normalizeTitle(entry.data.title)
      byTitle.set(titleKey, [...(byTitle.get(titleKey) ?? []), entry.index])
    }
    for (const file of walkJson(root).filter((f) => f.endsWith('.json'))) {
      const golden = JSON.parse(readFileSync(file, 'utf8')) as {
        level: string
        levelIndex?: number
        levelData?: LevelData
        inputs: string
      }
      if (golden.levelIndex !== undefined) {
        skipIndices.add(golden.levelIndex)
        continue
      }
      const fixture =
        golden.levelData ??
        parseLevel(readFileSync(path.join(root, '..', golden.level), 'utf8'))
      const wired = findCampaignIndex(
        fixture,
        compressInputs(fixture, golden.inputs),
        campaign,
        bySignature,
        byTitle,
      )
      if (wired !== undefined) skipIndices.add(wired)
    }
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
        skipIndices.has(index) ||
        (only !== undefined && !title.toLowerCase().includes(only)))
    ) {
      tally.skipped += 1
      continue
    }

    const initial = createInitialState(data, index)
    const t0 = Date.now()
    // Auto escalates granularity before heuristics, with budgets shaped to
    // each stage's marginal value: bfs's frontier explodes exponentially
    // so extra seconds buy almost no depth — a third of the budget is
    // plenty; macro and wastar dive differently enough to earn most of
    // the rest; beam keeps the full budget as the last resort.
    const first: SolveStrategy = strategy === 'auto' ? 'bfs' : strategy
    let result = solveState(
      initial,
      strategy === 'auto'
        ? { ...caps, deadlineMs: Math.max(1000, caps.deadlineMs * 0.3) }
        : caps,
      first,
    )
    let used = first
    if (result.kind === 'cutoff' && strategy === 'auto') {
      result = solveState(initial, {
        ...caps,
        deadlineMs: caps.deadlineMs * 0.8,
      }, 'macro')
      used = 'macro'
    }
    if (result.kind === 'cutoff' && strategy === 'auto') {
      result = solveState(initial, {
        ...caps,
        deadlineMs: caps.deadlineMs * 0.8,
      }, 'wastar')
      used = 'wastar'
    }
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
