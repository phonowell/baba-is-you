#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'
import { parseLevelBinary } from './import-official-levels-binary.js'
import { convertOneLevel } from './import-official-levels-convert.js'
import { buildGlobalReference } from './import-official-levels-global-reference.js'
import { verifyOfficialImportConsistency } from './import-official-levels-verify.js'
import { parseLd } from './import-official-levels-parse.js'

import type { ParsedLayer } from './import-official-levels-binary.js'
import type { ConvertedLevel, TextTileCounts } from './import-official-levels-convert.js'
import type { VerifyResult } from './import-official-levels-verify.js'
import type { LdData } from './import-official-levels-parse.js'

type InitialCapability = {
  hasYou: boolean
  hasWin: boolean
}

type ImportFilterReason =
  | 'missing-you'
  | 'missing-you_text-win_text'
  | 'many-facing_text'
  | 'unknown-card'
  | 'name-index'

type FilteredOutLevel = {
  fileName: string
  reasons: ImportFilterReason[]
  hasYou: boolean
  hasWin: boolean
  titleRaw: string
  textTiles: TextTileCounts
  unknownTileCount: number
}

type ParsedOfficialLevel = {
  fileName: string
  ld: LdData
  layers: ParsedLayer[]
}

const FACING_TEXT_FILTER_THRESHOLD = 5

const renderLevelsTs = (levels: ConvertedLevel[]): string => {
  const blocks = levels.map((level) => `  \`\n${level.body}\n\`,`).join('\n')
  return `export const levels = [\n${blocks}\n] as const\n`
}

const renderLevelsIndex = (
  chunkSpecs: Array<{ importPath: string; identifier: string }>,
): string => {
  const imports = chunkSpecs
    .map(
      (chunk) =>
        `import { levels as ${chunk.identifier} } from '${chunk.importPath}'`,
    )
    .join('\n')
  const spreads = chunkSpecs.map((chunk) => `  ...${chunk.identifier},`).join('\n')

  return `${imports}\n\nexport const levels = [\n${spreads}\n] as const\n`
}

const parseSortKey = (
  fileName: string,
) => {
  const base = path.basename(fileName).toLowerCase()
  const numeric = base.match(/^(\d+)level\.l$/i)?.[1]
  if (numeric) return [0, '', Number(numeric), base] as const

  const prefixed = base.match(/^([a-z])(\d+)level\.l$/i)
  if (prefixed?.[1] && prefixed[2])
    return [1, prefixed[1].toLowerCase(), Number(prefixed[2]), base] as const

  return [2, '', Number.MAX_SAFE_INTEGER, base] as const
}

const byLevelFileOrder = (a: string, b: string): number => {
  const [ag, al, an, ar] = parseSortKey(a)
  const [bg, bl, bn, br] = parseSortKey(b)
  if (ag !== bg) return ag - bg
  if (al !== bl) return al.localeCompare(bl)
  if (an !== bn) return an - bn
  return ar.localeCompare(br)
}

const checkInitialCapability = (level: ConvertedLevel): InitialCapability => {
  const parsedLevel = parseLevel(level.body)
  const initialState = createInitialState(parsedLevel, 0)
  return {
    hasYou: initialState.items.some((item) => item.props.includes('you')),
    hasWin: initialState.items.some((item) => item.props.includes('win')),
  }
}

const loadParsedOfficialLevels = async (
  sourceDir: string,
): Promise<ParsedOfficialLevel[]> => {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  const lFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.l'))
    .map((entry) => entry.name)
    .sort(byLevelFileOrder)
  if (!lFiles.length) throw new Error(`No .l file found in ${sourceDir}`)

  const parsed: ParsedOfficialLevel[] = []
  for (const fileName of lFiles) {
    const ldPath = path.join(sourceDir, fileName.replace(/\.l$/i, '.ld'))
    const [lBuffer, ldSource] = await Promise.all([
      fs.readFile(path.join(sourceDir, fileName)),
      fs.readFile(ldPath, 'utf8'),
    ])
    parsed.push({
      fileName,
      ld: parseLd(ldSource),
      layers: parseLevelBinary(lBuffer),
    })
  }
  return parsed
}

const logVerifyResult = (verify: VerifyResult): void => {
  console.log(`Verified levels: ${verify.levels}`)
  console.log(`Currobj tile pairs: ${verify.currobjTilePairs}`)
  console.log(`Ambiguous currobj tiles: ${verify.ambiguousCurrobjTiles}`)
  console.log(`Tile map mismatches: ${verify.tileMapMismatches}`)
  console.log(`Used tile truth checks: ${verify.usedTileTruthChecks}`)
  console.log(`Used tile truth mismatches: ${verify.usedTileTruthMismatches}`)
  console.log(`Unknown tile keys after crop: ${verify.unknownTileKeys.length}`)
  if (verify.samples.length) {
    for (const sample of verify.samples.slice(0, 20)) {
      console.log(
        `mismatch ${sample.fileName} ${sample.tileKey} expected=${sample.expected} actual=${sample.actual}`,
      )
    }
  }
  if (verify.unknownTileKeys.length) {
    console.log(`unknown keys: ${verify.unknownTileKeys.join(' ')}`)
  }
}

