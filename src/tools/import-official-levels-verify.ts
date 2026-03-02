import { DEFAULT_OBJECT_ASSIGNMENTS } from './import-official-levels-default-assignments.js'
import { normalizeRawName, parseCurrobjEntries, tileKeyToObjectId, toTileKey } from './import-official-levels-parse.js'
import { buildLevelTileMap } from './import-official-levels-tile-map.js'

import type { ParsedLayer } from './import-official-levels-binary.js'
import type { LdData, TileDescriptor } from './import-official-levels-parse.js'
import type { GlobalReference } from './import-official-levels-global-reference.js'

export type VerifySample = {
  fileName: string
  tileKey: string
  expected: string
  actual: string
}

export type VerifyResult = {
  levels: number
  currobjTilePairs: number
  ambiguousCurrobjTiles: number
  tileMapMismatches: number
  usedTileTruthChecks: number
  usedTileTruthMismatches: number
  unknownTileKeys: string[]
  samples: VerifySample[]
}

type ParsedOfficialLevelInput = {
  fileName: string
  ld: LdData
  layers: ParsedLayer[]
}

const describeTile = (tile: TileDescriptor): string =>
  `${tile.isText ? 'text_' : ''}${tile.name}`

const tileEquals = (a: TileDescriptor, b: TileDescriptor): boolean =>
  a.name === b.name && a.isText === b.isText

export const verifyOfficialImportConsistency = (
  parsed: ParsedOfficialLevelInput[],
  global: GlobalReference,
): VerifyResult => {
  let currobjTilePairs = 0
  let ambiguousCurrobjTiles = 0
  let tileMapMismatches = 0
  let usedTileTruthChecks = 0
  let usedTileTruthMismatches = 0
  const samples: VerifySample[] = []
  const unknownTileCounts = new Map<string, number>()

  for (const level of parsed) {
    const tileMap = buildLevelTileMap(level.ld, global)
    const expectedByTile = new Map<string, TileDescriptor>()
    const ambiguous = new Set<string>()
    for (const entry of parseCurrobjEntries(level.ld)) {
      if (!entry.tileKey || !entry.name) continue
      currobjTilePairs += 1
      const expected = normalizeRawName(entry.name, false)
      const existing = expectedByTile.get(entry.tileKey)
      if (existing && !tileEquals(existing, expected)) {
        ambiguous.add(entry.tileKey)
        continue
      }
      expectedByTile.set(entry.tileKey, expected)
    }
    ambiguousCurrobjTiles += ambiguous.size

    for (const [tileKey, expected] of expectedByTile.entries()) {
      const actual = tileMap.get(tileKey)
      if (actual && tileEquals(actual, expected)) continue
      tileMapMismatches += 1
      if (samples.length < 30) {
        samples.push({
          fileName: level.fileName,
          tileKey,
          expected: describeTile(expected),
          actual: actual ? describeTile(actual) : '<missing>',
        })
      }
    }

    const firstLayer = level.layers[0]
    if (!firstLayer) continue
    const rawWidth = firstLayer.width
    const rawHeight = firstLayer.height
    const crop = rawWidth > 2 && rawHeight > 2
    const minX = crop ? 1 : 0
    const minY = crop ? 1 : 0
    const maxX = crop ? rawWidth - 2 : rawWidth - 1
    const maxY = crop ? rawHeight - 2 : rawHeight - 1

    for (const layer of level.layers) {
      if (layer.width !== rawWidth || layer.height !== rawHeight) continue
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const index = y * rawWidth + x
          const tileX = layer.main[index * 2] ?? 255
          const tileY = layer.main[index * 2 + 1] ?? 255
          if (tileX === 255 && tileY === 255) continue
          const tileKey = toTileKey(tileX, tileY)
          const expected = expectedByTile.get(tileKey)
          if (expected) {
            usedTileTruthChecks += 1
            const actual = tileMap.get(tileKey)
            if (actual && tileEquals(actual, expected)) continue
            usedTileTruthMismatches += 1
          }
          const objectId = tileKeyToObjectId(tileKey)
          const fallback =
            objectId !== null ? DEFAULT_OBJECT_ASSIGNMENTS[objectId] : undefined
          if (!tileMap.get(tileKey) && !fallback) {
            unknownTileCounts.set(tileKey, (unknownTileCounts.get(tileKey) ?? 0) + 1)
          }
        }
      }
    }
  }

  const unknownTileKeys = Array.from(unknownTileCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tileKey]) => tileKey)

  return {
    levels: parsed.length,
    currobjTilePairs,
    ambiguousCurrobjTiles,
    tileMapMismatches,
    usedTileTruthChecks,
    usedTileTruthMismatches,
    unknownTileKeys,
    samples,
  }
}