const collectConvertedLevels = (
  parsed: ParsedOfficialLevel[],
  global: ReturnType<typeof buildGlobalReference>,
): {
  converted: ConvertedLevel[]
  filteredOut: FilteredOutLevel[]
  filteredReasonCounts: Map<ImportFilterReason, number>
} => {
  const converted: ConvertedLevel[] = []
  const filteredOut: FilteredOutLevel[] = []
  const filteredReasonCounts = new Map<ImportFilterReason, number>()
  const countFilteredReason = (reason: ImportFilterReason): void => {
    filteredReasonCounts.set(reason, (filteredReasonCounts.get(reason) ?? 0) + 1)
  }

  for (const current of parsed) {
    const { level, unknownTileKeys, meta } = convertOneLevel(
      current.fileName,
      current.ld,
      current.layers,
      global,
    )
    const { hasYou, hasWin } = checkInitialCapability(level)
    const reasons: ImportFilterReason[] = []
    if (!hasYou) reasons.push('missing-you')
    if (
      meta.textTiles.youTextCount === 0 &&
      meta.textTiles.winTextCount === 0
    )
      reasons.push('missing-you_text-win_text')
    if (meta.textTiles.facingTextCount >= FACING_TEXT_FILTER_THRESHOLD)
      reasons.push('many-facing_text')
    if (unknownTileKeys.length > 0) reasons.push('unknown-card')
    if (meta.titleRaw.trim().toLowerCase() === 'index') reasons.push('name-index')
    if (reasons.length) {
      for (const reason of reasons) countFilteredReason(reason)
      filteredOut.push({
        fileName: current.fileName,
        reasons,
        hasYou,
        hasWin,
        titleRaw: meta.titleRaw,
        textTiles: meta.textTiles,
        unknownTileCount: unknownTileKeys.length,
      })
      continue
    }
    converted.push(level)
  }

  return { converted, filteredOut, filteredReasonCounts }
}

const logImportSummary = (
  converted: ConvertedLevel[],
  filteredOut: FilteredOutLevel[],
  filteredReasonCounts: Map<ImportFilterReason, number>,
  chunkCount: number,
): void => {
  console.log(`Imported official levels: ${converted.length}`)
  console.log(`Filtered levels: ${filteredOut.length}`)
  const reasonOrder: ImportFilterReason[] = [
    'missing-you',
    'missing-you_text-win_text',
    'many-facing_text',
    'unknown-card',
    'name-index',
  ]
  for (const reason of reasonOrder) {
    const count = filteredReasonCounts.get(reason) ?? 0
    console.log(`Filtered ${reason}: ${count}`)
  }
  const missingWinCount = converted
    .map((level) => checkInitialCapability(level))
    .filter((capability) => !capability.hasWin).length
  console.log(`Levels missing win (kept): ${missingWinCount}`)
  console.log(`Generated chunks: ${chunkCount}`)
  console.log('Unknown tile keys in kept levels: 0')
  if (filteredOut.length) {
    const preview = filteredOut.slice(0, 10)
    for (const level of preview) {
      console.log(
        `filtered ${level.fileName}: ${level.reasons.join(',')} you=${level.hasYou ? '1' : '0'} win=${level.hasWin ? '1' : '0'} you_text=${level.textTiles.youTextCount} win_text=${level.textTiles.winTextCount} facing_text=${level.textTiles.facingTextCount} unknown=${level.unknownTileCount} name=${level.titleRaw}`,
      )
    }
  }
}

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const sourceDir = path.resolve(cwd, 'data', 'baba')
  const verifyOnly = process.argv.includes('--verify')
  const outputFile = path.resolve(cwd, 'src', 'levels.ts')
  const outputDir = path.resolve(cwd, 'src', 'levels-data')
  const parsed = await loadParsedOfficialLevels(sourceDir)
  const global = buildGlobalReference(parsed)
  if (verifyOnly) {
    const verify = verifyOfficialImportConsistency(parsed, global)
    logVerifyResult(verify)
    if (
      verify.ambiguousCurrobjTiles > 0 ||
      verify.tileMapMismatches > 0 ||
      verify.usedTileTruthMismatches > 0
    ) {
      throw new Error('Official import consistency verification failed')
    }
    return
  }

  const { converted, filteredOut, filteredReasonCounts } = collectConvertedLevels(
    parsed,
    global,
  )

  await fs.rm(outputDir, { recursive: true, force: true })
  await fs.mkdir(outputDir, { recursive: true })

  const chunkSpecs: Array<{ importPath: string; identifier: string }> = []
  const chunkSize = 50
  for (let start = 0; start < converted.length; start += chunkSize) {
    const chunk = converted.slice(start, start + chunkSize)
    const index = String(Math.floor(start / chunkSize)).padStart(2, '0')
    const fileName = `${index}-official.ts`
    const absPath = path.join(outputDir, fileName)
    await fs.writeFile(absPath, renderLevelsTs(chunk), 'utf8')
    chunkSpecs.push({
      importPath: `./levels-data/${fileName.replace(/\.ts$/, '.js')}`,
      identifier: `levels_${index}`,
    })
  }

  await fs.writeFile(outputFile, renderLevelsIndex(chunkSpecs), 'utf8')
  logImportSummary(converted, filteredOut, filteredReasonCounts, chunkSpecs.length)
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
